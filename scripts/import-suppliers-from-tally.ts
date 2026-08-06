/**
 * Import suppliers from a Tally "All Masters" XML export (UTF-16).
 *
 * Sources ledgers under:
 *   - Sundry Creditors
 *   - Raw Material Creditor
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/import-suppliers-from-tally.ts "/Users/jai/Downloads/Master.xml"
 */
import fs from "node:fs";
import path from "node:path";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { sql } from "drizzle-orm";

const SUPPLIER_PARENTS = new Set([
  "Sundry Creditors",
  "Raw Material Creditor",
]);

type ParsedSupplier = {
  name: string;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  phone: string | null;
};

function decodeXmlFile(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 2) {
    // UTF-16 LE BOM or null bytes in odd positions
    if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString("utf16le");
    if (buf[0] === 0xfe && buf[1] === 0xff) {
      // swap to LE then decode
      const swapped = Buffer.alloc(buf.length - 2);
      for (let i = 2; i + 1 < buf.length; i += 2) {
        swapped[i - 2] = buf[i + 1];
        swapped[i - 1] = buf[i];
      }
      return swapped.toString("utf16le");
    }
    if (buf[1] === 0x00) return buf.toString("utf16le");
  }
  return buf.toString("utf8");
}

function unescapeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function tagValue(body: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const m = body.match(re);
  if (!m) return null;
  const v = unescapeXml(m[1]);
  return v || null;
}

function allTagValues(body: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const v = unescapeXml(m[1]);
    if (v) out.push(v);
  }
  return out;
}

function digitsOnly(value: string | null): string | null {
  if (!value) return null;
  const d = value.replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d || null;
}

function normalizeGstin(value: string | null): string | null {
  if (!value) return null;
  const g = value.toUpperCase().replace(/\s+/g, "");
  return /^[0-9A-Z]{15}$/.test(g) ? g : null;
}

function normalizePan(value: string | null, gstin: string | null): string | null {
  if (value) {
    const p = value.toUpperCase().replace(/\s+/g, "");
    if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p)) return p;
  }
  if (gstin && gstin.length === 15) {
    const fromGst = gstin.slice(2, 12);
    if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(fromGst)) return fromGst;
  }
  return null;
}

function extractCity(addressLines: string[]): string | null {
  for (let i = addressLines.length - 1; i >= 0; i--) {
    const line = addressLines[i];
    if (/cell|ph\s*:|g\s*pay|mobile|email|@/i.test(line)) continue;
    const pinCity = line.match(/^([A-Za-z][A-Za-z .'-]{1,40}?)\s*[-,]?\s*\d{6}/);
    if (pinCity) return pinCity[1].trim();
    if (line.length <= 40 && !/\d{5,}/.test(line)) return line;
  }
  return null;
}

function extractPhoneFromAddress(addressLines: string[]): string | null {
  const joined = addressLines.join(" ");
  const m =
    joined.match(/(?:cell|mobile|ph(?:one)?)\s*[:\-]?\s*([0-9 +\-\/,]{10,})/i) ||
    joined.match(/\b([6-9]\d{9})\b/);
  return m ? digitsOnly(m[1]) : null;
}

function parseSuppliers(xml: string): ParsedSupplier[] {
  const ledgerRe = /<LEDGER\b([^>]*)>([\s\S]*?)<\/LEDGER>/gi;
  const byName = new Map<string, ParsedSupplier>();
  let match: RegExpExecArray | null;

  while ((match = ledgerRe.exec(xml)) !== null) {
    const attrs = match[1];
    const body = match[2];
    const parent = tagValue(body, "PARENT");
    if (!parent || !SUPPLIER_PARENTS.has(parent)) continue;

    const nameAttr = attrs.match(/\bNAME="([^"]*)"/i);
    const name = unescapeXml(
      nameAttr?.[1] || tagValue(body, "MAILINGNAME") || ""
    );
    if (!name) continue;

    const gstin = normalizeGstin(
      tagValue(body, "PARTYGSTIN") || tagValue(body, "GSTIN")
    );
    const pan = normalizePan(tagValue(body, "INCOMETAXNUMBER"), gstin);
    const addressLines = allTagValues(body, "ADDRESS");
    const address = addressLines.length ? addressLines.join(", ") : null;
    const city = extractCity(addressLines);
    const state =
      tagValue(body, "STATENAME") ||
      tagValue(body, "LEDGERSTATE") ||
      tagValue(body, "STATE");
    const pinRaw = tagValue(body, "PINCODE");
    const pinCode = pinRaw && /^\d{6}$/.test(pinRaw.replace(/\s/g, ""))
      ? pinRaw.replace(/\s/g, "")
      : null;
    const phone =
      digitsOnly(
        tagValue(body, "LEDGERMOBILE") ||
          tagValue(body, "LEDGERPHONE") ||
          tagValue(body, "PHONENUMBER")
      ) || extractPhoneFromAddress(addressLines);

    byName.set(name, {
      name,
      gstin,
      pan,
      address,
      city,
      state,
      pinCode,
      phone,
    });
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function main() {
  const fileArg = process.argv[2];
  const filePath = path.resolve(
    fileArg || path.join(process.env.HOME || "", "Downloads", "Master.xml")
  );

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log(`Reading ${filePath}…`);
  const xml = decodeXmlFile(filePath);
  const rows = parseSuppliers(xml);
  console.log(`Parsed ${rows.length} supplier ledgers`);

  if (rows.length === 0) {
    console.log("Nothing to import.");
    process.exit(0);
  }

  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const result = await db.execute(sql`
      INSERT INTO suppliers (name, gstin, pan, address, city, state, pin_code, phone, contact)
      VALUES (
        ${row.name},
        ${row.gstin},
        ${row.pan},
        ${row.address},
        ${row.city},
        ${row.state},
        ${row.pinCode},
        ${row.phone},
        ${row.phone}
      )
      ON CONFLICT (name) DO UPDATE SET
        gstin = COALESCE(EXCLUDED.gstin, suppliers.gstin),
        pan = COALESCE(EXCLUDED.pan, suppliers.pan),
        address = COALESCE(EXCLUDED.address, suppliers.address),
        city = COALESCE(EXCLUDED.city, suppliers.city),
        state = COALESCE(EXCLUDED.state, suppliers.state),
        pin_code = COALESCE(EXCLUDED.pin_code, suppliers.pin_code),
        phone = COALESCE(EXCLUDED.phone, suppliers.phone),
        contact = COALESCE(EXCLUDED.contact, suppliers.contact)
      RETURNING (xmax = 0) AS is_insert
    `);

    const rowsOut = Array.isArray(result)
      ? result
      : ((result as { rows?: unknown[] }).rows ?? []);
    const first = rowsOut[0] as { is_insert?: boolean | number | string } | undefined;
    const flag = first?.is_insert;
    const isInsert = flag === true || flag === "t" || flag === 1 || flag === "1";
    if (isInsert) inserted += 1;
    else updated += 1;

    if ((i + 1) % 50 === 0 || i + 1 === rows.length) {
      process.stdout.write(`\r  Processed ${i + 1}/${rows.length}`);
    }
  }
  console.log();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(suppliers);

  console.log(`Inserted: ${inserted}, updated: ${updated}`);
  console.log(`Suppliers in DB: ${count}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

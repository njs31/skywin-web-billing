/**
 * GST state-code and tax-id resolution for the Zoho Books sync.
 *
 * Zoho's India edition wants place_of_supply as a 2-letter state code (e.g.
 * "TN"), not the 2-digit GST numeric code skywin-bill already works in
 * (lib/gst-states.ts). Only "TN" has actually been exercised against a real
 * Zoho call (the pilot push) — the rest of this table is the standard
 * NIC-published abbreviation set used across e-way bill tooling, high
 * confidence but not yet verified one-by-one against this org.
 */
const GST_CODE_TO_ZOHO_STATE: Record<string, string> = {
  "01": "JK",
  "02": "HP",
  "03": "PB",
  "04": "CH",
  "05": "UK",
  "06": "HR",
  "07": "DL",
  "08": "RJ",
  "09": "UP",
  "10": "BR",
  "11": "SK",
  "12": "AR",
  "13": "NL",
  "14": "MN",
  "15": "MZ",
  "16": "TR",
  "17": "ML",
  "18": "AS",
  "19": "WB",
  "20": "JH",
  "21": "OD",
  "22": "CG",
  "23": "MP",
  "24": "GJ",
  "26": "DN",
  "27": "MH",
  "29": "KA",
  "30": "GA",
  "31": "LD",
  "32": "KL",
  "33": "TN",
  "34": "PY",
  "35": "AN",
  "36": "TS",
  "37": "AP",
  "38": "LA",
};

/** 2-digit GST state code from a GSTIN, or "" if unreadable. */
export function gstStateCode(gstin: string | null | undefined): string {
  const code = (gstin ?? "").trim().slice(0, 2);
  return /^\d{2}$/.test(code) ? code : "";
}

/** Zoho's 2-letter place-of-supply code for a GSTIN. Throws on an unknown
 *  state code rather than silently mistagging place of supply. */
export function zohoStateCode(gstin: string | null | undefined): string {
  const code = gstStateCode(gstin);
  const zoho = GST_CODE_TO_ZOHO_STATE[code];
  if (!zoho) {
    throw new Error(
      `Can't resolve a Zoho state code from GSTIN "${gstin}" (state code "${code}").`
    );
  }
  return zoho;
}

import { zohoRequest } from "./client";

type ZohoTax = {
  tax_id: string;
  tax_name: string;
  tax_percentage: number;
  tax_specific_type?: string; // "igst" for the interstate ones
};

let taxCache: ZohoTax[] | null = null;

async function listTaxes(): Promise<ZohoTax[]> {
  if (taxCache) return taxCache;
  const res = await zohoRequest<{ taxes: ZohoTax[] }>("GET", "/settings/taxes", {
    query: { per_page: 200 },
  });
  taxCache = res.taxes;
  return taxCache;
}

/**
 * The Zoho tax_id for a GST rate, intra- or inter-state. Matches by name
 * (`GST{rate}` for intra, `IGST{rate}` for inter) rather than a hardcoded id,
 * since tax_ids are org-specific and this needs to keep working if the org's
 * taxes are ever recreated. Rate is formatted without a trailing ".0" to
 * match Zoho's naming (GST18, not GST18.0), but with one decimal for
 * fractional rates (GST0.25 exists for some categories).
 */
export async function resolveTaxId(rate: number, interstate: boolean): Promise<string> {
  const taxes = await listTaxes();
  const rateLabel = Number.isInteger(rate) ? String(rate) : String(rate);
  const name = `${interstate ? "IGST" : "GST"}${rateLabel}`;
  const match = taxes.find(
    (t) => t.tax_name === name && t.tax_percentage === rate
  );
  if (!match) {
    throw new Error(
      `No Zoho tax named "${name}" (${rate}%) found in this org's Taxes settings. ` +
        `Create it in Zoho (Settings → Taxes) before syncing invoices at this rate.`
    );
  }
  return match.tax_id;
}

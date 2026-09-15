/**
 * One-off: dump a Zoho organization's profile and/or a contact by ID, to
 * debug e-invoice field validation errors. Run like the other scripts/
 * zoho-*.ts files (see zoho-backfill.ts's header).
 *
 *   npx tsx scripts/zoho-inspect.ts org
 *   npx tsx scripts/zoho-inspect.ts contact <contactId>
 */
import { zohoRequest } from "@/lib/zoho/client";
import { zohoOrgId } from "@/lib/zoho/client";

async function main() {
  const [what, id] = process.argv.slice(2);
  if (what === "org") {
    const res = await zohoRequest("GET", `/organizations/${zohoOrgId()}`);
    console.log(JSON.stringify(res, null, 2));
  } else if (what === "contact" && id) {
    const res = await zohoRequest("GET", `/contacts/${id}`);
    console.log(JSON.stringify(res, null, 2));
  } else {
    throw new Error("Usage: zoho-inspect.ts org | contact <contactId>");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

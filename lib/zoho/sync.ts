/**
 * Push a skywin-bill sale into Zoho Books as an invoice.
 *
 * The transform here (flat per-line `discount`, the solved rounding
 * `adjustment`) is exactly what the manual pilot proved against 3 real
 * invoices — see git history around "Zoho Books" for that trail. This just
 * makes it a reusable, idempotent function instead of one-off MCP calls.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { stateNameFromGstin } from "@/lib/gst-states";
import { zohoRequest } from "./client";
import { resolveTaxId, zohoStateCode, gstStateCode } from "./gst";

export type SyncSaleItem = {
  productName: string;
  hsnCode: string;
  unit: string;
  qty: number;
  /** Pre-discount unit rate. */
  rate: number;
  /** Authoritative post-discount taxable value for the line — Zoho's line
   *  total is forced to match this exactly via a computed flat discount. */
  amount: number;
  gstRate: number;
};

export type SyncCustomer = {
  name: string;
  gstin: string;
  phone: string | null;
  address: string | null;
  district: string | null;
  pinCode: string | null;
};

export type SyncSale = {
  invoiceNo: string;
  /** yyyy-mm-dd */
  date: string;
  grandTotal: number;
  /** >0 means this sale was billed interstate (IGST, not CGST+SGST). */
  igst: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Predicts what Zoho's tax total will come out to, so the invoice-level
 * `adjustment` can be solved for in one shot instead of create-then-patch.
 * Zoho rounds each tax component (CGST, SGST) per rate group independently;
 * skywin-bill rounds the combined GST once then splits it, so the two can
 * differ by a paisa or two — this is what absorbs that into round-off.
 */
function predictZohoTax(items: SyncSaleItem[], interstate: boolean): number {
  const byRate = new Map<number, number>();
  for (const item of items) {
    byRate.set(item.gstRate, (byRate.get(item.gstRate) ?? 0) + item.amount);
  }
  let tax = 0;
  for (const [rate, taxable] of byRate) {
    if (interstate) {
      tax += round2((taxable * rate) / 100);
    } else {
      const half = round2((taxable * (rate / 2)) / 100);
      tax += 2 * half;
    }
  }
  return round2(tax);
}

const GENERIC_ITEM_SETTING_KEY = "zoho_generic_item_id";

/**
 * The one generic Zoho item every invoice line points to (with name/rate/
 * HSN/tax overridden per line) — see the "Add a 38×25mm bulk label PDF"-era
 * commits for why: one item avoids creating 80+ product records in Zoho's
 * catalog for a line-level-only integration. Cached in skywin's own
 * `settings` table so it survives a restart.
 */
export async function ensureGenericItem(): Promise<string> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, GENERIC_ITEM_SETTING_KEY))
    .limit(1);
  if (row?.value) return row.value;

  const search = await zohoRequest<{ items: { item_id: string }[] }>(
    "GET",
    "/items",
    { query: { name: "Sales line item" } }
  );
  let itemId = search.items?.[0]?.item_id;

  if (!itemId) {
    const created = await zohoRequest<{ item: { item_id: string } }>(
      "POST",
      "/items",
      {
        body: {
          name: "Sales line item",
          rate: 0,
          product_type: "goods",
          item_type: "sales",
          is_taxable: true,
          description:
            "Generic line used for invoices imported from skywin-bill; name, rate, HSN and tax are set per line.",
        },
      }
    );
    itemId = created.item.item_id;
  }

  await db
    .insert(settings)
    .values({ key: GENERIC_ITEM_SETTING_KEY, value: itemId })
    .onConflictDoUpdate({ target: settings.key, set: { value: itemId } });

  return itemId;
}

/** Finds the Zoho contact by GSTIN, creating one if none exists yet. */
export async function ensureContact(customer: SyncCustomer): Promise<string> {
  const search = await zohoRequest<{ contacts: { contact_id: string }[] }>(
    "GET",
    "/contacts",
    { query: { gst_no: customer.gstin } }
  );
  if (search.contacts?.length) return search.contacts[0]!.contact_id;

  const stateCode = gstStateCode(customer.gstin);
  const created = await zohoRequest<{ contact: { contact_id: string } }>(
    "POST",
    "/contacts",
    {
      body: {
        contact_name: customer.name,
        company_name: customer.name,
        contact_type: "customer",
        customer_sub_type: "business",
        gst_treatment: "business_gst",
        gst_no: customer.gstin,
        place_of_contact: zohoStateCode(customer.gstin),
        is_taxable: true,
        billing_address: {
          address: customer.address ?? "",
          city: customer.district ?? "",
          state: stateNameFromGstin(customer.gstin, ""),
          state_code: stateCode,
          zip: customer.pinCode ?? "",
          country: "India",
        },
        contact_persons: customer.phone
          ? [{ first_name: "Accounts", phone: customer.phone, is_primary_contact: true }]
          : undefined,
      },
    }
  );
  return created.contact.contact_id;
}

export type UpsertResult = {
  zohoInvoiceId: string;
  zohoContactId: string;
  subtotal: number;
  tax: number;
  adjustment: number;
  total: number;
};

/**
 * Creates the invoice in Zoho. Callers must check the sale doesn't already
 * have a `zohoInvoiceId` before calling this — it always creates, never
 * updates, since an invoice that already has an IRN shouldn't be touched.
 */
export async function upsertInvoice(input: {
  sale: SyncSale;
  items: SyncSaleItem[];
  customer: SyncCustomer;
}): Promise<UpsertResult> {
  const { sale, items, customer } = input;
  if (!customer.gstin) {
    throw new Error(
      `${sale.invoiceNo}: customer has no GSTIN — only B2B sales sync to Zoho.`
    );
  }
  if (items.length === 0) {
    throw new Error(`${sale.invoiceNo}: no line items to sync.`);
  }

  const interstate = sale.igst > 0;

  const distinctRates = [...new Set(items.map((i) => i.gstRate))];
  const taxIdByRate = new Map<number, string>();
  for (const rate of distinctRates) {
    taxIdByRate.set(rate, await resolveTaxId(rate, interstate));
  }

  const genericItemId = await ensureGenericItem();
  const zohoContactId = await ensureContact(customer);

  const line_items = items.map((item) => {
    const discount = round2(item.rate * item.qty - item.amount);
    return {
      item_id: genericItemId,
      name: item.productName.slice(0, 100),
      hsn_or_sac: item.hsnCode || "",
      product_type: "goods",
      unit: (item.unit || "pcs").slice(0, 20),
      quantity: item.qty,
      rate: item.rate,
      discount: discount > 0 ? discount : 0,
      tax_id: taxIdByRate.get(item.gstRate),
    };
  });

  const subtotal = round2(items.reduce((sum, i) => sum + i.amount, 0));
  const tax = predictZohoTax(items, interstate);
  const adjustment = round2(sale.grandTotal - subtotal - tax);

  const created = await zohoRequest<{ invoice: { invoice_id: string } }>(
    "POST",
    "/invoices",
    {
      query: { ignore_auto_number_generation: true, send: false },
      body: {
        customer_id: zohoContactId,
        invoice_number: sale.invoiceNo,
        date: sale.date,
        gst_treatment: "business_gst",
        gst_no: customer.gstin,
        place_of_supply: zohoStateCode(customer.gstin),
        is_inclusive_tax: false,
        is_discount_before_tax: true,
        discount_type: "item_level",
        adjustment,
        adjustment_description: "Round off",
        notes: `Imported from skywin-bill (${sale.invoiceNo})`,
        line_items,
      },
    }
  );

  return {
    zohoInvoiceId: created.invoice.invoice_id,
    zohoContactId,
    subtotal,
    tax,
    adjustment,
    total: round2(subtotal + tax + adjustment),
  };
}

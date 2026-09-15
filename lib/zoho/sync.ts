/**
 * Push a skywin-bill sale into Zoho Books as an invoice.
 *
 * The transform here (flat per-line `discount`, the solved rounding
 * `adjustment`) is exactly what the manual pilot proved against 3 real
 * invoices — see git history around "Zoho Books" for that trail. This just
 * makes it a reusable, idempotent function instead of one-off MCP calls.
 */
import { eq } from "drizzle-orm";
import { format } from "date-fns";
import { db } from "@/db";
import { sales, settings } from "@/db/schema";
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

/**
 * Shared shape for a sale plus its line items, loose enough to cover both
 * `getSaleById`'s return type and the plain rows scripts/zoho-backfill.ts
 * builds itself.
 */
type SyncableSale = {
  invoiceNo: string;
  date: string | Date;
  grandTotal: unknown;
  igst: unknown;
  customerRecordName: string | null;
  customerName: string | null;
  customerGstin: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerDistrict: string | null;
  customerPinCode: string | null;
  items: {
    productName: string | null;
    customName: string | null;
    hsnCode: string | null;
    unit: string | null;
    qty: unknown;
    rate: unknown;
    amount: unknown;
    gstRate: unknown;
  }[];
};

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/** Builds the `upsertInvoice` payload from a loaded sale. Lives here (a
 *  plain module, not a "use server" file) so both the e-Invoice server
 *  actions and scripts/zoho-backfill.ts (no request context) can share it. */
export function toSyncInputs(sale: SyncableSale): {
  syncSale: SyncSale;
  customer: SyncCustomer;
  items: SyncSaleItem[];
} {
  const syncSale: SyncSale = {
    invoiceNo: sale.invoiceNo,
    date: format(new Date(sale.date), "yyyy-MM-dd"),
    grandTotal: num(sale.grandTotal),
    igst: num(sale.igst),
  };
  const customer: SyncCustomer = {
    name: sale.customerRecordName || sale.customerName || "Customer",
    gstin: (sale.customerGstin || "").trim(),
    phone: sale.customerPhone,
    address: sale.customerAddress,
    district: sale.customerDistrict,
    pinCode: sale.customerPinCode,
  };
  const items: SyncSaleItem[] = sale.items.map((item) => ({
    productName: String(item.productName || item.customName || "Item"),
    hsnCode: item.hsnCode || "",
    unit: item.unit || "pcs",
    qty: num(item.qty),
    rate: num(item.rate),
    amount: num(item.amount),
    gstRate: num(item.gstRate),
  }));
  return { syncSale, customer, items };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Zoho's `invoice_number` field caps at 16 characters. Most skywin-bill
 * invoices fit (`SKYA/0407/26-27` = 15), but the `INV-YYYYMMDD-####` format
 * used for most of 2026 is 17 — one over. Stripping the redundant "INV-"
 * prefix (the date already says it's an invoice) gets those under the cap
 * while staying unique and still traceable back to the source number, which
 * is also kept in full in the invoice's `notes`.
 */
function zohoInvoiceNumber(invoiceNo: string): string {
  if (invoiceNo.length <= 16) return invoiceNo;
  const stripped = invoiceNo.replace(/^INV-/, "");
  return stripped.length <= 16 ? stripped : stripped.slice(0, 16);
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

  // Two different "state code" formats are in play here: `stateCode` is
  // the numeric GST state code (e.g. "33"), which is what Zoho's address
  // `state_code` field wants; `placeOfContact` is Zoho's own 2-letter
  // abbreviation (e.g. "TN"), which is what `place_of_contact` wants.
  // Conflating them silently mistags the contact's state.
  const stateCode = gstStateCode(customer.gstin);
  const placeOfContact = zohoStateCode(customer.gstin);
  const billingAddress = {
    address: customer.address ?? "",
    city: customer.district ?? "",
    state: stateNameFromGstin(customer.gstin, ""),
    state_code: stateCode,
    zip: customer.pinCode ?? "",
    country: "India",
  };

  if (search.contacts?.length) {
    const contactId = search.contacts[0]!.contact_id;
    // Refresh the existing contact's address/name on every sync, rather
    // than reusing it untouched. Without this, fixing an incomplete
    // customer address in our own software (e.g. from the e-Invoice
    // page's "Fix customer details" link) would never reach a Zoho
    // contact that was already created — every later e-invoice push
    // would keep failing on the same stale address.
    try {
      await zohoRequest("PUT", `/contacts/${contactId}`, {
        body: {
          contact_name: customer.name,
          company_name: customer.name,
          gst_treatment: "business_gst",
          gst_no: customer.gstin,
          place_of_contact: placeOfContact,
          billing_address: billingAddress,
        },
      });
    } catch (err) {
      // Non-fatal: worst case a push downstream fails with the same
      // "missing/invalid address" error it would have without this
      // refresh — no worse off than before.
      console.error(
        "[Zoho] Failed to refresh contact",
        contactId,
        err instanceof Error ? err.message : err
      );
    }
    return contactId;
  }

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
        place_of_contact: placeOfContact,
        is_taxable: true,
        billing_address: billingAddress,
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

  // The invoice-level `adjustment` becomes the e-invoice schema's "Other
  // Charges" once pushed to the IRP, and the IRP rejects a negative value
  // there (confirmed against a real push — see git history). Our own
  // rounding can land on either side of zero, so when it would be negative,
  // absorb the shortfall into the highest-value line's discount instead
  // (this is exactly what the line-level discount already represents) and
  // let the resulting adjustment land at zero or a small positive residual.
  let syncedItems = items;
  let subtotal = round2(items.reduce((sum, i) => sum + i.amount, 0));
  let tax = predictZohoTax(items, interstate);
  let adjustment = round2(sale.grandTotal - subtotal - tax);

  if (adjustment < 0) {
    const shortfall = -adjustment;
    const idx = items.reduce(
      (best, item, i) => (item.amount > items[best]!.amount ? i : best),
      0
    );
    const target = items[idx]!;
    if (target.amount - shortfall >= 0) {
      syncedItems = items.map((item, i) =>
        i === idx ? { ...item, amount: round2(item.amount - shortfall) } : item
      );
      subtotal = round2(syncedItems.reduce((sum, i) => sum + i.amount, 0));
      tax = predictZohoTax(syncedItems, interstate);
      adjustment = round2(sale.grandTotal - subtotal - tax);
    }
    // Still negative (or the target line was too small to absorb it) —
    // clamp to zero. Off by a few paise on Zoho's own total, never on ours.
    adjustment = Math.max(0, adjustment);
  }

  const line_items = syncedItems.map((item) => {
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

  const created = await zohoRequest<{ invoice: { invoice_id: string } }>(
    "POST",
    "/invoices",
    {
      query: { ignore_auto_number_generation: true, send: false },
      body: {
        customer_id: zohoContactId,
        invoice_number: zohoInvoiceNumber(sale.invoiceNo),
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

/**
 * Fire-and-forget push of a just-created B2B sale to Zoho Books, mirroring
 * scheduleQwicksStockPush's pattern in lib/queries/qwicks.ts: called from
 * createSale without awaiting, so a slow or down Zoho API never delays
 * checkout. Errors are logged AND persisted to `zohoSyncError` (not thrown
 * — the sale itself always succeeds regardless of Zoho) so a failure isn't
 * only visible in the server log: a failed auto-sync leaves zohoInvoiceId
 * null and zohoSyncError set, for the next manual push (the e-Invoice/
 * e-Way Bill pages, or the backfill script) to pick up and retry.
 */
export function scheduleZohoSync(saleId: number) {
  void autoSyncSaleToZoho(saleId).catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Zoho] Auto-sync failed for sale", saleId, message);
    try {
      await db
        .update(sales)
        .set({ zohoSyncError: message })
        .where(eq(sales.id, saleId));
    } catch (writeErr) {
      console.error("[Zoho] Also failed to record the sync error:", writeErr);
    }
  });
}

async function autoSyncSaleToZoho(saleId: number): Promise<void> {
  // Dynamic import: lib/queries/sales.ts imports scheduleZohoSync from this
  // file, so a static import back would cycle.
  const { getSaleById } = await import("@/lib/queries/sales");
  const sale = await getSaleById(saleId);
  if (!sale) return;
  if (sale.status !== "active") return;
  if (sale.zohoInvoiceId) return;
  if (!sale.customerGstin?.trim()) return; // B2C — nothing to push.

  const { syncSale, customer, items } = toSyncInputs(sale);
  const result = await upsertInvoice({ sale: syncSale, items, customer });

  await db
    .update(sales)
    .set({
      zohoInvoiceId: result.zohoInvoiceId,
      zohoContactId: result.zohoContactId,
      zohoSyncError: null,
    })
    .where(eq(sales.id, saleId));
}

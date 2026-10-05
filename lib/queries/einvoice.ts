/**
 * Reads for the e-Invoice / e-Way Bill page: which active sales still need
 * pushing, bucketed the same way the page renders them. Deliberately NOT
 * filtered to GST-registered customers at this level — an e-way bill
 * applies to goods movement above the value threshold regardless of the
 * buyer's registration, so an unregistered ("URP") customer's sale is a
 * legitimate e-way bill candidate even though it's never an e-Invoice
 * candidate. The e-Invoice page filters with isValidGstin itself; see
 * einvoiceMissingFields for how it also surfaces "not GST-registered" as
 * a reason, not just missing address fields.
 */
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { sales, customers, saleReturns } from "@/db/schema";
import { isValidGstin } from "@/lib/gst";
import { isCreditNoteEinvoiceEligible } from "@/lib/whitebooks/irn-payload";

export { isValidGstin };

/** The IRP's reporting window — an invoice older than this can no longer
 *  be pushed for an IRN at all. Matches the 30-day rule checked against the
 *  live catalogue while scoping this feature. */
export const EINVOICE_REPORTING_WINDOW_DAYS = 30;

/**
 * AATO (₹ crore) at/above which the IRP enforces the 30-day reporting
 * window. CURRENT OFFICIAL RULE (GSTN advisory 05.11.2024, effective
 * 01.04.2025): enforced only for AATO ≥ 10cr; "no such reporting
 * restriction on taxpayers with an AATO of less than 10 crores as of now".
 */
export const IRP_30DAY_WINDOW_AATO_CRORE = 10;

/**
 * Whether the 30-day push block applies to this business. Business AATO is
 * ₹5–10cr (below the 10cr threshold), so the block does NOT apply — older
 * FY bills stay pushable (duplicates and FY boundaries are still enforced
 * by the IRP itself). Pass an explicit AATO to evaluate other bands.
 */
export function isIrpReportingWindowEnforced(aatoCrore?: number): boolean {
  if (aatoCrore == null) return false;
  return aatoCrore >= IRP_30DAY_WINDOW_AATO_CRORE;
}

/** True when `date` is still inside the (possibly inapplicable) window. */
export function isWithinReportingWindow(date: Date, aatoCrore?: number): boolean {
  if (!isIrpReportingWindowEnforced(aatoCrore)) return true;
  const ageMs = Date.now() - date.getTime();
  return ageMs <= EINVOICE_REPORTING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

export type EinvoiceRow = {
  id: number;
  invoiceNo: string;
  date: Date;
  grandTotal: string;
  igst: string;
  customerId: number | null;
  customerName: string | null;
  customerGstin: string | null;
  customerAddress: string | null;
  customerDistrict: string | null;
  customerPinCode: string | null;
  einvoiceStatus: string;
  irn: string | null;
  ackDate: Date | null;
  einvoiceError: string | null;
  ewbStatus: string;
  ewbId: string | null;
  ewbNo: string | null;
  ewbGeneratedAt: Date | null;
  ewbValidUntil: Date | null;
  ewbError: string | null;
  /** Dispatch details, if already entered at billing time — when all three
   *  are present the e-Way Bill page can push in one click instead of
   *  asking for them again. */
  vehicleNo: string | null;
  transporterName: string | null;
  transporterGstin: string | null;
  distanceKm: string | null;
};

/** Candidate sales for the e-Invoice / e-Way Bill pages.
 *
 *  CURRENT BEHAVIOR → OFFICIAL RULE → PROPOSED (and implemented) BEHAVIOR:
 *  - Was: only active sales from the last 30 days were listed/pushable.
 *  - Official rule (GSTN advisory 05.11.2024, effective 01.04.2025): the
 *    30-day IRP reporting window binds only AATO ≥ ₹10cr taxpayers; below
 *    that there is "no such reporting restriction … as of now".
 *  - This business (AATO ₹5–10cr) is below the threshold, so by default
 *    (`windowDays = null`) there is NO date filter — newest first, capped
 *    at 500 rows like the Sale Book. Pass an explicit `windowDays` to
 *    re-impose a window (e.g. if AATO crosses 10cr — then also flip
 *    `isIrpReportingWindowEnforced`'s default).
 *
 *  Note the e-Way Bill page shares this list: e-way bills never had a
 *  30-day IRP rule at all, so lifting the filter fixes that page's scope
 *  as a side effect.
 */
export async function getEinvoiceCandidates(
  windowDays: number | null = null
): Promise<EinvoiceRow[]> {
  const base = db
    .select({
      id: sales.id,
      invoiceNo: sales.invoiceNo,
      date: sales.date,
      grandTotal: sales.grandTotal,
      igst: sales.igst,
      customerId: sales.customerId,
      customerName: customers.name,
      customerGstin: customers.gstin,
      customerAddress: customers.address,
      customerDistrict: customers.district,
      customerPinCode: customers.pinCode,
      einvoiceStatus: sales.einvoiceStatus,
      irn: sales.irn,
      ackDate: sales.ackDate,
      einvoiceError: sales.einvoiceError,
      ewbStatus: sales.ewbStatus,
      ewbId: sales.ewbId,
      ewbNo: sales.ewbNo,
      ewbGeneratedAt: sales.ewbGeneratedAt,
      ewbValidUntil: sales.ewbValidUntil,
      ewbError: sales.ewbError,
      vehicleNo: sales.vehicleNo,
      transporterName: sales.transporterName,
      transporterGstin: sales.transporterGstin,
      distanceKm: sales.distanceKm,
    })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id));

  if (windowDays == null) {
    return base
      .where(eq(sales.status, "active"))
      .orderBy(desc(sales.date))
      .limit(500);
  }

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);
  return base
    .where(and(eq(sales.status, "active"), gte(sales.date, windowStart)))
    .orderBy(sales.date);
}

/**
 * Fields the government's e-invoice schema requires for the buyer's
 * address, plus the one requirement that isn't fixable by editing
 * anything: e-Invoicing only applies to a GST-registered (B2B) customer
 * at all — a "URP" placeholder or a genuinely unregistered customer
 * never becomes eligible no matter what else is filled in. All the
 * address fields live on the *customer* record, not the sale — so fixing
 * those means editing the customer, not the invoice. Empty array = ready
 * to push.
 */
export function einvoiceMissingFields(row: {
  customerGstin: string | null;
  customerAddress: string | null;
  customerDistrict: string | null;
  customerPinCode: string | null;
}): string[] {
  if (!isValidGstin(row.customerGstin)) {
    return ["Not GST-registered — e-Invoicing doesn't apply"];
  }
  const missing: string[] = [];
  if (!row.customerAddress?.trim()) missing.push("Customer address");
  if (!row.customerDistrict?.trim()) missing.push("Customer city");
  if (!row.customerPinCode?.trim()) missing.push("Customer PIN code");
  return missing;
}

/**
 * Dispatch details the e-way bill push needs. These live on the *sale*
 * (entered at billing time, or fixable afterward) — transporter GSTIN is
 * left optional since a transporter may not be GST-registered.
 * Empty array = ready to push.
 */
export type CreditNoteEinvoiceRow = {
  id: number;
  returnNo: string;
  date: Date;
  grandTotal: string;
  customerId: number | null;
  customerName: string | null;
  customerGstin: string | null;
  customerAddress: string | null;
  customerDistrict: string | null;
  customerPinCode: string | null;
  saleBillType: string | null;
  saleInvoiceNo: string | null;
  einvoiceStatus: string;
  irn: string | null;
  ackDate: Date | null;
  einvoiceError: string | null;
};

export async function getCreditNoteEinvoiceCandidates(): Promise<
  CreditNoteEinvoiceRow[]
> {
  const rows = await db
    .select({
      id: saleReturns.id,
      returnNo: saleReturns.returnNo,
      date: saleReturns.date,
      grandTotal: saleReturns.grandTotal,
      customerId: saleReturns.customerId,
      customerName: customers.name,
      customerGstin: customers.gstin,
      customerAddress: customers.address,
      customerDistrict: customers.district,
      customerPinCode: customers.pinCode,
      saleBillType: sales.billType,
      saleInvoiceNo: sales.invoiceNo,
      einvoiceStatus: saleReturns.einvoiceStatus,
      irn: saleReturns.irn,
      ackDate: saleReturns.ackDate,
      einvoiceError: saleReturns.einvoiceError,
    })
    .from(saleReturns)
    .innerJoin(sales, eq(saleReturns.saleId, sales.id))
    .leftJoin(customers, eq(saleReturns.customerId, customers.id))
    .where(eq(sales.status, "active"))
    .orderBy(desc(saleReturns.date))
    .limit(200);

  return rows.filter((row) =>
    isCreditNoteEinvoiceEligible({
      billType: row.saleBillType,
      customerGstin: row.customerGstin,
    })
  );
}

export function ewayBillMissingFields(row: {
  vehicleNo: string | null;
  transporterName: string | null;
  distanceKm: string | null;
}): string[] {
  const missing: string[] = [];
  if (!row.vehicleNo?.trim()) missing.push("Vehicle number");
  if (!row.transporterName?.trim()) missing.push("Transporter name");
  if (row.distanceKm == null) missing.push("Distance");
  return missing;
}

/**
 * Reads for the e-Invoice / e-Way Bill page: which active, GSTIN-bearing
 * sales still need pushing, bucketed the same way the page renders them.
 */
import { and, eq, gte, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { sales, customers } from "@/db/schema";

/** The IRP's reporting window — an invoice older than this can no longer
 *  be pushed for an IRN at all. Matches the 30-day rule checked against the
 *  live catalogue while scoping this feature. */
export const EINVOICE_REPORTING_WINDOW_DAYS = 30;

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
  zohoInvoiceId: string | null;
  /** Set when the initial Zoho invoice sync itself failed (auto or
   *  manual) — distinct from einvoiceError/ewbError, which are about the
   *  later IRN/e-way-bill push. */
  zohoSyncError: string | null;
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

/** Active, B2B (GSTIN present) sales within the IRP's reporting window. */
export async function getEinvoiceCandidates(): Promise<EinvoiceRow[]> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - EINVOICE_REPORTING_WINDOW_DAYS);

  return db
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
      zohoInvoiceId: sales.zohoInvoiceId,
      zohoSyncError: sales.zohoSyncError,
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
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(
      and(
        eq(sales.status, "active"),
        isNotNull(customers.gstin),
        ne(customers.gstin, ""),
        gte(sales.date, windowStart)
      )
    )
    .orderBy(sales.date);
}

/**
 * Fields the government's e-invoice schema requires for the buyer's
 * address that we don't already guarantee (GSTIN is guaranteed by the
 * candidate query itself). All three live on the *customer* record, not
 * the sale — so fixing them means editing the customer, not the invoice.
 * Empty array = ready to push.
 */
export function einvoiceMissingFields(row: {
  customerAddress: string | null;
  customerDistrict: string | null;
  customerPinCode: string | null;
}): string[] {
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

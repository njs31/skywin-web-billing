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
  customerName: string | null;
  customerGstin: string | null;
  zohoInvoiceId: string | null;
  einvoiceStatus: string;
  irn: string | null;
  einvoiceError: string | null;
  ewbStatus: string;
  ewbNo: string | null;
  ewbValidUntil: Date | null;
  ewbError: string | null;
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
      customerName: customers.name,
      customerGstin: customers.gstin,
      zohoInvoiceId: sales.zohoInvoiceId,
      einvoiceStatus: sales.einvoiceStatus,
      irn: sales.irn,
      einvoiceError: sales.einvoiceError,
      ewbStatus: sales.ewbStatus,
      ewbNo: sales.ewbNo,
      ewbValidUntil: sales.ewbValidUntil,
      ewbError: sales.ewbError,
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

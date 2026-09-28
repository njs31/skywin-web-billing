"use server";

/**
 * Server actions for e-Invoice (IRN) / e-Way Bill generation.
 *
 * The Zoho Books-mediated GSP integration that used to back these was
 * removed outright (not phased out) in favor of a direct whitebooks.in
 * integration — see the "remove Zoho, move to whitebooks.in" work. That
 * replacement isn't built yet: every generation path below is a clear,
 * deliberate stub until it is, rather than left silently broken by a
 * missing import. `updateDispatchDetails` is untouched — it only ever
 * wrote to this app's own `sales` row, no GSP involved.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sales } from "@/db/schema";
import { getSaleById } from "@/lib/queries/sales";
import { EINVOICE_REPORTING_WINDOW_DAYS } from "@/lib/queries/einvoice";
import { requireNonDealer } from "@/lib/actions/auth";
import { isValidGstin } from "@/lib/gst";

const NOT_CONFIGURED =
  "e-Invoice/e-Way Bill generation is being moved to whitebooks.in and " +
  "isn't wired up yet. Nothing was sent anywhere.";

type LoadedSale = NonNullable<Awaited<ReturnType<typeof getSaleById>>>;

/** Any active sale with a customer on file — GSTIN not required, since an
 *  e-way bill applies to goods movement regardless of the buyer's GST
 *  registration. Only e-Invoicing itself (loadActiveB2bSale) is legally
 *  gated by GSTIN. */
async function loadActiveSale(saleId: number): Promise<LoadedSale> {
  const sale = await getSaleById(saleId);
  if (!sale) throw new Error("Sale not found.");
  if (sale.status !== "active") {
    throw new Error(`${sale.invoiceNo} is ${sale.status}, not active — can't generate.`);
  }
  if (!sale.customerId) {
    throw new Error(`${sale.invoiceNo} has no customer on file.`);
  }
  return sale;
}

/** Active sale to a GST-registered customer — the actual legal boundary
 *  for e-Invoicing (B2B/export only; a placeholder like "URP" for an
 *  unregistered customer doesn't count, however real their purchase was). */
async function loadActiveB2bSale(saleId: number): Promise<LoadedSale> {
  const sale = await loadActiveSale(saleId);
  if (!isValidGstin(sale.customerGstin)) {
    throw new Error(
      `${sale.invoiceNo}: e-Invoicing applies to GST-registered B2B customers ` +
        `only — this customer has no valid GSTIN on file.`
    );
  }
  return sale;
}

function withinReportingWindow(date: Date): boolean {
  const ageMs = Date.now() - date.getTime();
  return ageMs <= EINVOICE_REPORTING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/** Generates the e-Invoice/IRN for one sale. STUB — see file header. */
export async function generateIrn(saleId: number): Promise<never> {
  await requireNonDealer();
  const sale = await loadActiveB2bSale(saleId);

  if (sale.irn) {
    throw new Error(`${sale.invoiceNo} already has an IRN — can't push twice.`);
  }
  if (!withinReportingWindow(new Date(sale.date))) {
    throw new Error(
      `${sale.invoiceNo} is older than the IRP's ${EINVOICE_REPORTING_WINDOW_DAYS}-day reporting window.`
    );
  }

  throw new Error(NOT_CONFIGURED);
}

/** Cancels a pushed e-Invoice. STUB — see file header. */
export async function cancelIrn(_saleId: number, _reason: string): Promise<never> {
  await requireNonDealer();
  throw new Error(NOT_CONFIGURED);
}

/** Generates the e-Way Bill for one sale. STUB — see file header. */
export async function generateEwb(
  saleId: number,
  _dispatch: DispatchDetails = {}
): Promise<never> {
  await requireNonDealer();
  await loadActiveSale(saleId);
  throw new Error(NOT_CONFIGURED);
}

/** Cancels a generated e-Way Bill. STUB — see file header. */
export async function cancelEwb(_saleId: number, _reason: string): Promise<never> {
  await requireNonDealer();
  throw new Error(NOT_CONFIGURED);
}

export type DispatchDetails = {
  vehicleNumber?: string;
  transporterName?: string;
  /** GSTIN of the transporter, if they're GST-registered. */
  transporterGstin?: string;
  /** km, approximate. */
  distanceKm?: number;
  /** "road" | "rail" | "air" | "ship". */
  transportMode?: string;
};

/**
 * Saves dispatch details on a sale WITHOUT attempting to generate an
 * e-way bill — for fixing a "missing details" invoice ahead of time. Only
 * touches these fields on skywin-bill's own `sales` row; no third party
 * involved, so this keeps working regardless of the stubs above.
 */
export async function updateDispatchDetails(
  saleId: number,
  dispatch: DispatchDetails
) {
  await requireNonDealer();
  await db
    .update(sales)
    .set({
      vehicleNo: dispatch.vehicleNumber?.trim() || null,
      transporterName: dispatch.transporterName?.trim() || null,
      transporterGstin: dispatch.transporterGstin?.trim() || null,
      transportMode: dispatch.transportMode ?? null,
      distanceKm: dispatch.distanceKm != null ? String(dispatch.distanceKm) : null,
    })
    .where(eq(sales.id, saleId));
}

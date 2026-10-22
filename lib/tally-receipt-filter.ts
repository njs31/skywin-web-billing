import { isValidGstin } from "@/lib/gst";

export type TallyReceiptInvoice = {
  paymentMode: string | null;
  gstin: string | null;
  status: string | null;
};

/**
 * Receipt sheet keeps a row only when it is allocated to a credit invoice
 * or to an invoice whose customer has a real GSTIN. Cash and UPI bills
 * without GST, and receipts with no invoice, are left out.
 */
export function tallyReceiptIncluded(invoices: TallyReceiptInvoice[]): boolean {
  return invoices.some((invoice) => {
    if (invoice.status === "cancelled") return false;
    if (invoice.paymentMode === "credit") return true;
    return isValidGstin(invoice.gstin);
  });
}

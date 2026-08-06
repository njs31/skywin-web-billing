import { formatCurrency, formatDateTimeIST, formatNumber } from "@/lib/utils";

type CreditNote = {
  returnNo: string;
  date: Date | string;
  reason?: string | null;
  saleInvoiceNo?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerGstin?: string | null;
  customerAddress?: string | null;
  subtotal: string;
  cgst: string;
  sgst: string;
  grandTotal: string;
};

type CreditNoteItem = {
  productName: string | null;
  customName?: string | null;
  hsnCode: string | null;
  qty: string;
  rate: string;
  gstRate: string;
  amount: string;
};

type CreditNoteTemplateProps = {
  business: {
    name: string;
    tagline: string;
    address: string;
    phone: string;
    email: string;
    gstin: string;
    state: string;
    stateCode: string;
  };
  creditNote: CreditNote;
  items: CreditNoteItem[];
};

export function CreditNoteTemplate({
  business,
  creditNote,
  items,
}: CreditNoteTemplateProps) {
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-slate-900 print:p-4 border shadow-sm">
      {/* Business Header */}
      <div className="border-b-2 border-slate-900 pb-4 text-center">
        <h1 className="text-xl font-bold uppercase">{business.name}</h1>
        <h2 className="text-lg font-semibold">{business.tagline}</h2>
        <p className="mt-2 text-xs">{business.address}</p>
        <p className="text-xs">
          Phone: {business.phone} | {business.email}
        </p>
        <p className="text-xs font-semibold">GSTIN: {business.gstin}</p>
      </div>

      {/* Title */}
      <div className="mt-4 text-center">
        <span className="inline-block border border-slate-900 px-4 py-1 text-sm font-bold uppercase tracking-wider">
          SALES RETURN
        </span>
      </div>

      {/* Credit Note Details */}
      <div className="mt-4 flex justify-between text-xs">
        <div>
          <p>
            <span className="font-semibold">Credit Note No:</span>{" "}
            {creditNote.returnNo}
          </p>
          <p>
            <span className="font-semibold">Date:</span>{" "}
            {formatDateTimeIST(creditNote.date)}
          </p>
          {creditNote.saleInvoiceNo && (
            <p>
              <span className="font-semibold">Against Invoice No:</span>{" "}
              {creditNote.saleInvoiceNo}
            </p>
          )}
          {creditNote.reason && (
            <p>
              <span className="font-semibold">Reason:</span> {creditNote.reason}
            </p>
          )}
          {creditNote.customerName && (
            <p>
              <span className="font-semibold">Customer:</span>{" "}
              {creditNote.customerName}
              {creditNote.customerPhone && ` (${creditNote.customerPhone})`}
            </p>
          )}
          {creditNote.customerAddress && (
            <p>
              <span className="font-semibold">Address:</span>{" "}
              {creditNote.customerAddress}
            </p>
          )}
          {creditNote.customerGstin && (
            <p>
              <span className="font-semibold">Customer GSTIN:</span>{" "}
              {creditNote.customerGstin}
            </p>
          )}
        </div>
        <div className="text-right">
          <p>
            <span className="font-semibold">Document Type:</span> SALES RETURN
          </p>
          <p>
            <span className="font-semibold">Place of Supply:</span>{" "}
            {business.state} ({business.stateCode})
          </p>
        </div>
      </div>

      {/* Table */}
      <table className="mt-6 w-full border-collapse text-xs">
        <thead>
          <tr className="border-y border-slate-900 bg-slate-50">
            <th className="px-2 py-2 text-left">#</th>
            <th className="px-2 py-2 text-left">Item</th>
            <th className="px-2 py-2 text-left">HSN</th>
            <th className="px-2 py-2 text-right">Qty</th>
            <th className="px-2 py-2 text-right">Rate</th>
            <th className="px-2 py-2 text-right">GST%</th>
            <th className="px-2 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="border-b border-slate-200">
              <td className="px-2 py-2">{idx + 1}</td>
              <td className="px-2 py-2">
                {item.productName ?? item.customName ?? "Custom Item"}
              </td>
              <td className="px-2 py-2">{item.hsnCode ?? "-"}</td>
              <td className="px-2 py-2 text-right">
                {formatNumber(item.qty, 2)}
              </td>
              <td className="px-2 py-2 text-right">
                {formatNumber(item.rate, 2)}
              </td>
              <td className="px-2 py-2 text-right">
                {formatNumber(item.gstRate, 0)}%
              </td>
              <td className="px-2 py-2 text-right">
                {formatCurrency(item.amount)}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={7} className="px-2 py-4 text-center text-slate-400">
                No items recorded
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1 text-xs">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCurrency(creditNote.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>CGST</span>
            <span>{formatCurrency(creditNote.cgst)}</span>
          </div>
          <div className="flex justify-between">
            <span>SGST</span>
            <span>{formatCurrency(creditNote.sgst)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-900 pt-2 text-base font-bold">
            <span>Grand Total</span>
            <span>{formatCurrency(creditNote.grandTotal)}</span>
          </div>
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-slate-500">
        Thank you for shopping at {business.tagline}
      </p>
    </div>
  );
}

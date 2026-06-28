import { formatCurrency, formatNumber, toNumber } from "@/lib/utils";

type InvoiceSale = {
  invoiceNo: string;
  date: Date | string;
  billType?: string | null;
  customerName?: string | null;
  customerRecordName?: string | null;
  customerPhone?: string | null;
  customerGstin?: string | null;
  paymentMode: string;
  operatorName?: string | null;
  subtotal: string;
  discountAmount?: string | null;
  cgst: string;
  sgst: string;
  igst: string;
  grandTotal: string;
  paidAmount?: string | null;
};

type InvoiceItem = {
  productName: string | null;
  customName?: string | null;
  hsnCode: string | null;
  qty: string;
  rate: string;
  discountPercent?: string | null;
  discountType?: string | null;
  discountValue?: string | null;
  gstRate: string;
  amount: string;
};

type InvoiceTemplateProps = {
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
  sale: InvoiceSale;
  items: InvoiceItem[];
};

export function InvoiceTemplate({ business, sale, items }: InvoiceTemplateProps) {
  const customer =
    sale.customerRecordName ?? sale.customerName ?? null;

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-slate-900 print:p-4">
      <div className="border-b-2 border-slate-900 pb-4 text-center">
        <h1 className="text-xl font-bold uppercase">{business.name}</h1>
        <h2 className="text-lg font-semibold">{business.tagline}</h2>
        <p className="mt-2 text-xs">{business.address}</p>
        <p className="text-xs">
          Phone: {business.phone} | {business.email}
        </p>
        <p className="text-xs font-semibold">GSTIN: {business.gstin}</p>
      </div>

      <div className="mt-4 flex justify-between text-xs">
        <div>
          <p>
            <span className="font-semibold">Invoice No:</span> {sale.invoiceNo}
          </p>
          <p>
            <span className="font-semibold">Date:</span>{" "}
            {new Date(sale.date).toLocaleString("en-IN")}
          </p>
          <p>
            <span className="font-semibold">Bill Type:</span>{" "}
            {(sale.billType ?? "retail").toUpperCase()}
          </p>
          {customer && (
            <p>
              <span className="font-semibold">Customer:</span> {customer}
              {sale.customerPhone && ` (${sale.customerPhone})`}
            </p>
          )}
          {sale.customerGstin && (
            <p>
              <span className="font-semibold">Customer GSTIN:</span>{" "}
              {sale.customerGstin}
            </p>
          )}
        </div>
        <div className="text-right">
          <p>
            <span className="font-semibold">Payment:</span>{" "}
            {sale.paymentMode.toUpperCase()}
          </p>
          {sale.operatorName && (
            <p>
              <span className="font-semibold">Operator:</span>{" "}
              {sale.operatorName}
            </p>
          )}
          <p>
            <span className="font-semibold">Place of Supply:</span>{" "}
            {business.state} ({business.stateCode})
          </p>
        </div>
      </div>

      <table className="mt-6 w-full border-collapse text-xs">
        <thead>
          <tr className="border-y border-slate-900 bg-slate-50">
            <th className="px-2 py-2 text-left">#</th>
            <th className="px-2 py-2 text-left">Item</th>
            <th className="px-2 py-2 text-left">HSN</th>
            <th className="px-2 py-2 text-right">Qty</th>
            <th className="px-2 py-2 text-right">Rate</th>
            <th className="px-2 py-2 text-right">Disc%</th>
            <th className="px-2 py-2 text-right">GST%</th>
            <th className="px-2 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="border-b border-slate-200">
              <td className="px-2 py-2">{idx + 1}</td>
              <td className="px-2 py-2">{item.productName ?? item.customName ?? "Custom Item"}</td>
              <td className="px-2 py-2">{item.hsnCode ?? "-"}</td>
              <td className="px-2 py-2 text-right">
                {formatNumber(item.qty, 2)}
              </td>
              <td className="px-2 py-2 text-right">
                {formatNumber(item.rate, 2)}
              </td>
              <td className="px-2 py-2 text-right">
                {toNumber(item.discountPercent) > 0
                  ? `${formatNumber(item.discountPercent!, 0)}%`
                  : "-"}
              </td>
              <td className="px-2 py-2 text-right">
                {formatNumber(item.gstRate, 0)}%
              </td>
              <td className="px-2 py-2 text-right">
                {formatCurrency(item.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1 text-xs">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCurrency(sale.subtotal)}</span>
          </div>
          {toNumber(sale.discountAmount) > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Discount</span>
              <span>-{formatCurrency(sale.discountAmount!)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>CGST</span>
            <span>{formatCurrency(sale.cgst)}</span>
          </div>
          <div className="flex justify-between">
            <span>SGST</span>
            <span>{formatCurrency(sale.sgst)}</span>
          </div>
          {toNumber(sale.igst) > 0 && (
            <div className="flex justify-between">
              <span>IGST</span>
              <span>{formatCurrency(sale.igst)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-900 pt-2 text-base font-bold">
            <span>Grand Total</span>
            <span>{formatCurrency(sale.grandTotal)}</span>
          </div>
          {toNumber(sale.paidAmount) > 0 &&
            toNumber(sale.paidAmount) < toNumber(sale.grandTotal) && (
              <div className="flex justify-between text-amber-600">
                <span>Paid</span>
                <span>{formatCurrency(sale.paidAmount!)}</span>
              </div>
            )}
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-slate-500">
        Thank you for shopping at {business.tagline}
      </p>
    </div>
  );
}

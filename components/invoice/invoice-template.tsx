import { BUSINESS } from "@/lib/business";
import { formatCurrency, formatNumber, toNumber } from "@/lib/utils";
import type { Sale } from "@/db/schema";

type InvoiceItem = {
  productName: string;
  hsnCode: string | null;
  qty: string;
  rate: string;
  gstRate: string;
  amount: string;
};

type InvoiceTemplateProps = {
  sale: Sale;
  items: InvoiceItem[];
};

export function InvoiceTemplate({ sale, items }: InvoiceTemplateProps) {
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-slate-900 print:p-4">
      <div className="border-b-2 border-slate-900 pb-4 text-center">
        <h1 className="text-xl font-bold uppercase">{BUSINESS.name}</h1>
        <h2 className="text-lg font-semibold">{BUSINESS.tagline}</h2>
        <p className="mt-2 text-xs">{BUSINESS.address}</p>
        <p className="text-xs">
          Phone: {BUSINESS.phone} | {BUSINESS.email}
        </p>
        <p className="text-xs font-semibold">GSTIN: {BUSINESS.gstin}</p>
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
          {sale.customerName && (
            <p>
              <span className="font-semibold">Customer:</span>{" "}
              {sale.customerName}
            </p>
          )}
        </div>
        <div className="text-right">
          <p>
            <span className="font-semibold">Payment:</span>{" "}
            {sale.paymentMode.toUpperCase()}
          </p>
          <p>
            <span className="font-semibold">Place of Supply:</span>{" "}
            {BUSINESS.state} ({BUSINESS.stateCode})
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
            <th className="px-2 py-2 text-right">GST%</th>
            <th className="px-2 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="border-b border-slate-200">
              <td className="px-2 py-2">{idx + 1}</td>
              <td className="px-2 py-2">{item.productName}</td>
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
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1 text-xs">
          <div className="flex justify-between">
            <span>Taxable Value</span>
            <span>{formatCurrency(sale.subtotal)}</span>
          </div>
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
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-slate-500">
        Thank you for shopping at {BUSINESS.tagline}
      </p>
    </div>
  );
}

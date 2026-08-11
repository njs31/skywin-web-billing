import { formatCurrency, formatDateTimeIST, formatNumber } from "@/lib/utils";

type PurchaseOrder = {
  poNumber: string;
  date: Date | string;
  status?: string | null;
  notes?: string | null;
  customerName?: string | null;
  customerRecordName?: string | null;
  customerPhone?: string | null;
  customerRecordPhone?: string | null;
  customerGstin?: string | null;
  customerAddress?: string | null;
  subtotal: string;
  grandTotal: string;
};

type PurchaseOrderItem = {
  productName: string | null;
  customName?: string | null;
  hsnCode: string | null;
  qty: string;
  rate: string;
  amount: string;
  unit?: string | null;
};

type PurchaseOrderTemplateProps = {
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
  purchaseOrder: PurchaseOrder;
  items: PurchaseOrderItem[];
};

export function PurchaseOrderTemplate({
  business,
  purchaseOrder,
  items,
}: PurchaseOrderTemplateProps) {
  const customerName =
    purchaseOrder.customerRecordName ||
    purchaseOrder.customerName ||
    "Customer";
  const customerPhone =
    purchaseOrder.customerRecordPhone || purchaseOrder.customerPhone;

  return (
    <div className="print-sheet mx-auto max-w-3xl border bg-white p-8 text-sm text-slate-900 shadow-sm print:p-4">
      <div className="border-b-2 border-slate-900 pb-4 text-center">
        <h1 className="text-xl font-bold uppercase">{business.name}</h1>
        <h2 className="text-lg font-semibold">{business.tagline}</h2>
        <p className="mt-2 text-xs">{business.address}</p>
        <p className="text-xs">
          Phone: {business.phone} | {business.email}
        </p>
        <p className="text-xs font-semibold">GSTIN: {business.gstin}</p>
      </div>

      <div className="mt-4 text-center">
        <span className="inline-block border border-slate-900 px-4 py-1 text-sm font-bold uppercase tracking-wider">
          Purchase Order
        </span>
      </div>

      <div className="mt-4 flex justify-between text-xs">
        <div>
          <p>
            <span className="font-semibold">PO No:</span>{" "}
            {purchaseOrder.poNumber}
          </p>
          <p>
            <span className="font-semibold">Date:</span>{" "}
            {formatDateTimeIST(purchaseOrder.date)}
          </p>
          {purchaseOrder.status && (
            <p>
              <span className="font-semibold">Status:</span>{" "}
              <span className="capitalize">{purchaseOrder.status}</span>
            </p>
          )}
          <p>
            <span className="font-semibold">Customer:</span> {customerName}
            {customerPhone && ` (${customerPhone})`}
          </p>
          {purchaseOrder.customerAddress && (
            <p>
              <span className="font-semibold">Address:</span>{" "}
              {purchaseOrder.customerAddress}
            </p>
          )}
          {purchaseOrder.customerGstin && (
            <p>
              <span className="font-semibold">Customer GSTIN:</span>{" "}
              {purchaseOrder.customerGstin}
            </p>
          )}
          {purchaseOrder.notes && (
            <p>
              <span className="font-semibold">Notes:</span> {purchaseOrder.notes}
            </p>
          )}
        </div>
        <div className="text-right">
          <p>
            <span className="font-semibold">Document Type:</span> PURCHASE ORDER
          </p>
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
                {item.unit ? ` ${item.unit}` : ""}
              </td>
              <td className="px-2 py-2 text-right">
                {formatNumber(item.rate, 2)}
              </td>
              <td className="px-2 py-2 text-right">
                {formatCurrency(item.amount)}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="px-2 py-4 text-center text-slate-400">
                No items recorded
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1 text-xs">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCurrency(purchaseOrder.subtotal)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-900 pt-2 text-base font-bold">
            <span>Grand Total</span>
            <span>{formatCurrency(purchaseOrder.grandTotal)}</span>
          </div>
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-slate-500">
        Thank you for your business with {business.tagline}
      </p>
    </div>
  );
}

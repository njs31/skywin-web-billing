import {
  formatCurrency,
  formatDateIST,
  formatNumber,
  toNumber,
} from "@/lib/utils";
import { amountInIndianWords } from "@/lib/print-helpers";

type PurchaseBill = {
  id: number;
  invoiceNo: string | null;
  date: Date | string;
  paymentType: string;
  subtotal: string;
  gstTotal: string;
  grandTotal: string;
  handlingCharges?: string | null;
  paidAmount?: string | null;
  notes?: string | null;
  supplierName: string;
  supplierPhone?: string | null;
  supplierGstin?: string | null;
  supplierAddress?: string | null;
};

type PurchaseBillItem = {
  productName: string | null;
  customName?: string | null;
  hsnCode: string | null;
  qty: string;
  rate: string;
  amount: string;
  batchNumber?: string | null;
};

type PurchaseBillTemplateProps = {
  business: {
    name: string;
    tagline: string;
    address: string;
    phone: string;
    email: string;
    website?: string;
    gstin: string;
    state: string;
    stateCode: string;
  };
  purchase: PurchaseBill;
  items: PurchaseBillItem[];
};

function MetaCell({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="border-b border-r border-slate-900 px-2 py-1 last:border-r-0">
      <p className="text-[9px] font-semibold uppercase text-slate-500">
        {label}
      </p>
      <p className="min-h-[14px] text-[11px] font-medium">{value || "-"}</p>
    </div>
  );
}

export function PurchaseBillTemplate({
  business,
  purchase,
  items,
}: PurchaseBillTemplateProps) {
  const billDate = formatDateIST(purchase.date);
  const handling = toNumber(purchase.handlingCharges);
  const gstTotal = toNumber(purchase.gstTotal);
  const totalQty = items.reduce((s, i) => s + toNumber(i.qty), 0);
  const billNo = purchase.invoiceNo?.trim() || `PUR-${purchase.id}`;

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-3 text-slate-900 print-sheet print:p-2">
      <div className="border border-slate-900">
        <div className="border-b border-slate-900 px-2 py-1 text-center text-sm font-bold tracking-wide">
          PURCHASE BILL
        </div>

        <div className="grid grid-cols-2 border-b border-slate-900">
          <div className="border-r border-slate-900 p-2 text-[11px] leading-snug">
            <p className="text-sm font-bold uppercase">{business.name}</p>
            {business.tagline && (
              <p className="font-semibold">{business.tagline}</p>
            )}
            <p>{business.address}</p>
            <p>GSTIN/UIN: {business.gstin}</p>
            <p>
              State Name : {business.state}, Code : {business.stateCode}
            </p>
            <p>E-Mail : {business.email}</p>
            <p>Phone: {business.phone}</p>
          </div>

          <div className="p-2 text-[11px] leading-snug">
            <p className="text-[9px] font-semibold uppercase text-slate-500">
              Supplier
            </p>
            <p className="text-sm font-bold uppercase">{purchase.supplierName}</p>
            {purchase.supplierAddress && <p>{purchase.supplierAddress}</p>}
            {purchase.supplierPhone && <p>Phone: {purchase.supplierPhone}</p>}
            {purchase.supplierGstin && <p>GSTIN: {purchase.supplierGstin}</p>}
          </div>
        </div>

        <div className="grid grid-cols-4 border-b border-slate-900">
          <MetaCell label="Invoice No." value={billNo} />
          <MetaCell label="Dated" value={billDate} />
          <MetaCell
            label="Payment"
            value={purchase.paymentType.toUpperCase()}
          />
          <MetaCell
            label="Paid Amount"
            value={
              purchase.paidAmount != null
                ? formatCurrency(purchase.paidAmount)
                : "-"
            }
          />
        </div>

        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="border-b border-slate-900 bg-slate-50">
              <th className="border-r border-slate-900 px-1 py-1 text-left">#</th>
              <th className="border-r border-slate-900 px-1 py-1 text-left">
                Description of Goods
              </th>
              <th className="border-r border-slate-900 px-1 py-1 text-left">
                HSN
              </th>
              <th className="border-r border-slate-900 px-1 py-1 text-left">
                Batch
              </th>
              <th className="border-r border-slate-900 px-1 py-1 text-right">
                Qty
              </th>
              <th className="border-r border-slate-900 px-1 py-1 text-right">
                Rate
              </th>
              <th className="px-1 py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-b border-slate-300 align-top">
                <td className="border-r border-slate-300 px-1 py-1">{idx + 1}</td>
                <td className="border-r border-slate-300 px-1 py-1 font-medium">
                  {item.productName || item.customName || "Item"}
                </td>
                <td className="border-r border-slate-300 px-1 py-1">
                  {item.hsnCode || "-"}
                </td>
                <td className="border-r border-slate-300 px-1 py-1 font-mono">
                  {item.batchNumber || "-"}
                </td>
                <td className="border-r border-slate-300 px-1 py-1 text-right">
                  {formatNumber(item.qty, 2)}
                </td>
                <td className="border-r border-slate-300 px-1 py-1 text-right">
                  {formatCurrency(item.rate)}
                </td>
                <td className="px-1 py-1 text-right font-semibold">
                  {formatCurrency(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-2 border-t border-slate-900">
          <div className="border-r border-slate-900 p-2 text-[11px]">
            <p>
              <span className="font-semibold">Amount Chargeable (in words):</span>
            </p>
            <p className="mt-1 font-medium capitalize">
              {amountInIndianWords(toNumber(purchase.grandTotal))} Only
            </p>
            {purchase.notes ? (
              <p className="mt-2 text-slate-600">Notes: {purchase.notes}</p>
            ) : null}
            <p className="mt-3 text-[10px] text-slate-500">
              Total Qty: {formatNumber(totalQty, 2)}
            </p>
          </div>
          <div className="text-[11px]">
            <div className="flex justify-between border-b border-slate-300 px-2 py-1">
              <span>Subtotal</span>
              <span>{formatCurrency(purchase.subtotal)}</span>
            </div>
            {handling > 0 && (
              <div className="flex justify-between border-b border-slate-300 px-2 py-1">
                <span>Handling Charges</span>
                <span>{formatCurrency(handling)}</span>
              </div>
            )}
            {gstTotal > 0 && (
              <div className="flex justify-between border-b border-slate-300 px-2 py-1">
                <span>GST</span>
                <span>{formatCurrency(gstTotal)}</span>
              </div>
            )}
            <div className="flex justify-between px-2 py-1.5 text-sm font-bold">
              <span>Grand Total</span>
              <span>{formatCurrency(purchase.grandTotal)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-slate-900 text-[10px]">
          <div className="border-r border-slate-900 p-2">
            <p className="font-semibold">Declaration</p>
            <p className="mt-1 text-slate-600">
              We declare that this purchase bill shows the actual price of the
              goods described and that all particulars are true and correct.
            </p>
          </div>
          <div className="flex flex-col justify-between p-2 text-right">
            <p className="font-semibold">for {business.name}</p>
            <p className="mt-8">Authorised Signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}

import {
  formatCurrency,
  formatDateTimeIST,
  formatNumber,
  toNumber,
} from "@/lib/utils";
import {
  amountInIndianWords,
  buildGstSlabSummary,
  SKYWIN_PRINT_TERMS,
} from "@/lib/print-helpers";

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
  gstRate?: string | null;
};

type PurchaseOrderTemplateProps = {
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
    seedLicense?: string;
    fertLicense?: string;
    bankName?: string;
    bankBranch?: string;
    bankAccountNo?: string;
    bankIfsc?: string;
  };
  purchaseOrder: PurchaseOrder;
  items: PurchaseOrderItem[];
};

export function PurchaseOrderTemplate({
  business,
  purchaseOrder,
  items,
}: PurchaseOrderTemplateProps) {
  const party =
    purchaseOrder.customerRecordName ?? purchaseOrder.customerName ?? "Customer";
  const phone =
    purchaseOrder.customerRecordPhone ?? purchaseOrder.customerPhone ?? null;
  const totalQty = items.reduce((s, i) => s + toNumber(i.qty), 0);
  const slabs = buildGstSlabSummary(
    items.map((i) => ({
      amount: i.amount,
      gstRate: i.gstRate ?? 0,
    }))
  );
  const licenseBits = [
    business.seedLicense && `Seed : ${business.seedLicense}`,
    business.fertLicense && `FERT: ${business.fertLicense}`,
  ]
    .filter(Boolean)
    .join(" , ");

  return (
    <div className="mx-auto max-w-3xl print-sheet bg-white p-6 text-[11px] text-slate-900 print:p-3">
      <div className="grid grid-cols-2 gap-2 border-b-2 border-slate-900 pb-3">
        <div>
          <h1 className="text-base font-bold uppercase">{business.name}</h1>
          <h2 className="text-sm font-semibold">{business.tagline}</h2>
          <p className="mt-1 whitespace-pre-line leading-snug">{business.address}</p>
          {licenseBits && <p className="mt-1 font-medium">{licenseBits}</p>}
        </div>
        <div className="text-right leading-snug">
          <p>Phone : {business.phone}</p>
          {business.website && <p>{business.website}</p>}
          <p>{business.email}</p>
          <p className="font-semibold">GSTIN : {business.gstin}</p>
        </div>
      </div>

      <div className="mt-2 border-b border-slate-900 pb-1 text-center text-sm font-bold tracking-wide">
        PURCHASE ORDER{" "}
        <span className="font-semibold text-slate-600">Bill Details</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div className="leading-snug">
          <p className="font-bold uppercase">{party}</p>
          {purchaseOrder.customerAddress && (
            <p className="whitespace-pre-line">{purchaseOrder.customerAddress}</p>
          )}
          {phone && <p>Tel : {phone}</p>}
          <p>D.L.No :</p>
          {purchaseOrder.customerGstin && (
            <p>GSTIN : {purchaseOrder.customerGstin}</p>
          )}
        </div>
        <div className="leading-snug text-right">
          <p>
            <span className="font-semibold">Invoice No :</span>{" "}
            {purchaseOrder.poNumber}
          </p>
          <p>
            <span className="font-semibold">Date :</span>{" "}
            {formatDateTimeIST(purchaseOrder.date)}
          </p>
          <p>
            <span className="font-semibold">Type :</span> CREDIT Bill
          </p>
          <p>
            <span className="font-semibold">Transport :</span>
          </p>
          <p>
            <span className="font-semibold">Veh.Number :</span>
          </p>
          <p>
            <span className="font-semibold">No of cases :</span> 0
          </p>
          <p>
            <span className="font-semibold">EWay Number :</span>
          </p>
        </div>
      </div>

      <table className="mt-4 w-full border-collapse border border-slate-900">
        <thead>
          <tr className="bg-slate-50">
            <th className="border border-slate-900 px-1 py-1 text-left">S.No</th>
            <th className="border border-slate-900 px-1 py-1 text-left">
              Description of Goods/Services
            </th>
            <th className="border border-slate-900 px-1 py-1 text-left">HSN/SAC</th>
            <th className="border border-slate-900 px-1 py-1 text-right">Qty</th>
            <th className="border border-slate-900 px-1 py-1 text-left">Unit</th>
            <th className="border border-slate-900 px-1 py-1 text-right">Rate</th>
            <th className="border border-slate-900 px-1 py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx}>
              <td className="border border-slate-300 px-1 py-1">{idx + 1}</td>
              <td className="border border-slate-300 px-1 py-1">
                {item.productName ?? item.customName ?? "Item"}
              </td>
              <td className="border border-slate-300 px-1 py-1">
                {item.hsnCode ?? "-"}
              </td>
              <td className="border border-slate-300 px-1 py-1 text-right">
                {formatNumber(item.qty, 2)}
              </td>
              <td className="border border-slate-300 px-1 py-1">
                {(item.unit || "PCS").toUpperCase()}
              </td>
              <td className="border border-slate-300 px-1 py-1 text-right">
                {formatNumber(item.rate, 2)}
              </td>
              <td className="border border-slate-300 px-1 py-1 text-right">
                {formatCurrency(item.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <table className="w-full border-collapse border border-slate-900 text-[10px]">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-900 px-1 py-0.5">GST%</th>
                <th className="border border-slate-900 px-1 py-0.5 text-right">
                  Taxable
                </th>
                <th className="border border-slate-900 px-1 py-0.5 text-right">
                  SGST
                </th>
                <th className="border border-slate-900 px-1 py-0.5 text-right">
                  CGST
                </th>
                <th className="border border-slate-900 px-1 py-0.5 text-right">
                  GST Val
                </th>
              </tr>
            </thead>
            <tbody>
              {slabs.map((s) => (
                <tr key={s.rate}>
                  <td className="border border-slate-300 px-1 py-0.5">
                    {s.rate} %
                  </td>
                  <td className="border border-slate-300 px-1 py-0.5 text-right">
                    {s.taxable > 0 ? formatNumber(s.taxable, 2) : "-"}
                  </td>
                  <td className="border border-slate-300 px-1 py-0.5 text-right">
                    {s.sgst > 0 ? formatNumber(s.sgst, 2) : "-"}
                  </td>
                  <td className="border border-slate-300 px-1 py-0.5 text-right">
                    {s.cgst > 0 ? formatNumber(s.cgst, 2) : "-"}
                  </td>
                  <td className="border border-slate-300 px-1 py-0.5 text-right">
                    {s.gstVal > 0 ? formatNumber(s.gstVal, 2) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-[10px] leading-snug">
            <p className="font-semibold">Bank Details</p>
            <p>{business.bankName}</p>
            <p>BRANCH: {business.bankBranch}</p>
            <p>A/C.NO.: {business.bankAccountNo}</p>
            <p>IFSC : {business.bankIfsc}</p>
          </div>
        </div>
        <div className="space-y-1 text-right">
          <div className="flex justify-end gap-6">
            <span>Sub Total</span>
            <span className="w-24">{formatCurrency(purchaseOrder.subtotal)}</span>
          </div>
          <div className="flex justify-end gap-6">
            <span>Taxable Value :</span>
            <span className="w-24">{formatCurrency(purchaseOrder.subtotal)}</span>
          </div>
          <div className="flex justify-end gap-6 border-t border-slate-900 pt-1 text-sm font-bold">
            <span>Grand Total :</span>
            <span className="w-24">{formatCurrency(purchaseOrder.grandTotal)}</span>
          </div>
          <p className="pt-2 text-left text-[10px]">
            Total Item(S) {items.length} &nbsp; Total Qty(S){" "}
            {formatNumber(totalQty, 0)}
          </p>
          <p className="text-left text-[10px]">
            Rs. {amountInIndianWords(purchaseOrder.grandTotal)}
          </p>
        </div>
      </div>

      {purchaseOrder.notes && (
        <p className="mt-3 text-[10px]">
          <span className="font-semibold">Notes:</span> {purchaseOrder.notes}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-900 pt-3 text-[10px]">
        <div>
          <p className="font-semibold">Terms & Conditions</p>
          {SKYWIN_PRINT_TERMS.map((t) => (
            <p key={t}>{t}</p>
          ))}
        </div>
        <div className="text-right">
          <p>For {business.name}</p>
          <div className="mt-10 font-semibold">Authorised signatory</div>
        </div>
      </div>
    </div>
  );
}

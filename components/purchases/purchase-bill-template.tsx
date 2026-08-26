import {
  formatCurrency,
  formatDateIST,
  formatNumber,
  toNumber,
} from "@/lib/utils";
import { amountInIndianWords } from "@/lib/print-helpers";
import { isInterstateGst } from "@/lib/gst";

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
  gstRate?: string | number | null;
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

type HsnRow = {
  hsn: string;
  taxable: number;
  rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
};

function MetaCell({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="min-w-0 overflow-hidden border-b border-r border-slate-900 px-1.5 py-1 last:border-r-0">
      <p className="text-[9px] font-semibold uppercase text-slate-500">
        {label}
      </p>
      <p className="min-h-[14px] break-all text-[10px] font-medium leading-snug">
        {value || "-"}
      </p>
    </div>
  );
}

function buildHsnSummary(
  items: PurchaseBillItem[],
  interstate: boolean
): HsnRow[] {
  const map = new Map<string, HsnRow>();
  for (const item of items) {
    const hsn = (item.hsnCode || "-").trim() || "-";
    const rate = toNumber(item.gstRate);
    const key = `${hsn}|${rate}`;
    const taxable = toNumber(item.amount);
    const tax = Math.round(((taxable * rate) / 100) * 100) / 100;
    const existing = map.get(key) ?? {
      hsn,
      taxable: 0,
      rate,
      cgst: 0,
      sgst: 0,
      igst: 0,
      totalTax: 0,
    };
    existing.taxable += taxable;
    if (interstate) {
      existing.igst += tax;
    } else {
      const half = Math.round((tax / 2) * 100) / 100;
      existing.cgst += half;
      existing.sgst += Math.round((tax - half) * 100) / 100;
    }
    existing.totalTax += tax;
    map.set(key, existing);
  }
  return [...map.values()].map((r) => ({
    ...r,
    taxable: Math.round(r.taxable * 100) / 100,
    cgst: Math.round(r.cgst * 100) / 100,
    sgst: Math.round(r.sgst * 100) / 100,
    igst: Math.round(r.igst * 100) / 100,
    totalTax: Math.round(r.totalTax * 100) / 100,
  }));
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
  const interstate = isInterstateGst(purchase.supplierGstin, business.stateCode);
  const halfGst = Math.round((gstTotal / 2) * 100) / 100;
  const cgst = interstate ? 0 : halfGst;
  const sgst = interstate ? 0 : Math.round((gstTotal - halfGst) * 100) / 100;
  const igst = interstate ? gstTotal : 0;
  const hsnRows = buildHsnSummary(items, interstate);
  const showGst =
    gstTotal > 0 || hsnRows.some((row) => row.rate > 0 || row.totalTax > 0);

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-3 text-slate-900 print-sheet print:p-2">
      <div className="overflow-hidden border border-slate-900">
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

        <table className="w-full table-fixed border-collapse text-[9px]">
          <colgroup>
            <col className="w-[4%]" />
            <col className="w-[30%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
            <col className="w-[12%]" />
            <col className="w-[8%]" />
            <col className="w-[18%]" />
          </colgroup>
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
              <th className="border-r border-slate-900 px-1 py-1 text-right">
                GST %
              </th>
              <th className="px-1.5 py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-b border-slate-300 align-top">
                <td className="border-r border-slate-300 px-1 py-1">{idx + 1}</td>
                <td className="break-words border-r border-slate-300 px-1 py-1 font-medium">
                  {item.productName || item.customName || "Item"}
                </td>
                <td className="break-all border-r border-slate-300 px-1 py-1">
                  {item.hsnCode || "-"}
                </td>
                <td className="break-all border-r border-slate-300 px-1 py-1 font-mono text-[8px]">
                  {item.batchNumber || "-"}
                </td>
                <td className="border-r border-slate-300 px-1 py-1 text-right tabular-nums">
                  {formatNumber(item.qty, 2)}
                </td>
                <td className="border-r border-slate-300 px-1 py-1 text-right tabular-nums">
                  {formatCurrency(item.rate)}
                </td>
                <td className="border-r border-slate-300 px-1 py-1 text-right tabular-nums">
                  {formatNumber(item.gstRate ?? 0, 2)}
                </td>
                <td className="overflow-hidden px-1.5 py-1 text-right font-semibold tabular-nums">
                  {formatCurrency(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-2 border-t border-slate-900">
          <div className="min-w-0 border-r border-slate-900 p-2 text-[11px]">
            <p>
              <span className="font-semibold">Amount Chargeable (in words):</span>
            </p>
            <p className="mt-1 break-words font-medium capitalize">
              {amountInIndianWords(toNumber(purchase.grandTotal))} Only
            </p>
            {purchase.notes ? (
              <p className="mt-2 break-words text-slate-600">Notes: {purchase.notes}</p>
            ) : null}
            <p className="mt-3 text-[10px] text-slate-500">
              Total Qty: {formatNumber(totalQty, 2)}
            </p>
          </div>
          <div className="min-w-0 overflow-hidden text-[11px]">
            <div className="flex justify-between gap-2 border-b border-slate-300 px-2 py-1">
              <span className="shrink-0">Subtotal</span>
              <span className="min-w-0 text-right tabular-nums">
                {formatCurrency(purchase.subtotal)}
              </span>
            </div>
            {handling > 0 && (
              <div className="flex justify-between gap-2 border-b border-slate-300 px-2 py-1">
                <span className="shrink-0">Handling Charges</span>
                <span className="min-w-0 text-right tabular-nums">
                  {formatCurrency(handling)}
                </span>
              </div>
            )}
            {showGst && interstate && (
              <div className="flex justify-between gap-2 border-b border-slate-300 px-2 py-1">
                <span className="shrink-0">Input IGST</span>
                <span className="min-w-0 text-right tabular-nums">
                  {formatCurrency(igst)}
                </span>
              </div>
            )}
            {showGst && !interstate && (
              <>
                <div className="flex justify-between gap-2 border-b border-slate-300 px-2 py-1">
                  <span className="shrink-0">Input CGST</span>
                  <span className="min-w-0 text-right tabular-nums">
                    {formatCurrency(cgst)}
                  </span>
                </div>
                <div className="flex justify-between gap-2 border-b border-slate-300 px-2 py-1">
                  <span className="shrink-0">Input SGST</span>
                  <span className="min-w-0 text-right tabular-nums">
                    {formatCurrency(sgst)}
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between gap-2 px-2 py-1.5 text-sm font-bold">
              <span className="shrink-0">Grand Total</span>
              <span className="min-w-0 text-right tabular-nums">
                {formatCurrency(purchase.grandTotal)}
              </span>
            </div>
          </div>
        </div>

        {showGst && hsnRows.length > 0 && (
          <table className="w-full border-collapse border-t border-slate-900 text-[10px]">
            <thead>
              <tr className="border-b border-slate-900 bg-slate-50">
                <th className="border-r border-slate-900 px-1 py-1 text-left">
                  HSN/SAC
                </th>
                <th className="border-r border-slate-900 px-1 py-1 text-right">
                  Taxable Value
                </th>
                {interstate ? (
                  <th
                    className="border-r border-slate-900 px-1 py-1 text-center"
                    colSpan={2}
                  >
                    IGST
                  </th>
                ) : (
                  <>
                    <th
                      className="border-r border-slate-900 px-1 py-1 text-center"
                      colSpan={2}
                    >
                      CGST
                    </th>
                    <th
                      className="border-r border-slate-900 px-1 py-1 text-center"
                      colSpan={2}
                    >
                      SGST/UTGST
                    </th>
                  </>
                )}
                <th className="px-1.5 py-1 text-right">Total Tax Amount</th>
              </tr>
              <tr className="border-b border-slate-900 bg-slate-50">
                <th className="border-r border-slate-900" />
                <th className="border-r border-slate-900" />
                {interstate ? (
                  <>
                    <th className="border-r border-slate-900 px-1 py-0.5 text-right font-normal">
                      Rate
                    </th>
                    <th className="border-r border-slate-900 px-1 py-0.5 text-right font-normal">
                      Amount
                    </th>
                  </>
                ) : (
                  <>
                    <th className="border-r border-slate-900 px-1 py-0.5 text-right font-normal">
                      Rate
                    </th>
                    <th className="border-r border-slate-900 px-1 py-0.5 text-right font-normal">
                      Amount
                    </th>
                    <th className="border-r border-slate-900 px-1 py-0.5 text-right font-normal">
                      Rate
                    </th>
                    <th className="border-r border-slate-900 px-1 py-0.5 text-right font-normal">
                      Amount
                    </th>
                  </>
                )}
                <th />
              </tr>
            </thead>
            <tbody>
              {hsnRows.map((row) => (
                <tr
                  key={`${row.hsn}-${row.rate}`}
                  className="border-b border-slate-300"
                >
                  <td className="border-r border-slate-900 px-1 py-1">
                    {row.hsn}
                  </td>
                  <td className="border-r border-slate-900 px-1 py-1 text-right">
                    {formatNumber(row.taxable, 2)}
                  </td>
                  {interstate ? (
                    <>
                      <td className="border-r border-slate-900 px-1 py-1 text-right">
                        {formatNumber(row.rate, 2)}%
                      </td>
                      <td className="border-r border-slate-900 px-1 py-1 text-right">
                        {formatNumber(row.igst, 2)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="border-r border-slate-900 px-1 py-1 text-right">
                        {formatNumber(row.rate / 2, 2)}%
                      </td>
                      <td className="border-r border-slate-900 px-1 py-1 text-right">
                        {formatNumber(row.cgst, 2)}
                      </td>
                      <td className="border-r border-slate-900 px-1 py-1 text-right">
                        {formatNumber(row.rate / 2, 2)}%
                      </td>
                      <td className="border-r border-slate-900 px-1 py-1 text-right">
                        {formatNumber(row.sgst, 2)}
                      </td>
                    </>
                  )}
                  <td className="overflow-hidden px-1.5 py-1 text-right font-semibold tabular-nums">
                    {formatNumber(row.totalTax, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="grid grid-cols-2 border-t border-slate-900 text-[10px]">
          <div className="border-r border-slate-900 p-2">
            <p className="font-semibold">Declaration</p>
            <p className="mt-1 text-slate-600">
              We declare that this purchase bill shows the actual price of the
              goods described and that all particulars are true and correct.
            </p>
          </div>
          <div className="p-2 text-right">
            <p className="font-semibold">for {business.name}</p>
            <p className="mt-8 text-slate-500">Authorised Signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}

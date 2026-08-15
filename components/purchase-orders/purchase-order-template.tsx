import {
  formatCurrency,
  formatDateIST,
  formatNumber,
  toNumber,
} from "@/lib/utils";
import { amountInIndianWords } from "@/lib/print-helpers";
import {
  applyRupeeRounding,
  calculateGstBreakdown,
  isInterstateGst,
} from "@/lib/gst";

type PurchaseOrder = {
  poNumber: string;
  date: Date | string;
  notes?: string | null;
  customerName?: string | null;
  customerRecordName?: string | null;
  customerPhone?: string | null;
  customerRecordPhone?: string | null;
  customerGstin?: string | null;
  customerAddress?: string | null;
  customerAcre?: string | null;
  customerCrop?: string | null;
  customerPinCode?: string | null;
  customerVillage?: string | null;
  customerTaluk?: string | null;
  customerDistrict?: string | null;
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
    bankName?: string;
    bankBranch?: string;
    bankAccountNo?: string;
    bankIfsc?: string;
  };
  purchaseOrder: PurchaseOrder;
  items: PurchaseOrderItem[];
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

function buildHsnSummary(
  items: PurchaseOrderItem[],
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

function PartyBlock({
  label,
  purchaseOrder,
  customer,
  agriBits,
}: {
  label: string;
  purchaseOrder: PurchaseOrder;
  customer: string;
  agriBits: string[];
}) {
  const phone =
    purchaseOrder.customerRecordPhone ?? purchaseOrder.customerPhone ?? null;
  return (
    <div className="border-b border-slate-900 p-2 text-[11px] leading-snug">
      <p className="mb-1 font-semibold">{label}</p>
      <p className="font-bold uppercase">{customer}</p>
      {purchaseOrder.customerAddress && <p>{purchaseOrder.customerAddress}</p>}
      {agriBits.length > 0 && <p>{agriBits.join(", ")}</p>}
      {phone && <p>Cell.No: {phone}</p>}
      {purchaseOrder.customerGstin && (
        <p>GSTIN/UIN : {purchaseOrder.customerGstin}</p>
      )}
    </div>
  );
}

function MetaCell({
  label,
  value,
  className = "",
}: {
  label: string;
  value?: string | null;
  className?: string;
}) {
  return (
    <div className={`border-b border-slate-900 p-1.5 text-[10px] ${className}`}>
      <p className="text-slate-600">{label}</p>
      <p className="min-h-[1rem] font-semibold">{value || "\u00A0"}</p>
    </div>
  );
}

export function PurchaseOrderTemplate({
  business,
  purchaseOrder,
  items,
}: PurchaseOrderTemplateProps) {
  const customer =
    purchaseOrder.customerRecordName ??
    purchaseOrder.customerName ??
    "Customer";
  const agriBits = [
    purchaseOrder.customerAcre && `Acre: ${purchaseOrder.customerAcre}`,
    purchaseOrder.customerCrop && `Crop: ${purchaseOrder.customerCrop}`,
    purchaseOrder.customerVillage && `Village: ${purchaseOrder.customerVillage}`,
    purchaseOrder.customerTaluk && `Taluk: ${purchaseOrder.customerTaluk}`,
    purchaseOrder.customerDistrict &&
      `District: ${purchaseOrder.customerDistrict}`,
    purchaseOrder.customerPinCode && `PIN: ${purchaseOrder.customerPinCode}`,
  ].filter(Boolean) as string[];

  const interstate = isInterstateGst(
    purchaseOrder.customerGstin,
    business.stateCode
  );
  const gst = applyRupeeRounding(
    calculateGstBreakdown(
      items.map((item) => ({
        qty: toNumber(item.qty),
        rate: toNumber(item.rate),
        gstRate: toNumber(item.gstRate),
      })),
      { interstate }
    )
  );
  const hsnRows = buildHsnSummary(items, interstate);
  const totalQty = items.reduce((s, i) => s + toNumber(i.qty), 0);
  const taxableTotal = items.reduce((s, i) => s + toNumber(i.amount), 0);
  const totalTax = gst.cgst + gst.sgst + gst.igst;
  const roundOff = gst.roundOff ?? 0;
  const poDate = formatDateIST(purchaseOrder.date);

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-3 text-slate-900 print-sheet print:p-2">
      <div className="border border-slate-900">
        <div className="border-b border-slate-900 px-2 py-1 text-center text-sm font-bold tracking-wide">
          PURCHASE ORDER
        </div>

        <div className="grid grid-cols-2 border-b border-slate-900">
          <div className="border-r border-slate-900">
            <div className="border-b border-slate-900 p-2 text-[11px] leading-snug">
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
            <PartyBlock
              label="Consignee (Ship to)"
              purchaseOrder={purchaseOrder}
              customer={customer}
              agriBits={agriBits}
            />
            <PartyBlock
              label="Buyer (Bill to)"
              purchaseOrder={purchaseOrder}
              customer={customer}
              agriBits={agriBits}
            />
          </div>

          <div className="grid grid-cols-2 content-start">
            <MetaCell label="Order No." value={purchaseOrder.poNumber} />
            <MetaCell label="Dated" value={poDate} />
            <MetaCell label="e-Way Bill No." value="" />
            <MetaCell label="Mode/Terms of Payment" value="CREDIT" />
            <MetaCell label="Delivery Note" value="" />
            <MetaCell
              label="Other References"
              value={purchaseOrder.notes}
            />
            <MetaCell label="Buyer's Order No." value={purchaseOrder.poNumber} />
            <MetaCell label="Dated" value={poDate} />
            <MetaCell label="Dispatched through" value="" />
            <MetaCell label="Destination" value="" />
            <MetaCell label="Motor Vehicle No." value="" />
            <MetaCell label="Bill Type" value="PURCHASE ORDER" />
            <div className="col-span-2 border-b border-slate-900 p-1.5 text-[10px]">
              <p className="text-slate-600">Terms of Delivery</p>
              <p className="min-h-[2rem]">&nbsp;</p>
            </div>
          </div>
        </div>

        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="border-b border-slate-900 bg-slate-50">
              <th className="border-r border-slate-900 px-1 py-1 text-left">Sl</th>
              <th className="border-r border-slate-900 px-1 py-1 text-left">
                Description of Goods
              </th>
              <th className="border-r border-slate-900 px-1 py-1 text-left">
                HSN/SAC
              </th>
              <th className="border-r border-slate-900 px-1 py-1 text-right">
                Quantity
              </th>
              <th className="border-r border-slate-900 px-1 py-1 text-right">
                Rate
              </th>
              <th className="border-r border-slate-900 px-1 py-1 text-center">
                per
              </th>
              <th className="px-1 py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const unit = (item.unit || "PCS").toUpperCase();
              return (
                <tr key={idx} className="border-b border-slate-300 align-top">
                  <td className="border-r border-slate-900 px-1 py-1">
                    {idx + 1}
                  </td>
                  <td className="border-r border-slate-900 px-1 py-1 font-medium">
                    {item.productName ?? item.customName ?? "Item"}
                  </td>
                  <td className="border-r border-slate-900 px-1 py-1">
                    {item.hsnCode ?? "-"}
                  </td>
                  <td className="border-r border-slate-900 px-1 py-1 text-right">
                    {formatNumber(item.qty, 2)} {unit}
                  </td>
                  <td className="border-r border-slate-900 px-1 py-1 text-right">
                    {formatNumber(item.rate, 2)}
                  </td>
                  <td className="border-r border-slate-900 px-1 py-1 text-center">
                    {unit}
                  </td>
                  <td className="px-1 py-1 text-right">
                    {formatNumber(item.amount, 2)}
                  </td>
                </tr>
              );
            })}
            <tr className="border-b border-slate-300">
              <td className="border-r border-slate-900 px-1 py-1" />
              <td className="border-r border-slate-900 px-1 py-1 text-right font-semibold">
                {interstate ? "Output IGST" : "Output CGST"}
              </td>
              <td className="border-r border-slate-900" colSpan={4} />
              <td className="px-1 py-1 text-right font-semibold">
                {interstate
                  ? formatNumber(gst.igst, 2)
                  : formatNumber(gst.cgst, 2)}
              </td>
            </tr>
            {!interstate && (
              <tr className="border-b border-slate-300">
                <td className="border-r border-slate-900 px-1 py-1" />
                <td className="border-r border-slate-900 px-1 py-1 text-right font-semibold">
                  Output SGST
                </td>
                <td className="border-r border-slate-900" colSpan={4} />
                <td className="px-1 py-1 text-right font-semibold">
                  {formatNumber(gst.sgst, 2)}
                </td>
              </tr>
            )}
            {Math.abs(roundOff) >= 0.005 && (
              <tr className="border-b border-slate-300">
                <td className="border-r border-slate-900 px-1 py-1" />
                <td className="border-r border-slate-900 px-1 py-1 text-right font-semibold">
                  {roundOff < 0 ? "Less : ROUND OFF" : "Add : ROUND OFF"}
                </td>
                <td className="border-r border-slate-900" colSpan={4} />
                <td className="px-1 py-1 text-right font-semibold">
                  {roundOff < 0
                    ? `(-)${formatNumber(Math.abs(roundOff), 2)}`
                    : formatNumber(roundOff, 2)}
                </td>
              </tr>
            )}
            <tr className="border-b border-slate-900 font-bold">
              <td className="border-r border-slate-900 px-1 py-1" />
              <td className="border-r border-slate-900 px-1 py-1 text-right">
                Total
              </td>
              <td className="border-r border-slate-900 px-1 py-1" />
              <td className="border-r border-slate-900 px-1 py-1 text-right">
                {formatNumber(totalQty, 2)} PCS
              </td>
              <td className="border-r border-slate-900" colSpan={2} />
              <td className="px-1 py-1 text-right">
                {formatCurrency(gst.grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="border-b border-slate-900 px-2 py-2 text-[11px]">
          <p>
            <span className="font-semibold">Amount Chargeable (in words)</span>
            <span className="float-right text-[10px]">E. &amp; O.E</span>
          </p>
          <p className="font-bold italic">
            INR{" "}
            {amountInIndianWords(gst.grandTotal).replace(/ only$/i, " Only")}
          </p>
        </div>

        <table className="w-full border-collapse border-b border-slate-900 text-[10px]">
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
              <th className="px-1 py-1 text-right">Total Tax Amount</th>
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
                <td className="border-r border-slate-900 px-1 py-1">{row.hsn}</td>
                <td className="border-r border-slate-900 px-1 py-1 text-right">
                  {formatNumber(row.taxable, 2)}
                </td>
                {interstate ? (
                  <>
                    <td className="border-r border-slate-900 px-1 py-1 text-right">
                      {formatNumber(row.rate, 0)}%
                    </td>
                    <td className="border-r border-slate-900 px-1 py-1 text-right">
                      {formatNumber(row.igst, 2)}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="border-r border-slate-900 px-1 py-1 text-right">
                      {formatNumber(row.rate / 2, 0)}%
                    </td>
                    <td className="border-r border-slate-900 px-1 py-1 text-right">
                      {formatNumber(row.cgst, 2)}
                    </td>
                    <td className="border-r border-slate-900 px-1 py-1 text-right">
                      {formatNumber(row.rate / 2, 0)}%
                    </td>
                    <td className="border-r border-slate-900 px-1 py-1 text-right">
                      {formatNumber(row.sgst, 2)}
                    </td>
                  </>
                )}
                <td className="px-1 py-1 text-right">
                  {formatNumber(row.totalTax, 2)}
                </td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className="border-r border-slate-900 px-1 py-1 text-right">
                Total
              </td>
              <td className="border-r border-slate-900 px-1 py-1 text-right">
                {formatNumber(taxableTotal, 2)}
              </td>
              {interstate ? (
                <>
                  <td className="border-r border-slate-900" />
                  <td className="border-r border-slate-900 px-1 py-1 text-right">
                    {formatNumber(gst.igst, 2)}
                  </td>
                </>
              ) : (
                <>
                  <td className="border-r border-slate-900" />
                  <td className="border-r border-slate-900 px-1 py-1 text-right">
                    {formatNumber(gst.cgst, 2)}
                  </td>
                  <td className="border-r border-slate-900" />
                  <td className="border-r border-slate-900 px-1 py-1 text-right">
                    {formatNumber(gst.sgst, 2)}
                  </td>
                </>
              )}
              <td className="px-1 py-1 text-right">
                {formatNumber(totalTax, 2)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="border-b border-slate-900 px-2 py-2 text-[11px]">
          <p>
            <span className="font-semibold">Tax Amount (in words) : </span>
            INR {amountInIndianWords(totalTax).replace(/ only$/i, " Only")}
          </p>
        </div>

        <div className="grid grid-cols-2 border-b border-slate-900 text-[10px]">
          <div className="border-r border-slate-900 p-2">
            <p className="mb-1 font-semibold">Remarks:</p>
            <p>
              PO NO:- {purchaseOrder.poNumber} DT:- {poDate}
            </p>
            {purchaseOrder.notes && <p className="mt-1">{purchaseOrder.notes}</p>}
          </div>
          <div className="p-2">
            <p className="mb-1 font-semibold">Company&apos;s Bank Details</p>
            <p>
              <span className="text-slate-600">A/c Holder&apos;s Name : </span>
              {business.name}
            </p>
            <p>
              <span className="text-slate-600">Bank Name : </span>
              {business.bankName || "-"}
            </p>
            <p>
              <span className="text-slate-600">A/c No. : </span>
              {business.bankAccountNo || "-"}
            </p>
            <p>
              <span className="text-slate-600">Branch &amp; IFS Code: </span>
              {[business.bankBranch, business.bankIfsc]
                .filter(Boolean)
                .join(" & ") || "-"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 text-[10px]">
          <div className="border-r border-slate-900 p-2">
            <p className="mb-1 font-semibold">Declaration</p>
            <p>
              We declare that this purchase order shows the actual price of the
              goods described and that all particulars are true and correct.
            </p>
          </div>
          <div className="flex flex-col justify-between p-2 text-right">
            <p className="font-semibold">for {business.name}</p>
            <p className="mt-10 font-semibold">Authorised Signatory</p>
          </div>
        </div>
      </div>

      <p className="mt-2 text-center text-[10px] text-slate-500">
        This is a Computer Generated Purchase Order
      </p>
    </div>
  );
}

import {
  formatCurrency,
  formatDateIST,
  formatNumber,
  toNumber,
} from "@/lib/utils";
import { amountInIndianWords } from "@/lib/print-helpers";

type InvoiceSale = {
  invoiceNo: string;
  date: Date | string;
  billType?: string | null;
  customerName?: string | null;
  customerRecordName?: string | null;
  customerPhone?: string | null;
  customerGstin?: string | null;
  customerAddress?: string | null;
  customerAcre?: string | null;
  customerCrop?: string | null;
  customerPinCode?: string | null;
  customerVillage?: string | null;
  customerTaluk?: string | null;
  customerDistrict?: string | null;
  paymentMode: string;
  operatorName?: string | null;
  subtotal: string;
  discountAmount?: string | null;
  cgst: string;
  sgst: string;
  igst: string;
  grandTotal: string;
  roundOff?: string | null;
  paidAmount?: string | null;
  cashAmount?: string | null;
  upiAmount?: string | null;
  poNumber?: string | null;
  quotationNumber?: string | null;
  ewayBillNo?: string | null;
  vehicleNo?: string | null;
  dispatchedThrough?: string | null;
  destination?: string | null;
  deliveryNote?: string | null;
  paymentTerms?: string | null;
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
  unit?: string | null;
};

type InvoiceTemplateProps = {
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
  sale: InvoiceSale;
  items: InvoiceItem[];
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

function discPercent(item: InvoiceItem): number {
  if (toNumber(item.discountPercent) > 0) return toNumber(item.discountPercent);
  if (item.discountType === "percent") return toNumber(item.discountValue);
  const qty = toNumber(item.qty);
  const rate = toNumber(item.rate);
  const gross = qty * rate;
  if (gross <= 0) return 0;
  return Math.round((toNumber(item.discountValue) / gross) * 10000) / 100;
}

function paymentLabel(sale: InvoiceSale): string {
  if (sale.paymentTerms?.trim()) return sale.paymentTerms.trim();
  if (toNumber(sale.cashAmount) > 0 && toNumber(sale.upiAmount) > 0) {
    return "CASH + UPI";
  }
  if (sale.paymentMode === "credit") return "CREDIT";
  return sale.paymentMode.toUpperCase();
}

function buildHsnSummary(
  items: InvoiceItem[],
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
  sale,
  customer,
  agriBits,
}: {
  label: string;
  sale: InvoiceSale;
  customer: string | null;
  agriBits: string[];
}) {
  return (
    <div className="border-b border-slate-900 p-2 text-[11px] leading-snug">
      <p className="mb-1 font-semibold">{label}</p>
      <p className="font-bold uppercase">{customer ?? "Walk-in Customer"}</p>
      {sale.customerAddress && <p>{sale.customerAddress}</p>}
      {agriBits.length > 0 && <p>{agriBits.join(", ")}</p>}
      {sale.customerPhone && <p>Cell.No: {sale.customerPhone}</p>}
      {sale.customerGstin && <p>GSTIN/UIN : {sale.customerGstin}</p>}
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

export function InvoiceTemplate({ business, sale, items }: InvoiceTemplateProps) {
  const customer =
    sale.customerRecordName ?? sale.customerName ?? null;
  const agriBits = [
    sale.customerAcre && `Acre: ${sale.customerAcre}`,
    sale.customerCrop && `Crop: ${sale.customerCrop}`,
    sale.customerVillage && `Village: ${sale.customerVillage}`,
    sale.customerTaluk && `Taluk: ${sale.customerTaluk}`,
    sale.customerDistrict && `District: ${sale.customerDistrict}`,
    sale.customerPinCode && `PIN: ${sale.customerPinCode}`,
  ].filter(Boolean) as string[];

  const interstate = toNumber(sale.igst) > 0;
  const hsnRows = buildHsnSummary(items, interstate);
  const totalQty = items.reduce((s, i) => s + toNumber(i.qty), 0);
  const taxableTotal = items.reduce((s, i) => s + toNumber(i.amount), 0);
  const totalTax =
    toNumber(sale.cgst) + toNumber(sale.sgst) + toNumber(sale.igst);
  const roundOff = toNumber(sale.roundOff);
  const invoiceDate = formatDateIST(sale.date);

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-3 text-slate-900 print-sheet print:p-2">
      <div className="border border-slate-900">
        <div className="border-b border-slate-900 px-2 py-1 text-center text-sm font-bold tracking-wide">
          TAX INVOICE
        </div>

        <div className="grid grid-cols-2 border-b border-slate-900">
          <div className="border-r border-slate-900">
            <div className="border-b border-slate-900 p-2 text-[11px] leading-snug">
              <p className="text-sm font-bold uppercase">{business.name}</p>
              {business.tagline && (
                <p className="font-semibold">{business.tagline}</p>
              )}
              <p>{business.address}</p>
              <p>
                GSTIN/UIN: {business.gstin}
              </p>
              <p>
                State Name : {business.state}, Code : {business.stateCode}
              </p>
              <p>E-Mail : {business.email}</p>
              <p>Phone: {business.phone}</p>
            </div>
            <PartyBlock
              label="Consignee (Ship to)"
              sale={sale}
              customer={customer}
              agriBits={agriBits}
            />
            <PartyBlock
              label="Buyer (Bill to)"
              sale={sale}
              customer={customer}
              agriBits={agriBits}
            />
          </div>

          <div className="grid grid-cols-2 content-start">
            <MetaCell label="Invoice No." value={sale.invoiceNo} />
            <MetaCell label="Dated" value={invoiceDate} />
            <MetaCell label="e-Way Bill No." value={sale.ewayBillNo} />
            <MetaCell
              label="Mode/Terms of Payment"
              value={paymentLabel(sale)}
            />
            <MetaCell label="Delivery Note" value={sale.deliveryNote} />
            <MetaCell
              label="Other References"
              value={sale.operatorName}
            />
            <MetaCell label="Buyer's Order No." value={sale.poNumber} />
            <MetaCell label="Dated" value={sale.poNumber ? invoiceDate : ""} />
            <MetaCell
              label="Buyer's Ref. / Quotation No."
              value={sale.quotationNumber}
            />
            <MetaCell
              label="Dispatched through"
              value={sale.dispatchedThrough}
            />
            <MetaCell label="Destination" value={sale.destination} />
            <MetaCell label="Motor Vehicle No." value={sale.vehicleNo} />
            <MetaCell
              label="Bill Type"
              value={(sale.billType ?? "retail").toUpperCase()}
            />
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
              <th className="border-r border-slate-900 px-1 py-1 text-right">
                Disc. %
              </th>
              <th className="px-1 py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const unit = (item.unit || "PCS").toUpperCase();
              const disc = discPercent(item);
              return (
                <tr key={idx} className="border-b border-slate-300 align-top">
                  <td className="border-r border-slate-900 px-1 py-1">
                    {idx + 1}
                  </td>
                  <td className="border-r border-slate-900 px-1 py-1 font-medium">
                    {item.productName ?? item.customName ?? "Custom Item"}
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
                  <td className="border-r border-slate-900 px-1 py-1 text-right">
                    {disc > 0 ? formatNumber(disc, 2) : ""}
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
              <td className="border-r border-slate-900" colSpan={5} />
              <td className="px-1 py-1 text-right font-semibold">
                {interstate
                  ? formatNumber(sale.igst, 2)
                  : formatNumber(sale.cgst, 2)}
              </td>
            </tr>
            {!interstate && (
              <tr className="border-b border-slate-300">
                <td className="border-r border-slate-900 px-1 py-1" />
                <td className="border-r border-slate-900 px-1 py-1 text-right font-semibold">
                  Output SGST
                </td>
                <td className="border-r border-slate-900" colSpan={5} />
                <td className="px-1 py-1 text-right font-semibold">
                  {formatNumber(sale.sgst, 2)}
                </td>
              </tr>
            )}
            {Math.abs(roundOff) >= 0.005 && (
              <tr className="border-b border-slate-300">
                <td className="border-r border-slate-900 px-1 py-1" />
                <td className="border-r border-slate-900 px-1 py-1 text-right font-semibold">
                  {roundOff < 0 ? "Less : ROUND OFF" : "Add : ROUND OFF"}
                </td>
                <td className="border-r border-slate-900" colSpan={5} />
                <td className="px-1 py-1 text-right font-semibold">
                  {roundOff < 0 ? `(-)${formatNumber(Math.abs(roundOff), 2)}` : formatNumber(roundOff, 2)}
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
              <td className="border-r border-slate-900" colSpan={3} />
              <td className="px-1 py-1 text-right">
                {formatCurrency(sale.grandTotal)}
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
            INR {amountInIndianWords(sale.grandTotal).replace(/ only$/i, " Only")}
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
                <>
                  <th className="border-r border-slate-900 px-1 py-1 text-center" colSpan={2}>
                    IGST
                  </th>
                </>
              ) : (
                <>
                  <th className="border-r border-slate-900 px-1 py-1 text-center" colSpan={2}>
                    CGST
                  </th>
                  <th className="border-r border-slate-900 px-1 py-1 text-center" colSpan={2}>
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
              <tr key={`${row.hsn}-${row.rate}`} className="border-b border-slate-300">
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
                    {formatNumber(sale.igst, 2)}
                  </td>
                </>
              ) : (
                <>
                  <td className="border-r border-slate-900" />
                  <td className="border-r border-slate-900 px-1 py-1 text-right">
                    {formatNumber(sale.cgst, 2)}
                  </td>
                  <td className="border-r border-slate-900" />
                  <td className="border-r border-slate-900 px-1 py-1 text-right">
                    {formatNumber(sale.sgst, 2)}
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
              INVOICE NO:- {sale.invoiceNo} DT:- {invoiceDate}
            </p>
            {toNumber(sale.cashAmount) > 0 && toNumber(sale.upiAmount) > 0 && (
              <p className="mt-1">
                Cash: {formatCurrency(sale.cashAmount!)} · UPI:{" "}
                {formatCurrency(sale.upiAmount!)}
              </p>
            )}
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
              {[business.bankBranch, business.bankIfsc].filter(Boolean).join(" & ") ||
                "-"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 text-[10px]">
          <div className="border-r border-slate-900 p-2">
            <p className="mb-1 font-semibold">Declaration</p>
            <p>
              We declare that this invoice shows the actual price of the goods
              described and that all particulars are true and correct.
            </p>
          </div>
          <div className="flex flex-col justify-between p-2 text-right">
            <p className="font-semibold">for {business.name}</p>
            <p className="mt-10 font-semibold">Authorised Signatory</p>
          </div>
        </div>
      </div>

      <p className="mt-2 text-center text-[10px] text-slate-500">
        This is a Computer Generated Invoice
      </p>
    </div>
  );
}

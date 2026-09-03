import {
  formatCurrency,
  formatDateIST,
  formatNumber,
  formatRate,
  toNumber,
} from "@/lib/utils";
import { amountInIndianWords } from "@/lib/print-helpers";
import { invoiceSettlement } from "@/lib/sale-settlement";
import {
  lineDiscountLabel,
  lineDiscountPercent,
  totalLineDiscount,
} from "@/lib/invoice-discount";

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
  transporterName?: string | null;
  eInvoiceRequested?: boolean | null;
  status?: string | null;
  cancelledAt?: Date | string | null;
  cancelReason?: string | null;
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
    termsOfDelivery?: string;
  };
  sale: InvoiceSale;
  items: InvoiceItem[];
  einvoiceQrUrl?: string | null;
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
  return lineDiscountPercent(item);
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

/**
 * Full A4 tax-invoice — used for wholesale and "others" bills. Unchanged from
 * the original single-layout template.
 */
function WholesaleInvoiceLayout({
  business,
  sale,
  items,
  einvoiceQrUrl,
}: InvoiceTemplateProps) {
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
  const settlement = invoiceSettlement({
    paymentMode: sale.paymentMode,
    grandTotal: toNumber(sale.grandTotal),
    paidAmount: toNumber(sale.paidAmount),
    cashAmount: toNumber(sale.cashAmount),
    upiAmount: toNumber(sale.upiAmount),
  });

  const cancelled = sale.status === "cancelled";

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-3 text-slate-900 print-sheet print:p-2">
      {cancelled && (
        <div className="mb-2 border-2 border-red-600 bg-red-50 px-3 py-1.5 text-center text-sm font-bold uppercase tracking-widest text-red-700">
          Cancelled Invoice
          {sale.cancelReason ? ` — ${sale.cancelReason}` : ""}
        </div>
      )}
      <div className="border border-slate-900">
        <div className="grid grid-cols-[1fr_auto] border-b border-slate-900">
          <div className="px-2 py-1 text-center text-sm font-bold tracking-wide">
            TAX INVOICE
          </div>
          {einvoiceQrUrl ? (
            <div className="flex flex-col items-center border-l border-slate-900 px-2 py-1">
              <p className="text-[10px] font-bold leading-none">e-Invoice</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={einvoiceQrUrl}
                alt="Invoice QR"
                className="mt-0.5 h-[72px] w-[72px] print:h-[22mm] print:w-[22mm]"
              />
            </div>
          ) : null}
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
            <MetaCell label="Transporter" value={sale.transporterName} />
            <MetaCell
              label="Bill Type"
              value={(sale.billType ?? "retail").toUpperCase()}
            />
            <div className="col-span-2 border-b border-slate-900 p-1.5 text-[10px]">
              <p className="text-slate-600">Terms of Delivery</p>
              <p className="min-h-[2rem] whitespace-pre-wrap">
                {business.termsOfDelivery?.trim() || " "}
              </p>
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
            {settlement.received > 0 ? (
              <tr className="border-b border-slate-300">
                <td className="border-r border-slate-900 px-1 py-1" />
                <td className="border-r border-slate-900 px-1 py-1 text-right font-semibold">
                  Less : {settlement.label} RECEIVED
                </td>
                <td className="border-r border-slate-900" colSpan={5} />
                <td className="px-1 py-1 text-right font-semibold">
                  {formatNumber(settlement.received, 2)}
                </td>
              </tr>
            ) : null}
            {settlement.received > 0 ? (
              <tr className="border-b border-slate-900 font-bold">
                <td className="border-r border-slate-900 px-1 py-1" />
                <td className="border-r border-slate-900 px-1 py-1 text-right">
                  Balance Due
                </td>
                <td className="border-r border-slate-900" colSpan={5} />
                <td className="px-1 py-1 text-right">
                  {formatCurrency(settlement.balance)}
                </td>
              </tr>
            ) : null}
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
                      {formatRate(row.rate)}%
                    </td>
                    <td className="border-r border-slate-900 px-1 py-1 text-right">
                      {formatNumber(row.igst, 2)}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="border-r border-slate-900 px-1 py-1 text-right">
                      {formatRate(row.rate / 2)}%
                    </td>
                    <td className="border-r border-slate-900 px-1 py-1 text-right">
                      {formatNumber(row.cgst, 2)}
                    </td>
                    <td className="border-r border-slate-900 px-1 py-1 text-right">
                      {formatRate(row.rate / 2)}%
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
            {settlement.received > 0 && (
              <p className="mt-1">
                Auto credit: {settlement.label} {formatCurrency(settlement.received)}
                {settlement.balance > 0.009
                  ? ` · Balance ${formatCurrency(settlement.balance)}`
                  : " · Balance NIL"}
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
            <p className="font-bold">
              Sold items cannot be returned or exchanged
            </p>
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

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-600">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

const RECEIPT_DASH = "border-t border-dashed border-slate-400 my-1";

/**
 * Compact ~80mm thermal-receipt layout for retail counter bills. Prints on the
 * RECEIPT paper size; carries only the fields a retail customer needs.
 */
function RetailReceiptLayout({
  business,
  sale,
  items,
  einvoiceQrUrl,
}: InvoiceTemplateProps) {
  const customer = sale.customerRecordName ?? sale.customerName ?? null;
  const interstate = toNumber(sale.igst) > 0;
  const taxableTotal = items.reduce((s, i) => s + toNumber(i.amount), 0);
  const discountTotal = totalLineDiscount(items);
  const roundOff = toNumber(sale.roundOff);
  const invoiceDate = formatDateIST(sale.date);
  const settlement = invoiceSettlement({
    paymentMode: sale.paymentMode,
    grandTotal: toNumber(sale.grandTotal),
    paidAmount: toNumber(sale.paidAmount),
    cashAmount: toNumber(sale.cashAmount),
    upiAmount: toNumber(sale.upiAmount),
  });
  const transport = [
    sale.dispatchedThrough && `Via: ${sale.dispatchedThrough}`,
    sale.vehicleNo && `Vehicle: ${sale.vehicleNo}`,
    sale.transporterName && `Transporter: ${sale.transporterName}`,
  ].filter(Boolean) as string[];

  const dash = RECEIPT_DASH;

  return (
    <div className="mx-auto w-[80mm] max-w-[80mm] bg-white px-2 py-3 text-[11px] leading-tight text-slate-900 print-sheet print:w-[80mm] print:px-0 print:py-0">
      {sale.status === "cancelled" && (
        <p className="mb-1 border border-red-600 py-1 text-center text-xs font-bold uppercase tracking-widest text-red-700">
          Cancelled
        </p>
      )}
      <div className="text-center">
        <p className="text-sm font-bold uppercase">{business.name}</p>
        {business.tagline && <p className="text-[10px]">{business.tagline}</p>}
        {business.address && <p className="text-[10px]">{business.address}</p>}
        <p className="text-[10px]">GSTIN: {business.gstin}</p>
        <p className="text-[10px]">Ph: {business.phone}</p>
      </div>

      <div className={dash} />
      <p className="text-center text-[10px] font-semibold uppercase tracking-wide">
        Tax Invoice (Retail)
      </p>
      <div className={dash} />

      <ReceiptRow label="Invoice" value={sale.invoiceNo} />
      <ReceiptRow label="Date" value={invoiceDate} />
      <ReceiptRow label="Payment" value={paymentLabel(sale)} />
      {customer && <ReceiptRow label="Customer" value={customer} />}
      {sale.customerPhone && <ReceiptRow label="Phone" value={sale.customerPhone} />}
      {sale.customerGstin && <ReceiptRow label="GSTIN" value={sale.customerGstin} />}
      {sale.operatorName && <ReceiptRow label="Billed by" value={sale.operatorName} />}
      {transport.map((t) => (
        <p key={t} className="text-[10px]">
          {t}
        </p>
      ))}

      <div className={dash} />
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-dashed border-slate-400 text-left">
            <th className="py-0.5 font-semibold">Item</th>
            <th className="py-0.5 pl-2 text-right font-semibold">Qty</th>
            <th className="py-0.5 pl-2 text-right font-semibold">Rate</th>
            <th className="py-0.5 pl-2 text-right font-semibold">Disc</th>
            <th className="py-0.5 pl-2 text-right font-semibold">Amt</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const unit = (item.unit || "PCS").toUpperCase();
            const disc = lineDiscountLabel(item);
            return (
              <tr key={idx} className="align-top">
                <td className="py-0.5 pr-1">
                  {item.productName ?? item.customName ?? "Custom Item"}
                </td>
                <td className="py-0.5 pl-2 text-right whitespace-nowrap">
                  {formatNumber(item.qty, 2)} {unit}
                </td>
                <td className="py-0.5 pl-2 text-right">{formatNumber(item.rate, 2)}</td>
                <td className="py-0.5 pl-2 text-right whitespace-nowrap">{disc || "—"}</td>
                <td className="py-0.5 pl-2 text-right">{formatNumber(item.amount, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className={dash} />
      {discountTotal > 0.004 && (
        <ReceiptRow label="Discount" value={formatNumber(discountTotal, 2)} />
      )}
      <ReceiptRow label="Taxable" value={formatNumber(taxableTotal, 2)} />
      {interstate ? (
        <ReceiptRow label="IGST" value={formatNumber(sale.igst, 2)} />
      ) : (
        <>
          <ReceiptRow label="CGST" value={formatNumber(sale.cgst, 2)} />
          <ReceiptRow label="SGST" value={formatNumber(sale.sgst, 2)} />
        </>
      )}
      {Math.abs(roundOff) >= 0.005 && (
        <ReceiptRow label="Round Off" value={formatNumber(roundOff, 2)} />
      )}
      <div className="mt-1 flex justify-between border-t border-slate-900 pt-1 text-sm font-bold">
        <span>TOTAL</span>
        <span>{formatCurrency(sale.grandTotal)}</span>
      </div>
      {settlement.received > 0 && (
        <>
          <ReceiptRow
            label={`${settlement.label} Received`}
            value={formatNumber(settlement.received, 2)}
          />
          <div className="flex justify-between font-semibold">
            <span>Balance</span>
            <span>{formatCurrency(settlement.balance)}</span>
          </div>
        </>
      )}

      <div className={dash} />
      <p className="text-[10px]">
        INR{" "}
        {amountInIndianWords(sale.grandTotal).replace(/ only$/i, " Only")}
      </p>

      {einvoiceQrUrl && (
        <div className="mt-2 flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={einvoiceQrUrl}
            alt="Invoice QR"
            className="h-[64px] w-[64px] print:h-[18mm] print:w-[18mm]"
          />
          <p className="text-[9px] font-semibold">e-Invoice</p>
        </div>
      )}

      <div className={dash} />
      <p className="text-center text-[10px] font-semibold">
        Sold items cannot be returned or exchanged
      </p>
      <p className="mt-1 text-center text-[10px] text-slate-500">
        This is a Computer Generated Invoice
      </p>
    </div>
  );
}

export function InvoiceTemplate(props: InvoiceTemplateProps) {
  const billType = props.sale.billType ?? "retail";
  if (billType === "retail") {
    return <RetailReceiptLayout {...props} />;
  }
  return <WholesaleInvoiceLayout {...props} />;
}

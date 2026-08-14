import {
  formatCurrency,
  formatDateIST,
  formatNumber,
  toNumber,
} from "@/lib/utils";
import { amountInIndianWords } from "@/lib/print-helpers";

type Quotation = {
  quotationNo: string;
  date: Date | string;
  paymentTerms?: string | null;
  dispatchedThrough?: string | null;
  destination?: string | null;
  notes?: string | null;
  customerName?: string | null;
  customerRecordName?: string | null;
  customerPhone?: string | null;
  customerRecordPhone?: string | null;
  customerGstin?: string | null;
  customerAddress?: string | null;
  subtotal: string;
  cgst: string;
  sgst: string;
  igst: string;
  roundOff?: string | null;
  grandTotal: string;
};

type QuotationItem = {
  productName: string | null;
  customName?: string | null;
  hsnCode: string | null;
  qty: string;
  rate: string;
  gstRate: string;
  discountPercent?: string | null;
  amount: string;
  unit?: string | null;
};

type Props = {
  business: {
    name: string;
    tagline: string;
    address: string;
    phone: string;
    email: string;
    gstin: string;
    state: string;
    stateCode: string;
    bankName?: string;
    bankBranch?: string;
    bankAccountNo?: string;
    bankIfsc?: string;
  };
  quotation: Quotation;
  items: QuotationItem[];
};

export function QuotationTemplate({ business, quotation, items }: Props) {
  const party =
    quotation.customerRecordName ?? quotation.customerName ?? "Customer";
  const phone =
    quotation.customerRecordPhone ?? quotation.customerPhone ?? null;
  const totalQty = items.reduce((s, i) => s + toNumber(i.qty), 0);
  const interstate = toNumber(quotation.igst) > 0;
  const roundOff = toNumber(quotation.roundOff);
  const quoteDate = formatDateIST(quotation.date);

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-3 text-slate-900 print-sheet print:p-2">
      <div className="border border-slate-900">
        <div className="border-b border-slate-900 px-2 py-1 text-center text-sm font-bold tracking-wide">
          QUOTATION
        </div>

        <div className="grid grid-cols-2 border-b border-slate-900">
          <div className="border-r border-slate-900 p-2 text-[11px] leading-snug">
            <p className="text-sm font-bold uppercase">{business.name}</p>
            {business.tagline && <p className="font-semibold">{business.tagline}</p>}
            <p>{business.address}</p>
            <p>GSTIN/UIN: {business.gstin}</p>
            <p>
              State Name : {business.state}, Code : {business.stateCode}
            </p>
            <p>E-Mail : {business.email}</p>
            <p>Phone: {business.phone}</p>

            <div className="mt-3 border-t border-slate-300 pt-2">
              <p className="mb-1 font-semibold">Consignee (Ship to)</p>
              <p className="font-bold uppercase">{party}</p>
              {quotation.customerAddress && <p>{quotation.customerAddress}</p>}
              {phone && <p>Cell.No: {phone}</p>}
              {quotation.customerGstin && (
                <p>GSTIN/UIN : {quotation.customerGstin}</p>
              )}
            </div>
            <div className="mt-2 border-t border-slate-300 pt-2">
              <p className="mb-1 font-semibold">Buyer (Bill to)</p>
              <p className="font-bold uppercase">{party}</p>
              {quotation.customerAddress && <p>{quotation.customerAddress}</p>}
              {phone && <p>Cell.No: {phone}</p>}
              {quotation.customerGstin && (
                <p>GSTIN/UIN : {quotation.customerGstin}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 content-start text-[10px]">
            <div className="border-b border-r border-slate-900 p-1.5">
              <p className="text-slate-600">Voucher No.</p>
              <p className="font-semibold">{quotation.quotationNo}</p>
            </div>
            <div className="border-b border-slate-900 p-1.5">
              <p className="text-slate-600">Dated</p>
              <p className="font-semibold">{quoteDate}</p>
            </div>
            <div className="col-span-2 border-b border-slate-900 p-1.5">
              <p className="text-slate-600">Mode/Terms of Payment</p>
              <p className="font-semibold">
                {quotation.paymentTerms || "\u00A0"}
              </p>
            </div>
            <div className="border-b border-r border-slate-900 p-1.5">
              <p className="text-slate-600">Dispatched through</p>
              <p className="font-semibold">
                {quotation.dispatchedThrough || "\u00A0"}
              </p>
            </div>
            <div className="border-b border-slate-900 p-1.5">
              <p className="text-slate-600">Destination</p>
              <p className="font-semibold">{quotation.destination || "\u00A0"}</p>
            </div>
            <div className="col-span-2 border-b border-slate-900 p-1.5">
              <p className="text-slate-600">Terms of Delivery</p>
              <p className="min-h-[1.5rem]">&nbsp;</p>
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
              const disc = toNumber(item.discountPercent);
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
              <td className="border-r border-slate-900" />
              <td className="border-r border-slate-900 px-1 py-1 text-right font-semibold">
                {interstate ? "Output IGST" : "Output CGST"}
              </td>
              <td className="border-r border-slate-900" colSpan={5} />
              <td className="px-1 py-1 text-right font-semibold">
                {interstate
                  ? formatNumber(quotation.igst, 2)
                  : formatNumber(quotation.cgst, 2)}
              </td>
            </tr>
            {!interstate && (
              <tr className="border-b border-slate-300">
                <td className="border-r border-slate-900" />
                <td className="border-r border-slate-900 px-1 py-1 text-right font-semibold">
                  Output SGST
                </td>
                <td className="border-r border-slate-900" colSpan={5} />
                <td className="px-1 py-1 text-right font-semibold">
                  {formatNumber(quotation.sgst, 2)}
                </td>
              </tr>
            )}
            {Math.abs(roundOff) >= 0.005 && (
              <tr className="border-b border-slate-300">
                <td className="border-r border-slate-900" />
                <td className="border-r border-slate-900 px-1 py-1 text-right font-semibold">
                  {roundOff < 0 ? "Less : ROUND OFF" : "Add : ROUND OFF"}
                </td>
                <td className="border-r border-slate-900" colSpan={5} />
                <td className="px-1 py-1 text-right font-semibold">
                  {roundOff < 0
                    ? `(-)${formatNumber(Math.abs(roundOff), 2)}`
                    : formatNumber(roundOff, 2)}
                </td>
              </tr>
            )}
            <tr className="border-b border-slate-900 font-bold">
              <td className="border-r border-slate-900" />
              <td className="border-r border-slate-900 px-1 py-1 text-right">
                Total
              </td>
              <td className="border-r border-slate-900" />
              <td className="border-r border-slate-900 px-1 py-1 text-right">
                {formatNumber(totalQty, 2)} PCS
              </td>
              <td className="border-r border-slate-900" colSpan={3} />
              <td className="px-1 py-1 text-right">
                {formatCurrency(quotation.grandTotal)}
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
            {amountInIndianWords(quotation.grandTotal).replace(/ only$/i, " Only")}
          </p>
        </div>

        <div className="grid grid-cols-2 text-[10px]">
          <div className="border-r border-slate-900 p-2">
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
          <div className="flex flex-col justify-between p-2 text-right">
            <p className="font-semibold">for {business.name}</p>
            <p className="mt-10 font-semibold">Authorised Signatory</p>
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[10px] text-slate-500">
        This is a Computer Generated Document
      </p>
    </div>
  );
}

import { formatCurrency, formatDateTimeIST } from "@/lib/utils";

export type PaymentVoucher = {
  id: number;
  type: "receipt" | "payment";
  date: Date | string;
  amount: string;
  paymentMode: string;
  referenceNo?: string | null;
  notes?: string | null;
  partyName: string;
  partyPhone?: string | null;
  partyGstin?: string | null;
  partyAddress?: string | null;
  allocations: Array<{
    billNo: string;
    billDate?: Date | string | null;
    amount: string;
  }>;
};

type PaymentVoucherTemplateProps = {
  business: {
    name: string;
    tagline: string;
    address: string;
    phone: string;
    email: string;
    gstin: string;
  };
  voucher: PaymentVoucher;
};

export function PaymentVoucherTemplate({
  business,
  voucher,
}: PaymentVoucherTemplateProps) {
  const isReceipt = voucher.type === "receipt";
  const voucherNo = isReceipt ? `RCP-${voucher.id}` : `PAY-${voucher.id}`;
  const title = isReceipt ? "RECEIPT VOUCHER" : "PAYMENT VOUCHER";
  const partyLabel = isReceipt ? "Received from" : "Paid to";

  return (
    <div className="mx-auto max-w-3xl print-sheet bg-white p-8 text-sm text-slate-900 print:p-4 border shadow-sm">
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
          {title}
        </span>
      </div>

      <div className="mt-4 flex justify-between text-xs">
        <div>
          <p>
            <span className="font-semibold">Voucher No:</span> {voucherNo}
          </p>
          <p>
            <span className="font-semibold">Date:</span>{" "}
            {formatDateTimeIST(voucher.date)}
          </p>
          <p>
            <span className="font-semibold">Mode:</span>{" "}
            <span className="capitalize">{voucher.paymentMode}</span>
          </p>
          {voucher.referenceNo ? (
            <p>
              <span className="font-semibold">Reference:</span>{" "}
              {voucher.referenceNo}
            </p>
          ) : null}
        </div>
        <div className="max-w-xs text-right">
          <p className="font-semibold">{partyLabel}</p>
          <p className="font-medium">{voucher.partyName}</p>
          {voucher.partyPhone ? <p>Ph: {voucher.partyPhone}</p> : null}
          {voucher.partyGstin ? <p>GSTIN: {voucher.partyGstin}</p> : null}
          {voucher.partyAddress ? <p>{voucher.partyAddress}</p> : null}
        </div>
      </div>

      {voucher.allocations.length > 0 ? (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Against {isReceipt ? "Invoices" : "Purchase Bills"}
          </p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-y border-slate-900">
                <th className="py-2 text-left">Bill No</th>
                <th className="py-2 text-left">Date</th>
                <th className="py-2 text-right">Allocated</th>
              </tr>
            </thead>
            <tbody>
              {voucher.allocations.map((row, i) => (
                <tr key={i} className="border-b border-slate-200">
                  <td className="py-2">{row.billNo}</td>
                  <td className="py-2">
                    {row.billDate
                      ? new Date(row.billDate).toLocaleDateString("en-IN")
                      : "—"}
                  </td>
                  <td className="py-2 text-right">{formatCurrency(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {voucher.notes ? (
        <p className="mt-4 text-xs">
          <span className="font-semibold">Notes:</span> {voucher.notes}
        </p>
      ) : null}

      <div className="mt-6 flex items-end justify-between border-t border-slate-900 pt-4">
        <div>
          <p className="text-xs text-slate-500">Amount</p>
          <p className="text-2xl font-bold text-emerald-800">
            {formatCurrency(voucher.amount)}
          </p>
        </div>
        <div className="text-center text-xs">
          <div className="mb-10 w-40 border-b border-slate-400" />
          <p>Authorized Signatory</p>
        </div>
      </div>
    </div>
  );
}

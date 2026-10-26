import Link from "next/link";
import { notFound } from "next/navigation";
import { getPartyPaymentById } from "@/lib/queries/payments";
import { getCustomerById, toCustomerPickerOption } from "@/lib/queries/customers";
import { displayPaymentVoucherNo } from "@/lib/financial-year";
import { toNumber } from "@/lib/utils";
import { ReceiptForm } from "@/components/accounts/receipt-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MODES = ["cash", "upi", "credit", "card", "cheque", "neft"] as const;

export default async function EditReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);
  if (!Number.isFinite(id)) notFound();

  const payment = await getPartyPaymentById(id);
  if (!payment || payment.type !== "receipt") notFound();
  const customer = payment.customerId
    ? await getCustomerById(payment.customerId)
    : null;

  const bySale = new Map<
    number,
    { invoiceNo: string; date: Date | string; amount: number }
  >();
  for (const row of payment.allocations) {
    if (!row.saleId) continue;
    const current = bySale.get(row.saleId);
    const amount = toNumber(row.amount);
    if (!current) {
      bySale.set(row.saleId, {
        invoiceNo: row.saleInvoiceNo || `Sale #${row.saleId}`,
        date: row.billDate ?? payment.date,
        amount,
      });
    } else {
      current.amount += amount;
    }
  }

  const shares = [...bySale.entries()].map(([saleId, share]) => ({
    id: saleId,
    invoiceNo: share.invoiceNo,
    date: share.date,
    amount: share.amount.toFixed(2),
  }));
  const allocations: Record<number, string> = {};
  for (const share of shares) allocations[share.id] = share.amount;
  const paymentMode = (MODES as readonly string[]).includes(payment.paymentMode)
    ? (payment.paymentMode as (typeof MODES)[number])
    : "cash";

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Edit Receipt</h1>
          <p className="text-sm text-slate-500">
            {displayPaymentVoucherNo({
              type: "receipt",
              id: payment.id,
              voucherNo: payment.voucherNo,
            })}
            {payment.customerName ? ` · ${payment.customerName}` : ""}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/accounts/receipts/${payment.id}`}>Back</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receipt details</CardTitle>
        </CardHeader>
        <CardContent>
          <ReceiptForm
            initialCustomer={customer ? toCustomerPickerOption(customer) : null}
            editing={{
              id: payment.id,
              customerId: payment.customerId ?? 0,
              voucherNo: displayPaymentVoucherNo({
                type: "receipt",
                id: payment.id,
                voucherNo: payment.voucherNo,
              }),
              amount: toNumber(payment.amount).toFixed(2),
              paymentMode,
              referenceNo: payment.referenceNo ?? "",
              notes: payment.notes ?? "",
              requireAllocation: shares.length > 0,
              allocations,
              shares,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

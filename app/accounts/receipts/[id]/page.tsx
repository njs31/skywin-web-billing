import { notFound } from "next/navigation";
import Link from "next/link";
import { getPartyPaymentById } from "@/lib/queries/payments";
import { getSettings } from "@/lib/settings";
import { PaymentVoucherTemplate } from "@/components/accounts/payment-voucher-template";
import { PrintButton } from "@/components/invoice/print-button";
import { Button } from "@/components/ui/button";

export default async function ReceiptDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const { print } = await searchParams;
  const [payment, settings] = await Promise.all([
    getPartyPaymentById(parseInt(id, 10)),
    getSettings(),
  ]);
  if (!payment || payment.type !== "receipt") notFound();

  const business = {
    name: settings.businessName,
    tagline: settings.tagline,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    gstin: settings.gstin,
  };

  const voucher = {
    id: payment.id,
    type: "receipt" as const,
    date: payment.date,
    amount: payment.amount,
    paymentMode: payment.paymentMode,
    referenceNo: payment.referenceNo,
    notes: payment.notes,
    partyName: payment.customerName || "Customer",
    partyPhone: payment.customerPhone,
    partyGstin: payment.customerGstin,
    partyAddress: payment.customerAddress,
    allocations: payment.allocations.map((a) => ({
      billNo: a.saleInvoiceNo || `Sale #${a.saleId}`,
      billDate: a.billDate,
      amount: a.amount,
    })),
  };

  return (
    <div className="p-6">
      <div className="no-print mb-6 flex items-center justify-between">
        <Button asChild variant="outline">
          <Link href="/accounts/receipts">Back to Receipts</Link>
        </Button>
        <PrintButton
          autoPrint={print === "1"}
          invoiceNo={`RCP-${payment.id}`}
          grandTotal={payment.amount}
          phone={payment.customerPhone ?? undefined}
          documentType="Receipt"
          buttonText="Print Receipt"
        />
      </div>
      <PaymentVoucherTemplate business={business} voucher={voucher} />
    </div>
  );
}

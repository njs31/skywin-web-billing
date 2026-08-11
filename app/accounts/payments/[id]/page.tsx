import { notFound } from "next/navigation";
import Link from "next/link";
import { getPartyPaymentById } from "@/lib/queries/payments";
import { getSettings } from "@/lib/settings";
import { PaymentVoucherTemplate } from "@/components/accounts/payment-voucher-template";
import { PrintButton } from "@/components/invoice/print-button";
import { Button } from "@/components/ui/button";

export default async function PaymentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string; size?: string }>;
}) {
  const { id } = await params;
  const { print, size } = await searchParams;
  const [payment, settings] = await Promise.all([
    getPartyPaymentById(parseInt(id, 10)),
    getSettings(),
  ]);
  if (!payment || payment.type !== "payment") notFound();

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
    type: "payment" as const,
    date: payment.date,
    amount: payment.amount,
    paymentMode: payment.paymentMode,
    referenceNo: payment.referenceNo,
    notes: payment.notes,
    partyName: payment.supplierName || "Supplier",
    partyPhone: payment.supplierPhone,
    partyGstin: payment.supplierGstin,
    partyAddress: payment.supplierAddress,
    allocations: payment.allocations.map((a) => ({
      billNo: a.purchaseInvoiceNo || `Purchase #${a.purchaseId}`,
      billDate: a.billDate,
      amount: a.amount,
    })),
  };

  return (
    <div className="p-6">
      <div className="no-print mb-6 flex items-center justify-between">
        <Button asChild variant="outline">
          <Link href="/accounts/payments">Back to Payments</Link>
        </Button>
        <PrintButton
          autoPrint={print === "1"}
          initialSize={size}
          buttonText="Print Payment"
        />
      </div>
      <PaymentVoucherTemplate business={business} voucher={voucher} />
    </div>
  );
}

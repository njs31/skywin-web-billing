import { notFound } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { getSaleById } from "@/lib/queries/sales";
import { getSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/actions/auth";
import { InvoiceTemplate } from "@/components/invoice/invoice-template";
import { PrintButton } from "@/components/invoice/print-button";
import { CancelInvoiceButton } from "@/components/invoice/cancel-invoice-button";
import { Button } from "@/components/ui/button";
import { formatDateIST } from "@/lib/utils";

async function invoiceQrDataUrl(payload: string) {
  try {
    return await QRCode.toDataURL(payload, {
      margin: 0,
      width: 256,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string; size?: string }>;
}) {
  const { id } = await params;
  const { print, size } = await searchParams;
  const [sale, settings, currentUser] = await Promise.all([
    getSaleById(parseInt(id, 10)),
    getSettings(),
    getCurrentUser(),
  ]);
  if (!sale) notFound();
  const canCancel = currentUser?.role === "admin" && sale.status !== "cancelled";

  // Retail bills print as an ~80mm thermal receipt unless a size is forced.
  const effectiveSize =
    size ?? ((sale.billType ?? "retail") === "retail" ? "RECEIPT" : undefined);

  const business = {
    name: settings.businessName,
    tagline: settings.tagline,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    website: settings.website,
    gstin: settings.gstin,
    state: settings.state,
    stateCode: settings.stateCode,
    bankName: settings.bankName,
    bankBranch: settings.bankBranch,
    bankAccountNo: settings.bankAccountNo,
    bankIfsc: settings.bankIfsc,
    termsOfDelivery: settings.termsOfDelivery,
  };

  const einvoiceQrUrl = sale.eInvoiceRequested
    ? await invoiceQrDataUrl(
        JSON.stringify({
          invoiceNo: sale.invoiceNo,
          date: formatDateIST(sale.date),
          sellerGstin: settings.gstin,
          buyerGstin: sale.customerGstin || "",
          grandTotal: sale.grandTotal,
        })
      )
    : null;

  return (
    <div className="p-6">
      <div className="no-print mb-6 flex items-center justify-between">
        <Button asChild variant="outline">
          <Link href="/invoices">Back to Sale Book</Link>
        </Button>
        <div className="flex items-center gap-3">
          {canCancel && (
            <CancelInvoiceButton saleId={sale.id} invoiceNo={sale.invoiceNo} />
          )}
          <PrintButton
            autoPrint={print === "1"}
            initialSize={effectiveSize}
            buttonText="Print Invoice"
          />
        </div>
      </div>
      <InvoiceTemplate
        business={business}
        sale={sale}
        items={sale.items}
        einvoiceQrUrl={einvoiceQrUrl}
      />
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { getSaleById } from "@/lib/queries/sales";
import { getSettings } from "@/lib/settings";
import { InvoiceTemplate } from "@/components/invoice/invoice-template";
import { PrintButton } from "@/components/invoice/print-button";
import { Button } from "@/components/ui/button";

const BULK_CAP = 50;

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

export default async function BulkInvoicePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; size?: string }>;
}) {
  const { ids: rawIds, size } = await searchParams;
  const ids = (rawIds ?? "")
    .split(",")
    .map((v) => parseInt(v, 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, BULK_CAP);

  if (ids.length === 0) notFound();

  const settings = await getSettings();
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
    landline: settings.landline,
  };

  const sales = (
    await Promise.all(ids.map((id) => getSaleById(id)))
  ).filter((sale): sale is NonNullable<typeof sale> => sale != null);

  if (sales.length === 0) notFound();

  const firstType = sales[0]?.billType ?? "retail";
  const effectiveSize =
    size ?? (firstType === "retail" ? "RECEIPT" : undefined);

  const printable = await Promise.all(
    sales.map(async (sale) => {
      const signedPayload =
        sale.irn && sale.einvoiceStatus !== "cancelled" ? sale.signedQr : null;
      return {
        sale,
        signedPayload,
        einvoiceQrUrl: signedPayload
          ? await invoiceQrDataUrl(signedPayload)
          : null,
      };
    })
  );

  return (
    <div className="p-6 print:p-0">
      <div className="no-print mb-6 flex items-center justify-between">
        <Button asChild variant="outline">
          <Link href="/invoices">Back to Invoices</Link>
        </Button>
        <PrintButton
          autoPrint
          initialSize={effectiveSize}
          buttonText={`Print ${sales.length} invoice${sales.length === 1 ? "" : "s"}`}
        />
      </div>
      {printable.map(({ sale, signedPayload, einvoiceQrUrl }, index) => (
        <div
          key={sale.id}
          className={
            index < printable.length - 1
              ? "mb-6 print:mb-0 print:break-after-page"
              : ""
          }
        >
          <InvoiceTemplate
            business={business}
            sale={{ ...sale, irn: signedPayload ? sale.irn : null }}
            items={sale.items}
            einvoiceQrUrl={einvoiceQrUrl}
          />
        </div>
      ))}
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { getSaleReturnById } from "@/lib/queries/returns";
import { getSettings } from "@/lib/settings";
import { CreditNoteTemplate } from "@/components/returns/credit-note-template";
import { PrintButton } from "@/components/invoice/print-button";
import { Button } from "@/components/ui/button";

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

export default async function CreditNoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string; size?: string }>;
}) {
  const { id } = await params;
  const { print, size } = await searchParams;
  const [creditNote, settings] = await Promise.all([
    getSaleReturnById(parseInt(id, 10)),
    getSettings(),
  ]);

  if (!creditNote) notFound();

  const business = {
    name: settings.businessName,
    tagline: settings.tagline,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    gstin: settings.gstin,
    state: settings.state,
    stateCode: settings.stateCode,
    landline: settings.landline,
  };

  return (
    <div className="p-6">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/returns">Back to Sales Returns</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/returns/${creditNote.id}/edit`}>Edit</Link>
          </Button>
          {creditNote.saleId && (
            <Button asChild variant="outline">
              <Link href={`/invoices/${creditNote.saleId}`}>Original Invoice</Link>
            </Button>
          )}
        </div>
        <PrintButton
          autoPrint={print === "1"}
          initialSize={size}
          buttonText="Print Credit Note"
        />
      </div>
      <CreditNoteTemplate
        business={business}
        creditNote={creditNote}
        items={creditNote.items}
        einvoiceQrUrl={
          creditNote.irn && creditNote.einvoiceStatus !== "cancelled" && creditNote.signedQr
            ? await invoiceQrDataUrl(creditNote.signedQr)
            : null
        }
      />
    </div>
  );
}

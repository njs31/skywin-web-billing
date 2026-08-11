import { notFound } from "next/navigation";
import Link from "next/link";
import { getSaleReturnById } from "@/lib/queries/returns";
import { getSettings } from "@/lib/settings";
import { CreditNoteTemplate } from "@/components/returns/credit-note-template";
import { PrintButton } from "@/components/invoice/print-button";
import { Button } from "@/components/ui/button";

export default async function CreditNoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const { print } = await searchParams;
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
  };

  return (
    <div className="p-6">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/returns">Back to Sales Returns</Link>
          </Button>
          {creditNote.saleId && (
            <Button asChild variant="outline">
              <Link href={`/invoices/${creditNote.saleId}`}>Original Invoice</Link>
            </Button>
          )}
        </div>
        <PrintButton
          autoPrint={print === "1"}
          invoiceNo={creditNote.returnNo}
          grandTotal={creditNote.grandTotal}
          phone={creditNote.customerPhone ?? undefined}
          documentType="Credit Note"
          buttonText="Print Credit Note"
        />
      </div>
      <CreditNoteTemplate
        business={business}
        creditNote={creditNote}
        items={creditNote.items}
      />
    </div>
  );
}

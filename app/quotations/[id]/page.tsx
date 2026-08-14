import { notFound } from "next/navigation";
import Link from "next/link";
import { getQuotationById } from "@/lib/queries/quotations";
import { getSettings } from "@/lib/settings";
import { QuotationTemplate } from "@/components/quotations/quotation-template";
import { PrintButton } from "@/components/invoice/print-button";
import { Button } from "@/components/ui/button";

export default async function QuotationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string; size?: string }>;
}) {
  const { id } = await params;
  const { print, size } = await searchParams;
  const [quotation, settings] = await Promise.all([
    getQuotationById(parseInt(id, 10)),
    getSettings(),
  ]);
  if (!quotation) notFound();

  const business = {
    name: settings.businessName,
    tagline: settings.tagline,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    gstin: settings.gstin,
    state: settings.state,
    stateCode: settings.stateCode,
    bankName: settings.bankName,
    bankBranch: settings.bankBranch,
    bankAccountNo: settings.bankAccountNo,
    bankIfsc: settings.bankIfsc,
  };

  return (
    <div className="p-6">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link href="/quotations">Back to Quotations</Link>
        </Button>
        <PrintButton
          autoPrint={print === "1"}
          initialSize={size}
          buttonText="Print Quotation"
        />
      </div>
      <QuotationTemplate
        business={business}
        quotation={quotation}
        items={quotation.items}
      />
    </div>
  );
}

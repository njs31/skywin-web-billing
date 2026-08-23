import Link from "next/link";
import { notFound } from "next/navigation";
import { getPurchaseById } from "@/lib/queries/purchases";
import { getSettings } from "@/lib/settings";
import { PurchaseBillTemplate } from "@/components/purchases/purchase-bill-template";
import { PrintButton } from "@/components/invoice/print-button";
import { Button } from "@/components/ui/button";

export default async function PurchaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string; size?: string }>;
}) {
  const { id } = await params;
  const { print, size } = await searchParams;
  const [purchase, settings] = await Promise.all([
    getPurchaseById(parseInt(id, 10)),
    getSettings(),
  ]);
  if (!purchase) notFound();

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
  };

  return (
    <div className="p-6">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link href="/purchases">Back to Purchases</Link>
        </Button>
        <PrintButton
          autoPrint={print === "1"}
          initialSize={size}
          buttonText="Print Purchase Bill"
        />
      </div>
      <PurchaseBillTemplate
        business={business}
        purchase={purchase}
        items={purchase.items}
      />
    </div>
  );
}

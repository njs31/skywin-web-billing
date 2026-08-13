import { notFound } from "next/navigation";
import Link from "next/link";
import { getPurchaseOrderById } from "@/lib/queries/purchase-orders";
import { getSettings } from "@/lib/settings";
import { PurchaseOrderTemplate } from "@/components/purchase-orders/purchase-order-template";
import { PrintButton } from "@/components/invoice/print-button";
import { Button } from "@/components/ui/button";

export default async function PurchaseOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string; size?: string }>;
}) {
  const { id } = await params;
  const { print, size } = await searchParams;
  const [purchaseOrder, settings] = await Promise.all([
    getPurchaseOrderById(parseInt(id, 10)),
    getSettings(),
  ]);

  if (!purchaseOrder) notFound();

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
    seedLicense: settings.seedLicense,
    fertLicense: settings.fertLicense,
    bankName: settings.bankName,
    bankBranch: settings.bankBranch,
    bankAccountNo: settings.bankAccountNo,
    bankIfsc: settings.bankIfsc,
  };

  return (
    <div className="p-6">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link href="/purchase-orders">Back to Purchase Orders</Link>
        </Button>
        <PrintButton
          autoPrint={print === "1"}
          initialSize={size}
          buttonText="Print Purchase Order"
        />
      </div>
      <PurchaseOrderTemplate
        business={business}
        purchaseOrder={purchaseOrder}
        items={purchaseOrder.items}
      />
    </div>
  );
}

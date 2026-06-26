import { notFound } from "next/navigation";
import Link from "next/link";
import { getSaleById } from "@/lib/actions/sales";
import { InvoiceTemplate } from "@/components/invoice/invoice-template";
import { PrintButton } from "@/components/invoice/print-button";
import { Button } from "@/components/ui/button";

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const { print } = await searchParams;
  const sale = await getSaleById(parseInt(id, 10));
  if (!sale) notFound();

  return (
    <div className="p-6">
      <div className="no-print mb-6 flex items-center justify-between">
        <Button asChild variant="outline">
          <Link href="/invoices">Back to Invoices</Link>
        </Button>
        <PrintButton autoPrint={print === "1"} />
      </div>
      <InvoiceTemplate sale={sale} items={sale.items} />
    </div>
  );
}

import { getCustomers } from "@/lib/queries/customers";
import { QuotationForm } from "@/components/quotations/quotation-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function NewQuotationPage() {
  const customers = await getCustomers();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">New Quotation</h1>
          <p className="text-sm text-slate-500">
            Select a customer and add product lines
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/quotations">Back to Quotations</Link>
        </Button>
      </div>
      <QuotationForm customers={customers} />
    </div>
  );
}

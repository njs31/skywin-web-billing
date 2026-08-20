import { notFound } from "next/navigation";
import Link from "next/link";
import { getSaleReturnById } from "@/lib/queries/returns";
import { getCustomers } from "@/lib/queries/customers";
import { ReturnForm } from "@/components/returns/return-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function EditSaleReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const returnId = parseInt(id, 10);
  if (!Number.isFinite(returnId)) notFound();

  const [creditNote, customers] = await Promise.all([
    getSaleReturnById(returnId),
    getCustomers(),
  ]);
  if (!creditNote) notFound();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Edit Sales Return</h1>
          <p className="text-sm text-slate-500">{creditNote.returnNo}</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/returns/${creditNote.id}`}>Cancel</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credit note details</CardTitle>
        </CardHeader>
        <CardContent>
          <ReturnForm customers={customers} initialReturn={creditNote} />
        </CardContent>
      </Card>
    </div>
  );
}

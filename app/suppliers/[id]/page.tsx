import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupplierById } from "@/lib/queries/suppliers";
import { getPurchasesBySupplier } from "@/lib/queries/purchases";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supplierId = parseInt(id, 10);
  const supplier = await getSupplierById(supplierId);
  if (!supplier) notFound();

  const purchases = await getPurchasesBySupplier(supplierId);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{supplier.name}</h1>
          <p className="text-sm text-slate-500">
            Total purchased: {formatCurrency(supplier.totalPurchased)}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/suppliers">Back</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Purchase History</CardTitle>
        </CardHeader>
        <CardContent>
          {purchases.length === 0 ? (
            <p className="text-sm text-slate-400">No purchases recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {new Date(p.date).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell>{p.invoiceNo ?? "-"}</TableCell>
                    <TableCell className="capitalize">{p.paymentType}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(p.grandTotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

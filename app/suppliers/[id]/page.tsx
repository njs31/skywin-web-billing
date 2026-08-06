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
import { SupplierRowActions } from "@/components/suppliers/supplier-row-actions";

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
  const fullAddress = [
    supplier.address,
    supplier.city,
    supplier.state,
    supplier.pinCode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{supplier.name}</h1>
          <p className="text-sm text-slate-500">
            Total purchased: {formatCurrency(supplier.totalPurchased)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SupplierRowActions supplier={supplier} showView={false} />
          <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
            <Link href="/purchases/new">New Purchase</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/suppliers">Back</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supplier Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <p className="text-xs text-slate-500">GST</p>
            <p className="font-mono font-medium">{supplier.gstin || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">PAN</p>
            <p className="font-mono font-medium">{supplier.pan || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Mobile</p>
            <p className="font-medium">{supplier.phone || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">City / State / PIN</p>
            <p className="font-medium">
              {[supplier.city, supplier.state, supplier.pinCode]
                .filter(Boolean)
                .join(", ") || "—"}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-slate-500">Address</p>
            <p className="font-medium">{fullAddress || "—"}</p>
          </div>
        </CardContent>
      </Card>

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

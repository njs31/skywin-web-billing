import Link from "next/link";
import { getSuppliers } from "@/lib/queries/suppliers";
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
import { SupplierForm } from "@/components/suppliers/supplier-form";

export default async function SuppliersPage() {
  const suppliers = await getSuppliers();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Suppliers</h1>
        <p className="text-sm text-slate-500">
          Add suppliers here to select them in Purchase Entry
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Add Supplier</CardTitle>
          </CardHeader>
          <CardContent>
            <SupplierForm />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              All Suppliers ({suppliers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {suppliers.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-slate-400">
                No suppliers yet. Add one to use in Purchase Entry.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>GST</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead className="text-right">Purchased</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell className="font-medium">{supplier.name}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {supplier.phone || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {supplier.gstin || "—"}
                      </TableCell>
                      <TableCell>{supplier.city || "—"}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(supplier.totalPurchased)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/suppliers/${supplier.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

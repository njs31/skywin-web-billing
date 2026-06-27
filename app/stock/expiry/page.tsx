import Link from "next/link";
import { getNearExpiryProducts } from "@/lib/queries/reports";
import { toNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ExpiryPage() {
  const products = await getNearExpiryProducts(90);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Near Expiry Stock</h1>
          <p className="text-sm text-slate-500">
            Products expiring within 90 days
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/stock">Stock Status</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {products.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">
              No products with expiry dates set. Add expiry dates when editing
              products.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Expiry Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.categoryName ?? "-"}</TableCell>
                    <TableCell className="text-right">
                      {toNumber(p.stockQty)}
                    </TableCell>
                    <TableCell className="font-semibold text-red-600">
                      {p.expiryDate}
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

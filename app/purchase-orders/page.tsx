import Link from "next/link";
import { getPurchaseOrders } from "@/lib/queries/purchase-orders";
import { formatCurrency, formatDateTimeIST } from "@/lib/utils";
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

export default async function PurchaseOrdersPage() {
  const orders = await getPurchaseOrders();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Purchase Orders</h1>
          <p className="text-sm text-slate-500">
            Customer purchase orders for fulfilment and printing
          </p>
        </div>
        <Button asChild>
          <Link href="/purchase-orders/new">New Purchase Order</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Purchase Orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">
              No purchase orders yet. Create one to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium">{po.poNumber}</TableCell>
                    <TableCell>{formatDateTimeIST(po.date)}</TableCell>
                    <TableCell>
                      {po.customerRecordName ?? po.customerName ?? "-"}
                    </TableCell>
                    <TableCell className="capitalize">{po.status}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(po.grandTotal)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/purchase-orders/${po.id}`}>View</Link>
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
  );
}

import { getAllSuppliers } from "@/lib/queries/suppliers";
import { PurchaseOrderForm } from "@/components/purchase-orders/purchase-order-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function NewPurchaseOrderPage() {
  const suppliers = await getAllSuppliers();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">New Purchase Order</h1>
          <p className="text-sm text-slate-500">
            Select a supplier and add product lines
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/purchase-orders">Back to Purchase Orders</Link>
        </Button>
      </div>
      <PurchaseOrderForm suppliers={suppliers} />
    </div>
  );
}

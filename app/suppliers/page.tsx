import { getSuppliers } from "@/lib/queries/suppliers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { SupplierList } from "@/components/suppliers/supplier-list";

export default async function SuppliersPage() {
  const suppliers = await getSuppliers();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Suppliers</h1>
          <p className="text-sm text-slate-500">
            Add suppliers here to select them in Purchase Entry
          </p>
        </div>
        <AddSupplierDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            All Suppliers ({suppliers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <SupplierList suppliers={suppliers} />
        </CardContent>
      </Card>
    </div>
  );
}

import { getAllSuppliers } from "@/lib/queries/suppliers";
import { PurchaseForm } from "@/components/purchases/purchase-form";

export default async function NewPurchasePage() {
  const suppliers = await getAllSuppliers();
  return <PurchaseForm suppliers={suppliers} />;
}

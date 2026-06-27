import { getSuppliers } from "@/lib/queries/suppliers";
import { PurchaseForm } from "@/components/purchases/purchase-form";

export default async function NewPurchasePage() {
  const suppliers = await getSuppliers();
  return <PurchaseForm suppliers={suppliers} />;
}

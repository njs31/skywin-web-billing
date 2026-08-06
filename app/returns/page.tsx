import { getSaleReturns, getPurchaseReturns } from "@/lib/queries/returns";
import { getCustomers } from "@/lib/queries/customers";
import { getAllSuppliers } from "@/lib/queries/suppliers";
import { ReturnsContainer } from "@/components/returns/returns-container";

export default async function ReturnsPage() {
  const [saleReturns, purchaseReturns, customers, suppliers] = await Promise.all([
    getSaleReturns(),
    getPurchaseReturns(),
    getCustomers(),
    getAllSuppliers(),
  ]);

  return (
    <ReturnsContainer
      initialSaleReturns={saleReturns}
      initialPurchaseReturns={purchaseReturns}
      customers={customers}
      suppliers={suppliers}
    />
  );
}

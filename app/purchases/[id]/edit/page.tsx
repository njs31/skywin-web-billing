import { notFound } from "next/navigation";
import { getAllSuppliers } from "@/lib/queries/suppliers";
import { getPurchaseById } from "@/lib/queries/purchases";
import { PurchaseForm } from "@/components/purchases/purchase-form";
import { toNumber } from "@/lib/utils";

export default async function EditPurchasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const purchaseId = parseInt(id, 10);
  if (!Number.isFinite(purchaseId)) notFound();

  const [purchase, suppliers] = await Promise.all([
    getPurchaseById(purchaseId),
    getAllSuppliers(),
  ]);
  if (!purchase) notFound();

  return (
    <PurchaseForm
      suppliers={suppliers}
      initialPurchase={{
        id: purchase.id,
        supplierId: purchase.supplierId,
        invoiceNo: purchase.invoiceNo,
        date: purchase.date,
        paymentType: purchase.paymentType as "credit" | "cash",
        handlingCharges: purchase.handlingCharges ?? "0",
        paidAmount: purchase.paidAmount ?? "0",
        notes: purchase.notes,
        items: purchase.items.map((row) => ({
          product: row.productId && row.product ? row.product : null,
          name: row.productName || row.customName || "Item",
          qty: toNumber(row.qty),
          rate: toNumber(row.rate),
          discountType: (row.discountType as "percent" | "value") || "percent",
          discountValue: toNumber(row.discountValue),
          hsnCode: row.hsnCode ?? undefined,
          batchNumber: row.batchNumber ?? undefined,
          expiryDate: row.expiryDate ?? undefined,
          gstRate: toNumber(row.gstRate),
          saleRate: row.product ? toNumber(row.product.saleRate) : undefined,
        })),
      }}
    />
  );
}

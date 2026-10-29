import { notFound } from "next/navigation";
import { fieldProductDetail } from "@/lib/actions/field";
import { ProductDetailForm } from "./detail-form";

export default async function FieldProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isFinite(productId)) notFound();
  const found = await fieldProductDetail(productId);
  if (!found) notFound();

  return (
    <div className="mx-auto max-w-6xl">
      <ProductDetailForm
        productId={found.product.id}
        productName={found.product.name}
        sku={found.product.sku}
        placement={found.placement}
        updatedAt={found.updatedAt}
        initial={found.detail}
      />
    </div>
  );
}

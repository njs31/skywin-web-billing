import Link from "next/link";
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
    <div className="space-y-5">
      <Link href="/field/products" className="text-sm font-medium text-[#2E4A22]/70 hover:underline">
        ← Product details
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{found.product.name}</h1>
        <p className="text-sm text-[#2E4A22]/70">
          {found.product.sku || `ID ${found.product.id}`}
          {found.updatedAt ? ` · last saved ${new Date(found.updatedAt).toLocaleString("en-IN")}` : " · not filled yet"}
        </p>
      </div>
      <ProductDetailForm productId={found.product.id} productName={found.product.name} initial={found.detail} />
    </div>
  );
}

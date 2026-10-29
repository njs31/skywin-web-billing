import { fieldCatalogTree } from "@/lib/actions/field";
import { CatalogIndex } from "./catalog-forms";

export default async function FieldCatalogPage() {
  const categories = await fieldCatalogTree();
  const subcategories = categories.reduce((sum, category) => sum + category.subs.length, 0);
  const skus = categories.reduce(
    (sum, category) => sum + category.subs.reduce((inner, sub) => inner + sub.productIds.length, 0),
    0
  );
  const summaries = categories.map((category) => ({
    id: category.id,
    slug: category.slug,
    title: category.title,
    subcategories: category.subs.length,
    skus: category.subs.reduce((inner, sub) => inner + sub.productIds.length, 0),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#1E3317]">Catalog</h1>
        <p className="mt-1 text-sm text-[#5E6B62]">
          {categories.length} {categories.length === 1 ? "category" : "categories"} · {subcategories}{" "}
          {subcategories === 1 ? "subcategory" : "subcategories"} · {skus} {skus === 1 ? "SKU" : "SKUs"} pinned
          from billing.
        </p>
      </div>
      <CatalogIndex categories={summaries} />
    </div>
  );
}

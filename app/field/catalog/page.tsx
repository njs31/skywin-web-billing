import Link from "next/link";
import { fieldCatalogTree } from "@/lib/actions/field";
import { AddCategoryForm } from "./catalog-forms";

export default async function FieldCatalogPage() {
  const categories = await fieldCatalogTree();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Catalog</h1>
        <p className="text-sm text-[#2E4A22]/70">
          Same tree as the Field app: category, then left-rail subcategory, then billing products.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/field/catalog/${category.slug}`}
            className="rounded-2xl border border-[#1E3317]/10 bg-white p-5 shadow-sm hover:border-[#B8D94A]"
          >
            <p className="text-xs uppercase tracking-wide text-[#2E4A22]/50">{category.slug}</p>
            <h2 className="mt-1 text-xl font-bold">{category.title}</h2>
            <p className="mt-2 text-sm text-[#2E4A22]/70">
              {category.subs.length} subcategories ·{" "}
              {category.subs.reduce((sum, sub) => sum + sub.productIds.length, 0)} SKUs
            </p>
          </Link>
        ))}
      </div>
      <AddCategoryForm />
    </div>
  );
}

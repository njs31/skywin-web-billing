import { fieldCatalogTree } from "@/lib/actions/field";
import { CatalogIndex } from "./catalog-forms";

export default async function FieldCatalogPage() {
  const categories = await fieldCatalogTree();
  const summaries = categories.map((category) => ({
    id: category.id,
    slug: category.slug,
    title: category.title,
    subcategories: category.subs.length,
    skus: category.subs.reduce((inner, sub) => inner + sub.productIds.length, 0),
    subNames: category.subs.slice(0, 4).map((sub) => sub.title),
  }));
  return <CatalogIndex categories={summaries} />;
}

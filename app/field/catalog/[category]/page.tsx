import { notFound } from "next/navigation";
import { fieldCategoryPage } from "@/lib/actions/field";
import { CategoryEditor } from "./category-editor";

export default async function FieldCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await params;
  const data = await fieldCategoryPage(slug);
  if (!data) notFound();
  return <CategoryEditor category={data.category} productSets={data.productSets} />;
}

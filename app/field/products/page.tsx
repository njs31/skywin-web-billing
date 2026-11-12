import { fieldProductsPage } from "@/lib/actions/field";
import { ProductsWorkspace } from "./products-workspace";

export default async function FieldProductsPage() {
  const data = await fieldProductsPage({ page: 1 });
  return (
    <div className="mx-auto max-w-[96rem]">
      <ProductsWorkspace initial={data} />
    </div>
  );
}

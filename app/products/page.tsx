import { getProducts } from "@/lib/actions/products";
import { ProductTable } from "@/components/products/product-table";
import { ProductSearch } from "@/components/products/product-search";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const products = await getProducts(q);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Products</h1>
        <p className="text-sm text-slate-500">
          {products.length} products — edit sale rates and GST
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search Products</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductSearch defaultQuery={q ?? ""} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <ProductTable products={products} />
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { getProducts, getProductCount } from "@/lib/queries/products";
import { ProductTable } from "@/components/products/product-table";
import { ProductSearch } from "@/components/products/product-search";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 50;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const [products, totalCount] = await Promise.all([
    getProducts(q, page, PAGE_SIZE),
    q ? Promise.resolve(0) : getProductCount(),
  ]);

  const total = q ? products.length : totalCount;
  const totalPages = q ? 1 : Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Products</h1>
        <p className="text-sm text-slate-500">
          {total} products — edit sale rates and GST
          {!q && totalPages > 1 && ` (page ${page} of ${totalPages})`}
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

      {!q && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button asChild variant="outline" size="sm" disabled={page <= 1}>
            <Link href={`/products?page=${page - 1}`}>Previous</Link>
          </Button>
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </span>
          <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
            <Link href={`/products?page=${page + 1}`}>Next</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

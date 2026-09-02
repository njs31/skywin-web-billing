import Link from "next/link";
import {
  getProducts,
  getProductCount,
  DEFAULT_SORT_DIR,
  PRODUCT_SORTS,
  type ProductSort,
  type SortDir,
} from "@/lib/queries/products";
import { ProductSortBar } from "@/components/products/product-sort-bar";
import { ProductTable } from "@/components/products/product-table";
import { presentDotsFromMm } from "@/lib/escpos-print";
import { getSettings } from "@/lib/settings";
import { ProductSearch } from "@/components/products/product-search";
import { ProductExportButtons } from "@/components/products/product-export-buttons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 50;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; sort?: string; dir?: string }>;
}) {

  const { q, page: pageParam, sort: sortParam, dir: dirParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const sort: ProductSort = PRODUCT_SORTS.includes(sortParam as ProductSort)
    ? (sortParam as ProductSort)
    : "name";
  const dir: SortDir =
    dirParam === "asc" || dirParam === "desc" ? dirParam : DEFAULT_SORT_DIR[sort];

  const [products, totalCount] = await Promise.all([
    getProducts(q, page, PAGE_SIZE, sort, dir),
    q ? Promise.resolve(0) : getProductCount(),
  ]);

  // The printer's tear-off feed, for the per-row print button.
  const settings = await getSettings();
  const presentDots = presentDotsFromMm(settings.labelTearOffMm);

  // Paging has to carry the sort, or page two quietly reverts to name order.
  const pageHref = (target: number) =>
    `/products?page=${target}&sort=${sort}&dir=${dir}`;

  const total = q ? products.length : totalCount;
  const totalPages = q ? 1 : Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-slate-500">
            {total} products — edit sale rates and GST
            {!q && totalPages > 1 && ` (page ${page} of ${totalPages})`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <a href="/products/labels/images">
              Download all label images (PNG ZIP)
            </a>
          </Button>
          <Button asChild className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Link href="/products/new">Add Product</Link>
          </Button>
        </div>
      </div>

      <ProductExportButtons />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search Products</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductSearch defaultQuery={q ?? ""} />
        </CardContent>
      </Card>

      <ProductSortBar sort={sort} dir={dir} q={q} />

      <Card>
        <CardContent className="p-0">
          <ProductTable products={products} presentDots={presentDots} />
        </CardContent>
      </Card>

      {!q && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button asChild variant="outline" size="sm" disabled={page <= 1}>
            <Link href={pageHref(page - 1)}>Previous</Link>
          </Button>
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </span>
          <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
            <Link href={pageHref(page + 1)}>Next</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

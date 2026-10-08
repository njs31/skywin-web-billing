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
import {
  parseProductListStatus,
  type ProductListStatus,
} from "@/lib/product-status";
import { ProductExportButtons } from "@/components/products/product-export-buttons";
import { getTodayLabelCount } from "@/lib/queries/label-prints";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 50;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    sort?: string;
    dir?: string;
    status?: string;
  }>;
}) {

  const { q, page: pageParam, sort: sortParam, dir: dirParam, status: statusParam } =
    await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const status = parseProductListStatus(statusParam);

  const sort: ProductSort = PRODUCT_SORTS.includes(sortParam as ProductSort)
    ? (sortParam as ProductSort)
    : "name";
  const dir: SortDir =
    dirParam === "asc" || dirParam === "desc" ? dirParam : DEFAULT_SORT_DIR[sort];

  const [products, totalCount, activeCount, inactiveCount] = await Promise.all([
    getProducts(q, page, PAGE_SIZE, sort, dir, status),
    q ? Promise.resolve(0) : getProductCount(status),
    getProductCount("active"),
    getProductCount("inactive"),
  ]);
  const todayLabelCount = await getTodayLabelCount();

  // The printer's tear-off feed, for the per-row print button.
  const settings = await getSettings();
  const presentDots = presentDotsFromMm(settings.labelTearOffMm);

  // Paging has to carry the sort, or page two quietly reverts to name order.
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    params.set("page", String(target));
    params.set("sort", sort);
    params.set("dir", dir);
    if (status === "inactive") params.set("status", "inactive");
    return `/products?${params.toString()}`;
  };

  const statusHref = (next: ProductListStatus) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (next === "inactive") params.set("status", "inactive");
    params.set("sort", sort);
    params.set("dir", dir);
    return `/products?${params.toString()}`;
  };

  const total = q ? products.length : totalCount;
  const totalPages = q ? 1 : Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-slate-500">
            {total} {status} products — edit sale rates and GST
            {!q && totalPages > 1 && ` (page ${page} of ${totalPages})`}
          </p>
          {status === "inactive" ? (
            <p className="text-xs text-slate-500">
              Hidden from billing. Activate a product to sell it again.
            </p>
          ) : null}
          <p className="text-xs text-slate-400">
            {todayLabelCount === 1
              ? "1 label printed today"
              : `${todayLabelCount} labels printed today`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <ProductSearch
            defaultQuery={q ?? ""}
            status={status}
            sort={sort}
            dir={dir}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Show
            </span>
            {(
              [
                ["active", `Active (${activeCount})`],
                ["inactive", `Inactive (${inactiveCount})`],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                asChild
                size="sm"
                variant={status === key ? "default" : "outline"}
              >
                <Link href={statusHref(key)}>{label}</Link>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <ProductSortBar sort={sort} dir={dir} q={q} status={status} />

      <Card>
        <CardContent className="p-0">
          {products.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              {status === "inactive"
                ? "No inactive products."
                : "No products found."}
            </p>
          ) : (
            <ProductTable products={products} presentDots={presentDots} />
          )}
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

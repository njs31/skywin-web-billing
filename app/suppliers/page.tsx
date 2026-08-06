import Link from "next/link";
import { getSuppliers, getSupplierCount } from "@/lib/queries/suppliers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { SupplierList } from "@/components/suppliers/supplier-list";

const PAGE_SIZE = 20;

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const [suppliers, totalCount] = await Promise.all([
    getSuppliers(q, page, PAGE_SIZE),
    getSupplierCount(q),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Suppliers</h1>
          <p className="text-sm text-slate-500">
            {totalCount} suppliers — page {currentPage} of {totalPages}
          </p>
        </div>
        <AddSupplierDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Suppliers List
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <SupplierList
            suppliers={suppliers}
            totalCount={totalCount}
            currentPage={currentPage}
            pageSize={PAGE_SIZE}
            defaultQuery={q ?? ""}
          />
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button asChild variant="outline" size="sm" disabled={currentPage <= 1}>
            <Link
              href={`/suppliers?${new URLSearchParams({
                ...(q ? { q } : {}),
                page: String(currentPage - 1),
              }).toString()}`}
            >
              Previous
            </Link>
          </Button>
          <span className="text-sm text-slate-500">
            Page {currentPage} of {totalPages}
          </span>
          <Button asChild variant="outline" size="sm" disabled={currentPage >= totalPages}>
            <Link
              href={`/suppliers?${new URLSearchParams({
                ...(q ? { q } : {}),
                page: String(currentPage + 1),
              }).toString()}`}
            >
              Next
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

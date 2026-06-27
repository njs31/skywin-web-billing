import Link from "next/link";
import { StockExcelImport } from "@/components/stock/stock-excel-import";
import { Button } from "@/components/ui/button";

export default function StockImportPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Import Stock from Excel</h1>
          <p className="text-sm text-slate-500">
            Bulk add stock when new inventory arrives
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/stock">Back to Stock</Link>
        </Button>
      </div>
      <StockExcelImport />
    </div>
  );
}

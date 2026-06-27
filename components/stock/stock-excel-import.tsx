"use client";

import { useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { importStockFromExcel } from "@/lib/actions/products";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Upload } from "lucide-react";
import Link from "next/link";

function parseExcelFile(file: File): Promise<{ code: string; qty: number; rate?: number }[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });

        // Auto-detect header row
        let headerRowIndex = 0;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;
          
          const hasItemOrCode = row.some(cell => {
            const val = String(cell).toLowerCase().trim().replace(/\s/g, "");
            return val.includes("item") || val.includes("description") || val.includes("name") || val.includes("barcode") || val.includes("sku") || val.includes("code");
          });
          
          const hasQty = row.some(cell => {
            const val = String(cell).toLowerCase().trim().replace(/\s/g, "");
            return val.includes("qty") || val.includes("quantity") || val.includes("stock") || val.includes("units");
          });
          
          if (hasItemOrCode && hasQty) {
            headerRowIndex = i;
            break;
          }
        }

        const headers = rows[headerRowIndex].map(h => String(h).toLowerCase().trim().replace(/\s/g, ""));
        const codeIdx = headers.findIndex(h => h.includes("barcode") || h.includes("qr") || h.includes("sku") || h.includes("code") || h.includes("item") || h.includes("description") || h.includes("name"));
        const qtyIdx = headers.findIndex(h => h.includes("qty") || h.includes("quantity") || h.includes("stock") || h.includes("units"));
        const rateIdx = headers.findIndex(h => h.includes("rate") || h.includes("price") || h.includes("cost"));

        const parsed: { code: string; qty: number; rate?: number }[] = [];
        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !Array.isArray(row)) continue;
          
          const code = codeIdx !== -1 ? String(row[codeIdx] ?? "").trim() : "";
          const qty = qtyIdx !== -1 ? parseFloat(String(row[qtyIdx] ?? "0")) : 0;
          const rate = rateIdx !== -1 && row[rateIdx] !== "" && row[rateIdx] !== undefined ? parseFloat(String(row[rateIdx])) : undefined;
          
          if (code && !isNaN(qty) && qty > 0) {
            const lowerCode = code.toLowerCase();
            if (lowerCode.includes("total") || lowerCode.includes("margerp") || lowerCode.includes("items")) {
              continue;
            }
            parsed.push({ code, qty, rate });
          }
        }

        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Barcode", "Quantity", "Rate"],
    ["SW000001", 10, 100],
    ["TPCK007", 25, 225.5],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stock Import");
  XLSX.writeFile(wb, "stock-import-template.xlsx");
}

export function StockExcelImport() {
  const [preview, setPreview] = useState<
    { code: string; qty: number; rate?: number }[]
  >([]);
  const [result, setResult] = useState<{
    imported: number;
    failed: { row: number; code: string; reason: string }[];
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    const rows = await parseExcelFile(file);
    setPreview(rows);
    e.target.value = "";
  };

  const importRows = () => {
    if (preview.length === 0) return;
    startTransition(async () => {
      const res = await importStockFromExcel(preview);
      setResult(res);
      if (res.imported > 0) setPreview([]);
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Excel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            Excel columns: <strong>Barcode</strong> (or SKU/Code),{" "}
            <strong>Quantity</strong>, optional <strong>Rate</strong>. Each row
            adds stock to the matching product.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
            <label>
              <Button type="button" asChild>
                <span>
                  <Upload className="mr-2 h-4 w-4" />
                  Choose Excel File
                </span>
              </Button>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => void handleFile(e)}
              />
            </label>
          </div>
        </CardContent>
      </Card>

      {preview.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Preview ({preview.length} rows)
            </CardTitle>
            <Button disabled={isPending} onClick={importRows}>
              {isPending ? "Importing..." : "Import Stock"}
            </Button>
          </CardHeader>
          <CardContent className="max-h-80 overflow-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Barcode / Code</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.slice(0, 50).map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.code}</TableCell>
                    <TableCell className="text-right">{row.qty}</TableCell>
                    <TableCell className="text-right">
                      {row.rate ?? "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {preview.length > 50 && (
              <p className="p-3 text-xs text-slate-400">
                Showing first 50 of {preview.length} rows
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent className="p-6">
            <p className="font-semibold text-emerald-700">
              Imported {result.imported} products successfully
            </p>
            {result.failed.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-red-600">
                  {result.failed.length} rows failed:
                </p>
                <ul className="mt-1 max-h-40 overflow-auto text-xs text-slate-600">
                  {result.failed.map((f, i) => (
                    <li key={i}>
                      Row {f.row}: {f.code} — {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button asChild className="mt-4" variant="outline">
              <Link href="/stock">View Stock</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

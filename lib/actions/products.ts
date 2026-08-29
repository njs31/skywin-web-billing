"use server";

import {
  searchProducts as searchProductsQuery,
  searchProductBatches as searchProductBatchesQuery,
  updateProduct as updateProductQuery,
  deleteProduct as deleteProductQuery,
  getProductBatches as getProductBatchesQuery,
  updateBatch as updateBatchQuery,
  getAllProductsForExport,
  getProductsExportForDateRange,
} from "@/lib/queries/products";
import { getProductByScanCode as getProductByScanCodeQuery } from "@/lib/queries/stock-import";
import {
  importStockFromRows as importStockFromRowsQuery,
  type StockImportRow,
} from "@/lib/queries/stock-import";
import { requireNonDealer, requireUser } from "@/lib/actions/auth";

export async function getStockExportData() {
  await requireNonDealer();
  return getAllProductsForExport();
}

export async function getProductsExportData(fromDate: string, toDate: string) {
  await requireNonDealer();
  return getProductsExportForDateRange(fromDate, toDate);
}

export async function searchProducts(query: string, limit = 20) {
  await requireUser();
  return searchProductsQuery(query, limit);
}

export async function searchProductBatches(
  query: string,
  limit = 30,
  options?: { onlyInStock?: boolean }
) {
  await requireUser();
  return searchProductBatchesQuery(query, limit, options);
}

export async function getProductByScanCode(code: string) {
  await requireUser();
  return getProductByScanCodeQuery(code);
}

export async function updateProduct(
  id: number,
  data: {
    saleRate: number;
    purchaseRate?: number;
    gstRate: number;
    stockQty?: number;
    hsnCode?: string;
    expiryDate?: string | null;
    mrp?: number | null;
    discountPercent?: number;
    name?: string;
    unit?: string;
  }
) {
  await requireNonDealer();
  return updateProductQuery(id, data);
}

export async function getProductBatches(productId: number) {
  await requireNonDealer();
  return getProductBatchesQuery(productId);
}

export async function updateBatch(
  batchId: number,
  data: {
    saleRate?: number;
    purchaseRate?: number;
    expiryDate?: string | null;
    notes?: string | null;
  }
) {
  await requireNonDealer();
  return updateBatchQuery(batchId, data);
}

export async function deleteProduct(id: number) {
  await requireNonDealer();
  return deleteProductQuery(id);
}

export async function importStockFromExcel(rows: StockImportRow[]) {
  await requireNonDealer();
  return importStockFromRowsQuery(rows);
}

export async function resolveProductsForImport(rows: StockImportRow[]) {
  await requireNonDealer();
  const resolved = [];
  const failed = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const product = await getProductByScanCodeQuery(row.code);
    if (product) {
      resolved.push({
        product,
        qty: row.qty,
        rate: row.rate !== undefined ? row.rate : parseFloat(product.purchaseRate),
      });
    } else {
      failed.push({
        row: i + 1,
        code: row.code,
        reason: "Product not found by barcode, SKU, or name",
      });
    }
  }

  return { resolved, failed };
}

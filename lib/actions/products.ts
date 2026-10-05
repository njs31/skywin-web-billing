"use server";

import {
  searchProducts as searchProductsQuery,
  searchProductBatches as searchProductBatchesQuery,
  getProductBatchesById as getProductBatchesByIdQuery,
  updateProduct as updateProductQuery,
  deleteProduct as deleteProductQuery,
  getProductBatches as getProductBatchesQuery,
  getProductChangeLogs as getProductChangeLogsQuery,
  getProductById as getProductByIdQuery,
  updateBatch as updateBatchQuery,
  getAllProductsForExport,
  getProductsExportForDateRange,
} from "@/lib/queries/products";
import { getProductByScanCode as getProductByScanCodeQuery } from "@/lib/queries/stock-import";
import {
  importStockFromRows as importStockFromRowsQuery,
  type StockImportRow,
} from "@/lib/queries/stock-import";
import { getCurrentUser, requireNonDealer, requireUser } from "@/lib/actions/auth";

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

/** Batches for one product, for the POS scan flow to offer a choice when
 *  a scanned barcode's product has more than one. */
export async function getProductBatchesForScan(productId: number) {
  await requireUser();
  return getProductBatchesByIdQuery(productId);
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
  const user = await getCurrentUser();
  return updateProductQuery(id, data, {
    userId: user?.id ?? null,
    userName: user?.name?.trim() || "Unknown",
  });
}

export async function getProductChangeLogs(productId: number) {
  await requireNonDealer();
  return getProductChangeLogsQuery(productId);
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
  const user = await requireNonDealer();
  const existing = await getProductByIdQuery(id);
  await deleteProductQuery(id);
  const { recordActivity } = await import("@/lib/queries/activity-logs");
  const name = user.name.trim() || user.phone;
  await recordActivity({
    action: "product.delete",
    message: `${name} removed product ${existing?.name ?? `#${id}`}`,
    entityType: "product",
    entityId: id,
    actor: { id: user.id, name },
  });
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

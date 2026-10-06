"use server";

import {
  createPurchase as createPurchaseMutation,
  getPurchaseReport,
  searchPurchasesForReturn as searchPurchasesForReturnQuery,
  updatePurchase as updatePurchaseMutation,
} from "@/lib/queries/purchases";
import { requirePurchasingAccess, requireUser } from "@/lib/actions/auth";

function savePurchaseError(error: unknown) {
  return {
    error:
      error instanceof Error ? error.message : "Failed to save purchase",
  };
}

export async function createPurchase(
  input: Parameters<typeof createPurchaseMutation>[0]
) {
  await requirePurchasingAccess();
  try {
    return await createPurchaseMutation(input);
  } catch (error) {
    return savePurchaseError(error);
  }
}

export async function updatePurchase(
  input: Parameters<typeof updatePurchaseMutation>[0]
) {
  await requirePurchasingAccess();
  try {
    return await updatePurchaseMutation(input);
  } catch (error) {
    return savePurchaseError(error);
  }
}

export async function getPurchaseReportData(fromDate: string, toDate: string) {
  await requirePurchasingAccess();
  return getPurchaseReport(fromDate, toDate);
}

export async function searchPurchasesForReturn(
  query: string,
  options?: { supplierId?: number; limit?: number }
) {
  await requirePurchasingAccess();
  return searchPurchasesForReturnQuery(query, options);
}

"use server";

import {
  createPurchase as createPurchaseMutation,
  getPurchaseReport,
  searchPurchasesForReturn as searchPurchasesForReturnQuery,
  updatePurchase as updatePurchaseMutation,
} from "@/lib/queries/purchases";
import { requirePurchasingAccess, requireUser } from "@/lib/actions/auth";

export async function createPurchase(
  input: Parameters<typeof createPurchaseMutation>[0]
) {
  await requirePurchasingAccess();
  return createPurchaseMutation(input);
}

export async function updatePurchase(
  input: Parameters<typeof updatePurchaseMutation>[0]
) {
  await requirePurchasingAccess();
  return updatePurchaseMutation(input);
}

export async function getPurchaseReportData(fromDate: string, toDate: string) {
  await requireUser();
  return getPurchaseReport(fromDate, toDate);
}

export async function searchPurchasesForReturn(
  query: string,
  options?: { supplierId?: number; limit?: number }
) {
  await requirePurchasingAccess();
  return searchPurchasesForReturnQuery(query, options);
}

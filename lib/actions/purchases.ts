"use server";

import {
  createPurchase as createPurchaseMutation,
  searchPurchasesForReturn as searchPurchasesForReturnQuery,
} from "@/lib/queries/purchases";
import { requirePurchasingAccess } from "@/lib/actions/auth";

export async function createPurchase(
  input: Parameters<typeof createPurchaseMutation>[0]
) {
  await requirePurchasingAccess();
  return createPurchaseMutation(input);
}

export async function searchPurchasesForReturn(
  query: string,
  options?: { supplierId?: number; limit?: number }
) {
  await requirePurchasingAccess();
  return searchPurchasesForReturnQuery(query, options);
}

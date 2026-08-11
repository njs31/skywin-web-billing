"use server";

import {
  createPurchase as createPurchaseMutation,
  searchPurchasesForReturn as searchPurchasesForReturnQuery,
} from "@/lib/queries/purchases";

export async function createPurchase(
  input: Parameters<typeof createPurchaseMutation>[0]
) {
  return createPurchaseMutation(input);
}

export async function searchPurchasesForReturn(
  query: string,
  options?: { supplierId?: number; limit?: number }
) {
  return searchPurchasesForReturnQuery(query, options);
}

"use server";

import { createPurchase as createPurchaseMutation } from "@/lib/queries/purchases";

export async function createPurchase(
  input: Parameters<typeof createPurchaseMutation>[0]
) {
  return createPurchaseMutation(input);
}

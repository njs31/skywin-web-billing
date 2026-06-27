"use server";

import { createSale as createSaleMutation } from "@/lib/queries/sales";

export async function createSale(
  input: Parameters<typeof createSaleMutation>[0]
) {
  return createSaleMutation(input);
}

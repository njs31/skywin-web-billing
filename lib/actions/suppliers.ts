"use server";

import {
  createSupplier as createSupplierMutation,
  type CreateSupplierInput,
} from "@/lib/queries/suppliers";

export async function createSupplier(input: CreateSupplierInput) {
  return createSupplierMutation(input);
}

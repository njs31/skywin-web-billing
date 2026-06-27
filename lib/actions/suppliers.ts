"use server";

import { createSupplier as createSupplierMutation } from "@/lib/queries/suppliers";

export async function createSupplier(name: string, contact?: string) {
  return createSupplierMutation(name, contact);
}

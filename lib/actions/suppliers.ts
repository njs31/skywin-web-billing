"use server";

import {
  createSupplier as createSupplierMutation,
  updateSupplier as updateSupplierMutation,
  deleteSupplier as deleteSupplierMutation,
  type CreateSupplierInput,
} from "@/lib/queries/suppliers";
import { assertSupplierConfirmPin } from "@/lib/supplier-pin";

export async function createSupplier(input: CreateSupplierInput) {
  return createSupplierMutation(input);
}

export async function updateSupplier(
  id: number,
  input: CreateSupplierInput,
  pin: string
) {
  assertSupplierConfirmPin(pin);
  return updateSupplierMutation(id, input);
}

export async function deleteSupplier(id: number, pin: string) {
  assertSupplierConfirmPin(pin);
  return deleteSupplierMutation(id);
}

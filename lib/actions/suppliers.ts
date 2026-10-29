"use server";

import {
  createSupplier as createSupplierMutation,
  updateSupplier as updateSupplierMutation,
  deleteSupplier as deleteSupplierMutation,
  type CreateSupplierInput,
} from "@/lib/queries/suppliers";
import { assertSupplierConfirmPin } from "@/lib/supplier-pin";
import { requireMatrix, requirePurchasingAccess } from "@/lib/actions/auth";

export async function createSupplier(input: CreateSupplierInput) {
  await requirePurchasingAccess();
  await requireMatrix("suppliers", "create");
  return createSupplierMutation(input);
}

export async function updateSupplier(
  id: number,
  input: CreateSupplierInput,
  pin: string
) {
  await requirePurchasingAccess();
  await requireMatrix("suppliers", "edit");
  assertSupplierConfirmPin(pin);
  return updateSupplierMutation(id, input);
}

export async function deleteSupplier(id: number, pin: string) {
  await requirePurchasingAccess();
  await requireMatrix("suppliers", "edit");
  assertSupplierConfirmPin(pin);
  return deleteSupplierMutation(id);
}

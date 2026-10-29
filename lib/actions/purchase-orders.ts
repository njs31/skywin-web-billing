"use server";

import {
  createPurchaseOrder as createPurchaseOrderMutation,
  getPurchaseOrders as getPurchaseOrdersQuery,
  getPurchaseOrderById as getPurchaseOrderByIdQuery,
  updatePurchaseOrderAmounts as updatePurchaseOrderAmountsMutation,
} from "@/lib/queries/purchase-orders";
import { requireMatrix, requireNonDealer } from "@/lib/actions/auth";

export async function createPurchaseOrder(
  input: Parameters<typeof createPurchaseOrderMutation>[0]
) {
  await requireNonDealer();
  await requireMatrix("purchase_orders", "create");
  return createPurchaseOrderMutation(input);
}

export async function getPurchaseOrders() {
  await requireNonDealer();
  await requireMatrix("purchase_orders", "view");
  return getPurchaseOrdersQuery();
}

export async function getPurchaseOrderById(id: number) {
  await requireNonDealer();
  await requireMatrix("purchase_orders", "view");
  return getPurchaseOrderByIdQuery(id);
}

export async function updatePurchaseOrderAmounts(
  input: Parameters<typeof updatePurchaseOrderAmountsMutation>[0]
) {
  await requireNonDealer();
  await requireMatrix("purchase_orders", "edit");
  return updatePurchaseOrderAmountsMutation(input);
}

"use server";

import {
  createPurchaseOrder as createPurchaseOrderMutation,
  getPurchaseOrders as getPurchaseOrdersQuery,
  getPurchaseOrderById as getPurchaseOrderByIdQuery,
  updatePurchaseOrderAmounts as updatePurchaseOrderAmountsMutation,
} from "@/lib/queries/purchase-orders";

export async function createPurchaseOrder(
  input: Parameters<typeof createPurchaseOrderMutation>[0]
) {
  return createPurchaseOrderMutation(input);
}

export async function getPurchaseOrders() {
  return getPurchaseOrdersQuery();
}

export async function getPurchaseOrderById(id: number) {
  return getPurchaseOrderByIdQuery(id);
}

export async function updatePurchaseOrderAmounts(
  input: Parameters<typeof updatePurchaseOrderAmountsMutation>[0]
) {
  return updatePurchaseOrderAmountsMutation(input);
}

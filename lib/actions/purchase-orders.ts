"use server";

import {
  createPurchaseOrder as createPurchaseOrderMutation,
  getPurchaseOrders as getPurchaseOrdersQuery,
  getPurchaseOrderById as getPurchaseOrderByIdQuery,
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

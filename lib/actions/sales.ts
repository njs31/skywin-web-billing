"use server";

import {
  createSale as createSaleMutation,
  cancelSale as cancelSaleMutation,
  getSalesReport,
  searchSalesForReturn as searchSalesForReturnQuery,
} from "@/lib/queries/sales";
import {
  assertCustomerAccess,
  requireUser,
  requireAdmin,
} from "@/lib/actions/auth";

export async function createSale(
  input: Parameters<typeof createSaleMutation>[0]
) {
  await requireUser();
  await assertCustomerAccess(input.customerId);
  return createSaleMutation(input);
}

export async function cancelSale(saleId: number, reason: string) {
  const admin = await requireAdmin();
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < 3) {
    throw new Error("A cancellation reason is required.");
  }
  return cancelSaleMutation(saleId, trimmed, admin.name || admin.phone || "admin");
}

export async function getSalesReportData(fromDate: string, toDate: string) {
  await requireUser();
  return getSalesReport(fromDate, toDate);
}

export async function searchSalesForReturn(
  query: string,
  options?: { customerId?: number; limit?: number }
) {
  await requireUser();
  return searchSalesForReturnQuery(query, options);
}

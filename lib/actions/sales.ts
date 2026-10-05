"use server";

import {
  createSale as createSaleMutation,
  cancelSale as cancelSaleMutation,
  updateSale as updateSaleMutation,
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
  const user = await requireUser();
  await assertCustomerAccess(input.customerId);
  // Operator is whoever is logged in — ignore any name the client sent.
  return createSaleMutation({
    ...input,
    operatorName: user.name.trim() || "Counter",
  });
}

export async function cancelSale(saleId: number, reason: string) {
  const admin = await requireAdmin();
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < 3) {
    throw new Error("A cancellation reason is required.");
  }
  return cancelSaleMutation(saleId, trimmed, admin.name || admin.phone || "admin");
}

export async function updateSale(
  input: Parameters<typeof updateSaleMutation>[0]
) {
  await requireAdmin();
  if (input.customerId) {
    await assertCustomerAccess(input.customerId);
  }
  return updateSaleMutation(input);
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

"use server";

import {
  createSale as createSaleMutation,
  getSalesReport,
  searchSalesForReturn as searchSalesForReturnQuery,
} from "@/lib/queries/sales";
import { assertCustomerAccess, requireUser } from "@/lib/actions/auth";

export async function createSale(
  input: Parameters<typeof createSaleMutation>[0]
) {
  await requireUser();
  await assertCustomerAccess(input.customerId);
  return createSaleMutation(input);
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

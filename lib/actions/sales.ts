"use server";

import {
  createSale as createSaleMutation,
  getSalesReport,
  searchSalesForReturn as searchSalesForReturnQuery,
} from "@/lib/queries/sales";

export async function createSale(
  input: Parameters<typeof createSaleMutation>[0]
) {
  return createSaleMutation(input);
}

export async function getSalesReportData(fromDate: string, toDate: string) {
  return getSalesReport(fromDate, toDate);
}

export async function searchSalesForReturn(
  query: string,
  options?: { customerId?: number; limit?: number }
) {
  return searchSalesForReturnQuery(query, options);
}

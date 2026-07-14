"use server";

import {
  createSale as createSaleMutation,
  getSalesReport,
} from "@/lib/queries/sales";

export async function createSale(
  input: Parameters<typeof createSaleMutation>[0]
) {
  return createSaleMutation(input);
}

export async function getSalesReportData(fromDate: string, toDate: string) {
  return getSalesReport(fromDate, toDate);
}

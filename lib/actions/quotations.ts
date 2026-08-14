"use server";

import {
  createQuotation as createQuotationMutation,
  getQuotations as getQuotationsQuery,
  getQuotationById as getQuotationByIdQuery,
} from "@/lib/queries/quotations";

export async function createQuotation(
  input: Parameters<typeof createQuotationMutation>[0]
) {
  return createQuotationMutation(input);
}

export async function getQuotations() {
  return getQuotationsQuery();
}

export async function getQuotationById(id: number) {
  return getQuotationByIdQuery(id);
}

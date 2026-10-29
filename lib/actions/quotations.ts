"use server";

import {
  createQuotation as createQuotationMutation,
  getQuotations as getQuotationsQuery,
  getQuotationById as getQuotationByIdQuery,
} from "@/lib/queries/quotations";
import { requireMatrix, requireNonDealer } from "@/lib/actions/auth";

export async function createQuotation(
  input: Parameters<typeof createQuotationMutation>[0]
) {
  await requireNonDealer();
  await requireMatrix("quotations", "create");
  return createQuotationMutation(input);
}

export async function getQuotations() {
  await requireNonDealer();
  await requireMatrix("quotations", "view");
  return getQuotationsQuery();
}

export async function getQuotationById(id: number) {
  await requireNonDealer();
  await requireMatrix("quotations", "view");
  return getQuotationByIdQuery(id);
}

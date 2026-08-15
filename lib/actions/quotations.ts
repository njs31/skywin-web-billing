"use server";

import {
  createQuotation as createQuotationMutation,
  getQuotations as getQuotationsQuery,
  getQuotationById as getQuotationByIdQuery,
} from "@/lib/queries/quotations";
import { requireNonDealer } from "@/lib/actions/auth";

export async function createQuotation(
  input: Parameters<typeof createQuotationMutation>[0]
) {
  await requireNonDealer();
  return createQuotationMutation(input);
}

export async function getQuotations() {
  await requireNonDealer();
  return getQuotationsQuery();
}

export async function getQuotationById(id: number) {
  await requireNonDealer();
  return getQuotationByIdQuery(id);
}

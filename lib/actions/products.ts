"use server";

import {
  searchProducts as searchProductsQuery,
  updateProduct as updateProductQuery,
} from "@/lib/queries/products";

export async function searchProducts(query: string, limit = 20) {
  return searchProductsQuery(query, limit);
}

export async function updateProduct(
  id: number,
  data: {
    saleRate: number;
    gstRate: number;
    stockQty?: number;
  }
) {
  return updateProductQuery(id, data);
}

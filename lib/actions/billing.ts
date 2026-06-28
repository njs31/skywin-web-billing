"use server";

import { createCustomer as createCustomerMutation, updateCustomer as updateCustomerMutation } from "@/lib/queries/customers";
import {
  createSaleReturn as createSaleReturnMutation,
  createPurchaseReturn as createPurchaseReturnMutation,
} from "@/lib/queries/returns";
import { createPartyPayment as createPartyPaymentMutation } from "@/lib/queries/payments";
import { adjustStock as adjustStockMutation } from "@/lib/queries/reports";
import { createProduct as createProductMutation } from "@/lib/queries/products";
import { updateSettings as updateSettingsMutation, type AppSettings } from "@/lib/settings";

export async function createCustomer(
  input: Parameters<typeof createCustomerMutation>[0]
) {
  return createCustomerMutation(input);
}

export async function updateCustomer(
  id: number,
  input: Parameters<typeof updateCustomerMutation>[1]
) {
  return updateCustomerMutation(id, input);
}

export async function createSaleReturn(
  input: Parameters<typeof createSaleReturnMutation>[0]
) {
  return createSaleReturnMutation(input);
}

export async function createPurchaseReturn(
  input: Parameters<typeof createPurchaseReturnMutation>[0]
) {
  return createPurchaseReturnMutation(input);
}

export async function createPartyPayment(
  input: Parameters<typeof createPartyPaymentMutation>[0]
) {
  return createPartyPaymentMutation(input);
}

export async function adjustStock(
  productId: number,
  qtyDelta: number,
  notes: string
) {
  return adjustStockMutation(productId, qtyDelta, notes);
}

export async function createProduct(
  input: Parameters<typeof createProductMutation>[0]
) {
  return createProductMutation(input);
}

export async function updateSettings(
  input: Partial<AppSettings>,
  currentPin?: string
) {
  if (input.inventoryAdminPin !== undefined) {
    const { getSetting } = await import("@/lib/settings");
    const storedPin = await getSetting("inventoryAdminPin");
    if (input.inventoryAdminPin !== storedPin) {
      if (!currentPin) {
        throw new Error("Current PIN is required to change the supervisor PIN.");
      }
      if (currentPin !== storedPin) {
        throw new Error("Current PIN is incorrect. Please enter the correct current PIN.");
      }
    }
  }
  return updateSettingsMutation(input);
}

export async function verifyInventoryAdminPin(pin: string): Promise<boolean> {
  const { getSetting } = await import("@/lib/settings");
  const isRequired = await getSetting("inventoryAdminPinRequired");
  if (isRequired !== "true") return true;
  const correctPin = await getSetting("inventoryAdminPin");
  return pin === correctPin;
}

export async function isInventoryPinRequired(): Promise<boolean> {
  const { getSetting } = await import("@/lib/settings");
  const isRequired = await getSetting("inventoryAdminPinRequired");
  return isRequired === "true";
}

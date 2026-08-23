"use server";

import { createCustomer as createCustomerMutation, updateCustomer as updateCustomerMutation } from "@/lib/queries/customers";
import {
  createSaleReturn as createSaleReturnMutation,
  createPurchaseReturn as createPurchaseReturnMutation,
  updateSaleReturn as updateSaleReturnMutation,
} from "@/lib/queries/returns";
import { createPartyPayment as createPartyPaymentMutation } from "@/lib/queries/payments";
import { adjustStock as adjustStockMutation } from "@/lib/queries/reports";
import { createProduct as createProductMutation } from "@/lib/queries/products";
import { updateSettings as updateSettingsMutation, type AppSettings } from "@/lib/settings";
import {
  assertCustomerAccess,
  requireAdmin,
  requireNonDealer,
  requirePurchasingAccess,
  requireUser,
} from "@/lib/actions/auth";

export async function createCustomer(
  input: Parameters<typeof createCustomerMutation>[0]
) {
  await requireUser();
  return createCustomerMutation(input);
}

export async function updateCustomer(
  id: number,
  input: Parameters<typeof updateCustomerMutation>[1]
) {
  await requireUser();
  await assertCustomerAccess(id);
  return updateCustomerMutation(id, input);
}

export async function createSaleReturn(
  input: Parameters<typeof createSaleReturnMutation>[0]
) {
  await requireNonDealer();
  return createSaleReturnMutation(input);
}

export async function updateSaleReturn(
  id: number,
  input: Parameters<typeof updateSaleReturnMutation>[1]
) {
  await requireNonDealer();
  return updateSaleReturnMutation(id, input);
}

export async function createPurchaseReturn(
  input: Parameters<typeof createPurchaseReturnMutation>[0]
) {
  await requirePurchasingAccess();
  return createPurchaseReturnMutation(input);
}

export async function createPartyPayment(
  input: Parameters<typeof createPartyPaymentMutation>[0]
) {
  await requireUser();
  await assertCustomerAccess(input.customerId);
  return createPartyPaymentMutation(input);
}

export async function adjustStock(
  productId: number,
  qtyDelta: number,
  notes: string,
  options?: {
    batchNumber?: string;
    expiryDate?: string | null;
    purchaseRate?: number;
  }
) {
  await requireNonDealer();
  return adjustStockMutation(productId, qtyDelta, notes, options);
}

export async function createProduct(
  input: Parameters<typeof createProductMutation>[0]
) {
  await requireNonDealer();
  return createProductMutation(input);
}

export async function updateSettings(
  input: Partial<AppSettings>,
  currentPin?: string
) {
  await requireAdmin();
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
  await requireUser();
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

export async function getCustomerOutstanding(customerId: number): Promise<number> {
  await requireUser();
  await assertCustomerAccess(customerId);
  const { getCustomerOutstanding: query } = await import("@/lib/queries/customers");
  return query(customerId);
}

export async function getOutstandingSalesForCustomer(customerId: number) {
  await requireUser();
  await assertCustomerAccess(customerId);
  const { getOutstandingSalesForCustomer: query } = await import(
    "@/lib/queries/payments"
  );
  return query(customerId);
}

export async function getOutstandingPurchasesForSupplier(supplierId: number) {
  await requirePurchasingAccess();
  const { getOutstandingPurchasesForSupplier: query } = await import(
    "@/lib/queries/payments"
  );
  return query(supplierId);
}

export async function getStockMovementsReportData(
  fromDate: string,
  toDate: string
) {
  await requireUser();
  const { getStockMovementsReport } = await import("@/lib/queries/reports");
  return getStockMovementsReport(fromDate, toDate);
}


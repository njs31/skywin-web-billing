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
  const user = await requireUser();
  const customer = await createCustomerMutation(input);
  const { recordActivity } = await import("@/lib/queries/activity-logs");
  const name = user.name.trim() || user.phone;
  await recordActivity({
    action: "customer.create",
    message: `${name} added customer ${customer.name}`,
    entityType: "customer",
    entityId: customer.id,
    actor: { id: user.id, name },
  });
  return customer;
}

export async function updateCustomer(
  id: number,
  input: Parameters<typeof updateCustomerMutation>[1]
) {
  const user = await requireUser();
  await assertCustomerAccess(id);
  const customer = await updateCustomerMutation(id, input);
  const { recordActivity } = await import("@/lib/queries/activity-logs");
  const name = user.name.trim() || user.phone;
  await recordActivity({
    action: "customer.update",
    message: `${name} updated customer ${customer.name}`,
    entityType: "customer",
    entityId: id,
    actor: { id: user.id, name },
  });
  return customer;
}

export async function createSaleReturn(
  input: Parameters<typeof createSaleReturnMutation>[0]
) {
  const user = await requireNonDealer();
  if (input.customerId) await assertCustomerAccess(input.customerId);
  const result = await createSaleReturnMutation(input);
  const { recordActivity } = await import("@/lib/queries/activity-logs");
  const name = user.name.trim() || user.phone;
  await recordActivity({
    action: "return.create",
    message: `${name} created credit note ${result.returnNo}`,
    entityType: "sale_return",
    entityId: result.id,
    actor: { id: user.id, name },
  });
  return result;
}

export async function updateSaleReturn(
  id: number,
  input: Parameters<typeof updateSaleReturnMutation>[1]
) {
  await requireNonDealer();
  if (input.customerId) await assertCustomerAccess(input.customerId);
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

export async function getNextReceiptVoucherNo() {
  await requireUser();
  const { peekNextReceiptVoucherNo } = await import(
    "@/lib/queries/receipt-voucher"
  );
  return peekNextReceiptVoucherNo();
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
  const user = await requireNonDealer();
  const result = await adjustStockMutation(productId, qtyDelta, notes, options);
  const { db } = await import("@/db");
  const { products } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const [product] = await db
    .select({ name: products.name })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  const { recordActivity } = await import("@/lib/queries/activity-logs");
  const { stockDeltaMessage } = await import("@/lib/activity-log");
  const name = user.name.trim() || user.phone;
  await recordActivity({
    action: "stock.adjust",
    message: stockDeltaMessage(name, product?.name ?? `product #${productId}`, qtyDelta),
    entityType: "product",
    entityId: productId,
    actor: { id: user.id, name },
  });
  return result;
}

export async function createProduct(
  input: Parameters<typeof createProductMutation>[0]
) {
  const user = await requireNonDealer();
  const product = await createProductMutation(input);
  if (product) {
    const { recordActivity } = await import("@/lib/queries/activity-logs");
    const name = user.name.trim() || user.phone;
    await recordActivity({
      action: "product.create",
      message: `${name} added product ${product.name}`,
      entityType: "product",
      entityId: product.id,
      actor: { id: user.id, name },
    });
  }
  return product;
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
  if (input.gstin !== undefined) {
    const { isValidGstin } = await import("@/lib/gst");
    if (!isValidGstin(input.gstin)) {
      throw new Error("Business GSTIN must be a valid 15-character GST number.");
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


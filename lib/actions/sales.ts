"use server";

import {
  createSale as createSaleMutation,
  cancelSale as cancelSaleMutation,
  updateSale as updateSaleMutation,
  getSalesReport,
  searchSalesForReturn as searchSalesForReturnQuery,
} from "@/lib/queries/sales";
import {
  assertCustomerAccess,
  requireUser,
  requireAdmin,
} from "@/lib/actions/auth";

export async function createSale(
  input: Parameters<typeof createSaleMutation>[0]
) {
  const user = await requireUser();
  await assertCustomerAccess(input.customerId);
  const actorName = user.name.trim() || "Counter";
  const sale = await createSaleMutation({
    ...input,
    operatorName: actorName,
  });
  const { recordActivity } = await import("@/lib/queries/activity-logs");
  await recordActivity({
    action: "sale.create",
    message: `${actorName} completed ${input.billType} sale ${sale.invoiceNo}`,
    entityType: "sale",
    entityId: sale.id,
    actor: { id: user.id, name: actorName },
  });
  return sale;
}

export async function cancelSale(saleId: number, reason: string) {
  const admin = await requireAdmin();
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < 3) {
    throw new Error("A cancellation reason is required.");
  }
  const actorName = admin.name || admin.phone || "admin";
  const result = await cancelSaleMutation(saleId, trimmed, actorName);
  const { recordActivity } = await import("@/lib/queries/activity-logs");
  await recordActivity({
    action: "sale.cancel",
    message: `${actorName} cancelled invoice ${result.invoiceNo}`,
    entityType: "sale",
    entityId: saleId,
    actor: { id: admin.id, name: actorName },
  });
  return result;
}

export async function updateSale(
  input: Parameters<typeof updateSaleMutation>[0]
) {
  const admin = await requireAdmin();
  if (input.customerId) {
    await assertCustomerAccess(input.customerId);
  }
  const result = await updateSaleMutation(input);
  const { recordActivity } = await import("@/lib/queries/activity-logs");
  const actorName = admin.name.trim() || admin.phone;
  await recordActivity({
    action: "sale.update",
    message: `${actorName} edited invoice ${result.invoiceNo}`,
    entityType: "sale",
    entityId: result.id,
    actor: { id: admin.id, name: actorName },
  });
  return result;
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

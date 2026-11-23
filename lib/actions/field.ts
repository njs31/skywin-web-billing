"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, fieldDeletionRequests, sales, users } from "@/db/schema";
import { getCurrentUser, requireAdmin, requireFieldAdmin } from "@/lib/actions/auth";
import { refundAmountPaise } from "@/lib/field-order-refund-rules";
import { refundFieldPayment } from "@/lib/field-order-refunds";
import { FIELD_OFFICER_ROLES, roleLabel } from "@/lib/user-roles";
import { createProduct } from "@/lib/queries/products";
import { searchProductBatches } from "@/lib/queries/products";
import {
  assignProductToSubcategory,
  createFieldCategory,
  createFieldSubcategory,
  deleteFieldCategory,
  deleteFieldSubcategory,
  getFieldCatalogTree,
  getFieldCategoryBySlug,
  listProductsByIds,
  setFieldCategoryIconUri,
  setFieldSubcategoryIconUri,
  unassignProductFromSubcategory,
  updateFieldCategory,
  updateFieldSubcategory,
} from "@/lib/queries/field-catalog";
import { recordActivity } from "@/lib/queries/activity-logs";
import {
  countFieldFarmers,
  createFieldFarmer,
  getFieldFarmer,
  listFieldFarmers,
  setFarmerApproval,
  updateFieldFarmer,
  type FieldFarmerApproval,
  type FieldFarmerInput,
} from "@/lib/queries/field-farmers";
import { fieldSaleWhere, listFieldOrders, qwicksSaleWhere } from "@/lib/queries/field-orders";
import { recordOrderCheckpoint } from "@/lib/services/shipping-checkpoints";
import { isDeliveryStep } from "@/lib/order-status";
import { officeLocation, pendingDeliveryStops } from "@/lib/queries/field-route";
import { inIndia, parseLatLng } from "@/lib/route-plan";
import { updateSettings } from "@/lib/settings";
import { broadcastAudienceSize, createBroadcast, listBroadcasts } from "@/lib/field-broadcast";
import type { BroadcastInput } from "@/lib/field-broadcast-rules";
import { cleanIconUri } from "@/lib/field-icon-url";
import {
  applyFieldProductImport,
  exportFieldProductRows,
  fieldProductVisibilityCounts,
  planFieldProductImport,
  setFieldProductAppVisible,
} from "@/lib/queries/field-product-excel";
import type { ProductSheetRow } from "@/lib/field-product-sheet";
import { exportFieldFarmerRows, exportFieldOfficerRows } from "@/lib/queries/field-exports";
import {
  deleteFieldRecommendation,
  listRecommendationsForUser,
  saveFieldRecommendation,
  searchRecommendationFarmers,
  searchRecommendationProducts,
} from "@/lib/queries/field-recommendations";
import { RecommendationError, canUseFieldRecommendations } from "@/lib/field-recommendation-access";
import {
  getFieldProductDetail,
  fieldProductCategories,
  fieldProductStats,
  listFieldCatalogProducts,
  listFieldProductsPage,
  upsertFieldProductDetail,
  type FieldProductDetailInput,
} from "@/lib/queries/field-product-details";

function touchField(paths: string[] = []) {
  revalidatePath("/field");
  revalidatePath("/field/catalog");
  revalidatePath("/field/farmers");
  revalidatePath("/field/officers");
  revalidatePath("/field/orders");
  revalidatePath("/field/recommendations");
  for (const path of paths) revalidatePath(path);
}

export async function fieldOverview() {
  await requireFieldAdmin();
  const [catalog, orders, farmers, officerRows, productStats, deletions] = await Promise.all([
    getFieldCatalogTree(),
    listFieldOrders(),
    countFieldFarmers(),
    db
      .select({ access: users.fieldAppAccess })
      .from(users)
      .where(inArray(users.role, [...FIELD_OFFICER_ROLES])),
    fieldProductStats(),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(fieldDeletionRequests)
      .where(eq(fieldDeletionRequests.status, "pending")),
  ]);
  const skuCount = catalog.reduce(
    (sum, category) =>
      sum + category.subs.reduce((inner, sub) => inner + sub.productIds.length, 0),
    0
  );
  return {
    categories: catalog.length,
    subcategories: catalog.reduce((sum, category) => sum + category.subs.length, 0),
    skuCount,
    todayCount: orders.todayCount,
    todayTotal: orders.todayTotal,
    monthCount: orders.monthCount,
    monthTotal: orders.monthTotal,
    farmers,
    officers: officerRows.length,
    officersWithAccess: officerRows.filter((o) => o.access).length,
    productsNeedingDetails: productStats.needsDetails,
    pendingDeletions: Number(deletions[0]?.count ?? 0),
    ordersToDispatch: orders.orders.filter((o) => o.status !== "cancelled" && !o.waybill).length,
    recentOrders: orders.orders.slice(0, 8).map((order) => ({
      id: order.id,
      invoiceNo: order.invoiceNo,
      externalOrderId: order.externalOrderId,
      date: order.date,
      customerName: order.customerName,
      operatorName: order.operatorName,
      grandTotal: order.grandTotal,
      paymentMode: order.paymentMode,
      status: order.status,
      placedGps: order.placedGps,
      waybill: order.waybill,
      stage: order.stage,
    })),
  };
}

export async function fieldCatalogTree() {
  await requireFieldAdmin();
  return getFieldCatalogTree();
}

export async function fieldCategoryPage(slug: string) {
  await requireFieldAdmin();
  const category = await getFieldCategoryBySlug(slug);
  if (!category) return null;
  const productSets = await Promise.all(
    category.subs.map(async (sub) => ({
      subcategoryId: sub.id,
      products: await listProductsByIds(sub.productIds),
    }))
  );
  return { category, productSets };
}

export async function saveFieldCategory(input: {
  id?: number;
  title: string;
  slug?: string;
  queries: string;
  iconKey?: string;
}) {
  await requireFieldAdmin();
  const queries = splitList(input.queries);
  if (input.id) {
    await updateFieldCategory(input.id, {
      title: input.title,
      queries,
      iconKey: input.iconKey,
    });
  } else {
    await createFieldCategory({
      slug: input.slug || input.title,
      title: input.title,
      queries,
      iconKey: input.iconKey || input.title,
    });
  }
  touchField();
}

/** Catalog → category icon. Null removes it. */
export async function setFieldCategoryIcon(id: number, iconUri: string | null) {
  await requireFieldAdmin();
  await setFieldCategoryIconUri(id, cleanIconUri(iconUri));
  touchField();
}

/** Catalog → subcategory icon. Null removes it. */
export async function setFieldSubcategoryIcon(id: number, iconUri: string | null) {
  await requireFieldAdmin();
  await setFieldSubcategoryIconUri(id, cleanIconUri(iconUri));
  touchField();
}

export async function removeFieldCategory(id: number) {
  await requireFieldAdmin();
  await deleteFieldCategory(id);
  touchField();
}

export async function saveFieldSubcategory(input: {
  id?: number;
  categoryId: number;
  title: string;
  slug?: string;
  queries: string;
  matchTerms: string;
  iconKey?: string;
  iconUri?: string;
  iconTint?: boolean;
}) {
  await requireFieldAdmin();
  const queries = splitList(input.queries);
  const matchTerms = splitList(input.matchTerms);
  if (input.id) {
    await updateFieldSubcategory(input.id, {
      title: input.title,
      queries,
      matchTerms,
      iconKey: input.iconKey,
      iconUri: input.iconUri,
      iconTint: input.iconTint,
    });
  } else {
    await createFieldSubcategory({
      categoryId: input.categoryId,
      slug: input.slug || input.title,
      title: input.title,
      queries,
      matchTerms,
      iconKey: input.iconKey,
      iconUri: input.iconUri,
      iconTint: input.iconTint,
    });
  }
  touchField();
}

export async function removeFieldSubcategory(id: number) {
  await requireFieldAdmin();
  await deleteFieldSubcategory(id);
  touchField();
}

export async function searchBillingProducts(q: string) {
  await requireFieldAdmin();
  return searchProductBatches(q, 20, { onlyInStock: false });
}

export async function pinProductToSub(subcategoryId: number, productId: number) {
  await requireFieldAdmin();
  await assignProductToSubcategory(subcategoryId, productId);
  touchField();
}

export async function unpinProductFromSub(subcategoryId: number, productId: number) {
  await requireFieldAdmin();
  await unassignProductFromSubcategory(subcategoryId, productId);
  touchField();
}

export async function createBillingProductForSub(
  subcategoryId: number,
  input: {
    name: string;
    sku?: string;
    saleRate: number;
    purchaseRate?: number;
    gstRate: number;
    hsnCode: string;
    stockQty?: number;
  }
) {
  await requireFieldAdmin();
  const product = await createProduct({
    name: input.name,
    sku: input.sku,
    unit: "pcs",
    purchaseRate: input.purchaseRate ?? input.saleRate,
    saleRate: input.saleRate,
    gstRate: input.gstRate,
    hsnCode: input.hsnCode,
    stockQty: input.stockQty ?? 0,
    reorderLevel: 10,
  });
  await assignProductToSubcategory(subcategoryId, product.id);
  touchField(["/products"]);
  return product;
}

export async function fieldProductsList() {
  await requireFieldAdmin();
  return listFieldCatalogProducts();
}

export async function fieldProductsPage(filter?: {
  q?: string;
  category?: string;
  status?: "all" | "needs" | "complete";
  visible?: "all" | "on" | "off";
  page?: number;
}) {
  await requireFieldAdmin();
  const [stats, categories, list, visibility] = await Promise.all([
    fieldProductStats(),
    fieldProductCategories(),
    listFieldProductsPage(filter),
    fieldProductVisibilityCounts(),
  ]);
  return { stats: { ...stats, hidden: visibility.hidden }, categories, ...list };
}

/** Product details → In app switch: off hides the product from farmers and officers in the app. */
export async function setFieldProductVisible(productId: number, visible: boolean) {
  const user = await requireFieldAdmin();
  if (!Number.isInteger(productId) || productId <= 0) throw new Error("Unknown product.");
  await setFieldProductAppVisible(productId, visible);
  const name = user.name.trim() || user.phone;
  await recordActivity({
    action: "product.update",
    message: `${name} switched product #${productId} ${visible ? "on" : "off"} in the Field app`,
    entityType: "product",
    entityId: productId,
    actor: { id: user.id, name },
  }).catch(() => undefined);
  touchField(["/field/products", `/field/products/${productId}`]);
  return { productId, visible };
}

/** Farmers → Export to Excel: the farmers matching the page's search. */
export async function exportFieldFarmers(filter?: { q?: string }) {
  await requireFieldAdmin();
  return exportFieldFarmerRows({ q: filter?.q?.slice(0, 120) });
}

/** Officers → Export to Excel. */
export async function exportFieldOfficers() {
  await requireFieldAdmin();
  return exportFieldOfficerRows();
}

/** Product details → Export to Excel: every product listed for the app. */
export async function exportFieldProducts() {
  await requireFieldAdmin();
  return exportFieldProductRows();
}

/** Product details → Import from Excel, step 1: what each row would change. Saves nothing. */
export async function previewFieldProductImport(rows: ProductSheetRow[]) {
  await requireFieldAdmin();
  if (!Array.isArray(rows)) throw new Error("No rows to import.");
  return planFieldProductImport(rows);
}

/** Product details → Import from Excel, step 2: saves the rows. */
export async function applyFieldProductImportAction(rows: ProductSheetRow[]) {
  const user = await requireFieldAdmin();
  if (!Array.isArray(rows)) throw new Error("No rows to import.");
  const name = user.name.trim() || user.phone;
  const result = await applyFieldProductImport(rows, { userId: user.id, userName: name });
  await recordActivity({
    action: "product.import",
    message: `${name} imported products from Excel: ${result.created} new, ${result.updated} updated, ${result.failed.length} failed`,
    entityType: "product",
    actor: { id: user.id, name },
  }).catch(() => undefined);
  touchField(["/field/products", "/products", "/stock"]);
  return result;
}

export async function fieldProductDetail(productId: number) {
  await requireFieldAdmin();
  return getFieldProductDetail(productId);
}

export async function saveFieldProductDetail(productId: number, input: FieldProductDetailInput) {
  await requireFieldAdmin();
  await upsertFieldProductDetail(productId, input);
  touchField(["/field/products", `/field/products/${productId}`]);
}

export async function fieldFarmersList(filter?: {
  q?: string;
  approval?: FieldFarmerApproval | "all";
  page?: number;
}) {
  await requireFieldAdmin();
  const pageSize = 100;
  const page = Math.max(1, filter?.page ?? 1);
  const query = { q: filter?.q, approval: filter?.approval };
  const [total, farmers] = await Promise.all([
    countFieldFarmers(query),
    listFieldFarmers({ ...query, limit: pageSize, offset: (page - 1) * pageSize }),
  ]);
  return { farmers, total, page, pageSize };
}

export async function fieldFarmerDetail(id: number) {
  await requireFieldAdmin();
  return getFieldFarmer(id);
}

export async function saveFieldFarmer(input: FieldFarmerInput, id?: number) {
  const user = await requireFieldAdmin();
  const before = id ? await getFieldFarmer(id) : null;
  if (id && !before) throw new Error("Farmer not found");
  const row = id ? await updateFieldFarmer(id, input) : await createFieldFarmer(input);
  if (!row) throw new Error("Farmer was not saved");
  const changed = before ? farmerChangeLabels(before, row) : [];
  await recordActivity({
    action: id ? "field.farmer.update" : "field.farmer.create",
    message: id
      ? changed.length
        ? `Updated farmer ${row.id} (${changed.join(", ")})`
        : `Updated farmer ${row.id}`
      : `Added farmer ${row.id}`,
    entityType: "customer",
    entityId: row.id,
    actor: { id: user.id, name: user.name },
  });
  touchField([`/field/farmers/${row.id}`]);
  return row;
}

function farmerChangeLabels(
  before: NonNullable<Awaited<ReturnType<typeof getFieldFarmer>>>,
  after: NonNullable<Awaited<ReturnType<typeof getFieldFarmer>>>
) {
  const labels: string[] = [];
  const pairs: Array<[string, string, string]> = [
    ["name", before.name, after.name],
    ["village", before.village, after.village],
    ["address", before.address, after.address],
    ["pin", before.pin, after.pin],
    ["territory", before.territory, after.territory],
    ["alternate phone", before.altPhone, after.altPhone],
    ["language", before.language, after.language],
    ["officer", String(before.assignedOfficerId ?? ""), String(after.assignedOfficerId ?? "")],
    ["payment", before.paymentMode, after.paymentMode],
    ["reward points", String(before.rewardPoints), String(after.rewardPoints)],
    ["photo", before.photo ?? "", after.photo ?? ""],
  ];
  for (const [label, left, right] of pairs) {
    if (left !== right) labels.push(label);
  }
  if (JSON.stringify(before.farms) !== JSON.stringify(after.farms)) labels.push("farms");
  return labels;
}

export async function approveFieldFarmer(id: number, approval: FieldFarmerApproval) {
  await requireFieldAdmin();
  const row = await setFarmerApproval(id, approval);
  touchField([`/field/farmers/${id}`]);
  return row;
}

export async function fieldOfficers() {
  await requireFieldAdmin();
  return db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      role: users.role,
      access: users.fieldAppAccess,
      createdAt: users.createdAt,
      farmers: sql<number>`(select count(*)::int from ${customers} where ${customers.assignedOfficerId} = ${users.id})`,
    })
    .from(users)
    .where(inArray(users.role, [...FIELD_OFFICER_ROLES]))
    .orderBy(users.name);
}

export async function setFieldOfficerAccess(id: number, access: boolean) {
  await requireFieldAdmin();
  await db
    .update(users)
    .set({ fieldAppAccess: access })
    .where(and(eq(users.id, id), inArray(users.role, [...FIELD_OFFICER_ROLES])));
  touchField(["/field/officers"]);
}

async function validateOfficerInput(input: { name: string; phone: string }, exceptId?: number) {
  const cleanPhone = input.phone.trim().replace(/\D/g, "").slice(-10);
  const cleanName = input.name.trim();
  if (!cleanName) return { ok: false as const, error: "Name is required" };
  if (cleanPhone.length !== 10) return { ok: false as const, error: "Valid 10-digit phone number is required" };
  const [existing] = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(
      and(
        sql`right(regexp_replace(${users.phone}, '\\D', '', 'g'), 10) = ${cleanPhone}`,
        exceptId ? ne(users.id, exceptId) : undefined
      )
    )
    .limit(1);
  if (existing) {
    return {
      ok: false as const,
      error: `${existing.name} is already listed here as ${roleLabel(existing.role)}.`,
    };
  }
  return { ok: true as const, name: cleanName, phone: cleanPhone };
}

export async function createFieldOfficer(input: { name: string; phone: string }) {
  await requireFieldAdmin();
  const valid = await validateOfficerInput(input);
  if (!valid.ok) return valid;
  const [user] = await db
    .insert(users)
    .values({ name: valid.name, phone: valid.phone, role: "sales_officer" })
    .returning();
  touchField(["/users"]);
  return { ok: true as const, user };
}

export async function updateFieldOfficer(id: number, input: { name: string; phone: string }) {
  await requireFieldAdmin();
  const valid = await validateOfficerInput(input, id);
  if (!valid.ok) return valid;
  const [user] = await db
    .update(users)
    .set({ name: valid.name, phone: valid.phone })
    .where(and(eq(users.id, id), inArray(users.role, [...FIELD_OFFICER_ROLES])))
    .returning();
  if (!user) return { ok: false as const, error: "Officer not found." };
  touchField(["/users"]);
  return { ok: true as const, user };
}

export async function deleteFieldOfficer(id: number) {
  await requireFieldAdmin();
  try {
    const deleted = await db.transaction(async (tx) => {
      await tx
        .update(customers)
        .set({ assignedOfficerId: null })
        .where(eq(customers.assignedOfficerId, id));
      return tx
        .delete(users)
        .where(and(eq(users.id, id), eq(users.role, "sales_officer")))
        .returning({ id: users.id });
    });
    if (deleted.length === 0) return { ok: false as const, error: "Officer not found." };
  } catch {
    return {
      ok: false as const,
      error: "This officer has billing history and can't be deleted. Revoke their app access instead.",
    };
  }
  touchField(["/users"]);
  return { ok: true as const };
}

export async function fieldOrdersDashboard() {
  const user = await requireFieldAdmin();
  const data = await listFieldOrders({ includeQwicks: true });
  return { ...data, canRefund: user.role === "admin" };
}

/** Notifications page: what was sent, and how many devices a new one would reach. */
export async function fieldBroadcastsPage() {
  await requireFieldAdmin();
  const [sent, audience] = await Promise.all([listBroadcasts(50), broadcastAudienceSize()]);
  return { sent, audience };
}

/** Sends a notification to every Field app user (farmers and officers). */
export async function sendFieldBroadcast(input: BroadcastInput) {
  const user = await requireFieldAdmin();
  const name = user.name.trim() || user.phone;
  const id = await createBroadcast(input, name);
  await recordActivity({
    action: "field.broadcast",
    message: `${name} sent the app notification "${String(input.titleEn ?? "").slice(0, 80)}"`,
    actor: { id: user.id, name },
  }).catch(() => undefined);
  revalidatePath("/field/notifications");
  return { id };
}

/** Orders → Delivery route: pending deliveries with their locations, and the office. */
export async function fieldRoutePage() {
  await requireFieldAdmin();
  const [office, stops] = await Promise.all([officeLocation(), pendingDeliveryStops()]);
  return { office, stops };
}

/** Saves where routes start and end. Takes "lat, lng" or a Google Maps link. */
export async function saveFieldOfficeLocation(text: string) {
  const user = await requireFieldAdmin();
  const point = parseLatLng(text);
  if (!point) throw new Error("Enter the office as latitude, longitude (for example 10.9617, 79.3881) or paste a Google Maps link.");
  if (!inIndia(point)) throw new Error("That point is not in India. Check the latitude and longitude are not swapped.");
  await updateSettings({ fieldOfficeLocation: `${point.lat}, ${point.lng}` });
  const name = user.name.trim() || user.phone;
  await recordActivity({ action: "settings.update", message: `${name} set the SkyWin office location for delivery routes`, actor: { id: user.id, name } }).catch(() => undefined);
  touchField(["/field/orders/route"]);
  return point;
}

/**
 * Orders → delivery step. Moves a Field app or QwicksApp order to a delivery step; the farmer
 * gets a push and sees it in the app. Cancel and refund are not steps: they go through the
 * refund panel so the money goes back.
 */
export async function setFieldOrderStage(saleId: number, step: string, note?: string) {
  const user = await requireFieldAdmin();
  if (!isDeliveryStep(step)) throw new Error("Choose a delivery step.");
  if (!Number.isInteger(saleId) || saleId <= 0) throw new Error("Unknown order.");
  const [sale] = await db
    .select({
      id: sales.id,
      status: sales.status,
      externalOrderId: sales.externalOrderId,
      invoiceNo: sales.invoiceNo,
      operatorName: sales.operatorName,
    })
    .from(sales)
    .where(and(eq(sales.id, saleId), or(fieldSaleWhere(), qwicksSaleWhere())))
    .limit(1);
  if (!sale) throw new Error("This order is not a Field app or QwicksApp order.");
  if (sale.status === "cancelled") throw new Error("This order is cancelled, so it can't move to a delivery step.");
  const cleanNote = (note ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  await recordOrderCheckpoint({
    orderId: sale.externalOrderId || sale.invoiceNo,
    saleId: sale.id,
    checkpoint: step,
    note: cleanNote || undefined,
    updatedBy: user.name.trim() || user.phone,
  });
  touchField(["/field/orders", "/shipping"]);
  return { ok: true as const };
}

export async function refundFieldOrder(saleId: number, amount: string, reason: string) {
  const admin = await requireAdmin();
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < 3) throw new Error("A refund reason is required.");
  const paise = refundAmountPaise(amount, Number.MAX_SAFE_INTEGER);
  const actorName = admin.name || admin.phone || "admin";
  const result = await refundFieldPayment({
    saleId,
    amountPaise: paise,
    reason: trimmed,
    actorName,
  });
  if (result.skipped || !result.refundId) {
    throw new Error("Nothing left to refund on this order.");
  }
  await recordActivity({
    action: "sale.refund",
    message: `${actorName} refunded ₹${result.amountRupees.toFixed(2)} on sale ${saleId} through Razorpay ${result.refundId}`,
    entityType: "sale",
    entityId: saleId,
    actor: { id: admin.id, name: actorName },
  });
  touchField(["/field-orders", `/invoices/${saleId}`]);
  return result;
}

/** Signed-in field officer (or admin). Everyone else is refused on the server. */
async function requireRecommendationUser() {
  const user = await getCurrentUser();
  if (!user || !canUseFieldRecommendations(user.role)) {
    throw new RecommendationError("Only field officers can use recommendations.", 403);
  }
  return { id: user.id, name: user.name || user.phone || "Field officer", role: user.role, phone: user.phone };
}

function recommendationMessage(err: unknown, fallback: string) {
  if (err instanceof RecommendationError) return err.message;
  console.error("[field recommendations]", err);
  return fallback;
}

export async function fieldRecommendationsPage() {
  const user = await requireRecommendationUser();
  const recommendations = await listRecommendationsForUser(user);
  return { recommendations, canEdit: true, isAdmin: user.role === "admin" };
}

export async function searchFieldRecommendationProducts(query: string) {
  try {
    await requireRecommendationUser();
    const products = await searchRecommendationProducts(query);
    return { ok: true as const, products };
  } catch (err) {
    return { ok: false as const, error: recommendationMessage(err, "Search failed"), products: [] };
  }
}

export async function searchFieldRecommendationFarmers(query: string) {
  try {
    const user = await requireRecommendationUser();
    const farmers = await searchRecommendationFarmers(user, query);
    return { ok: true as const, farmers };
  } catch (err) {
    return { ok: false as const, error: recommendationMessage(err, "Search failed"), farmers: [] };
  }
}

export async function saveFieldRecommendationAction(input: {
  id?: number;
  farmerId: number;
  crop: string;
  stage: string;
  problem: string;
  note: string;
  productIds: number[];
}) {
  try {
    const user = await requireRecommendationUser();
    const saved = await saveFieldRecommendation(input, user);
    const verb = input.id ? "updated" : "added";
    await recordActivity({
      action: "field.recommendation",
      message: `${user.name} ${verb} the ${saved.crop} recommendation “${saved.problem}” for ${saved.farmerName || `farmer ${saved.farmerId}`}`,
      entityType: "field_recommendation",
      entityId: saved.id,
      actor: { id: user.id, name: user.name },
    });
    touchField();
    return { ok: true as const, id: saved.id };
  } catch (err) {
    return { ok: false as const, error: recommendationMessage(err, "Could not save recommendation.") };
  }
}

export async function deleteFieldRecommendationAction(id: number) {
  try {
    const user = await requireRecommendationUser();
    await deleteFieldRecommendation(id, user);
    await recordActivity({
      action: "field.recommendation",
      message: `${user.name} removed recommendation ${id}`,
      entityType: "field_recommendation",
      entityId: id,
      actor: { id: user.id, name: user.name },
    });
    touchField();
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: recommendationMessage(err, "Could not remove recommendation.") };
  }
}

function splitList(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

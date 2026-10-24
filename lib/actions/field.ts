"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, users } from "@/db/schema";
import { requireFieldAdmin } from "@/lib/actions/auth";
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
  unassignProductFromSubcategory,
  updateFieldCategory,
  updateFieldSubcategory,
} from "@/lib/queries/field-catalog";
import {
  countFieldFarmers,
  countPendingFarmers,
  getFieldFarmer,
  listFieldFarmers,
  setFarmerApproval,
  upsertFieldFarmer,
  type FieldFarmerApproval,
  type FieldFarmerInput,
} from "@/lib/queries/field-farmers";
import { listFieldOrders } from "@/lib/queries/field-orders";
import {
  getFieldProductDetail,
  listFieldCatalogProducts,
  upsertFieldProductDetail,
  type FieldProductDetailInput,
} from "@/lib/queries/field-product-details";

function touchField(paths: string[] = []) {
  revalidatePath("/field");
  revalidatePath("/field/catalog");
  revalidatePath("/field/farmers");
  revalidatePath("/field/officers");
  revalidatePath("/field/orders");
  for (const path of paths) revalidatePath(path);
}

export async function fieldOverview() {
  await requireFieldAdmin();
  const [catalog, pendingFarmers, orders] = await Promise.all([
    getFieldCatalogTree(),
    countPendingFarmers(),
    listFieldOrders(),
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
    pendingFarmers,
    todayCount: orders.todayCount,
    todayTotal: orders.todayTotal,
    monthCount: orders.monthCount,
    monthTotal: orders.monthTotal,
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
  await requireFieldAdmin();
  const row = await upsertFieldFarmer(input, id);
  touchField(row ? [`/field/farmers/${row.id}`] : []);
  return row;
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
    .where(eq(users.role, "sales_officer"))
    .orderBy(users.name);
}

export async function setFieldOfficerAccess(id: number, access: boolean) {
  await requireFieldAdmin();
  await db
    .update(users)
    .set({ fieldAppAccess: access })
    .where(and(eq(users.id, id), eq(users.role, "sales_officer")));
  touchField(["/field/officers"]);
}

async function validateOfficerInput(input: { name: string; phone: string }, exceptId?: number) {
  const cleanPhone = input.phone.trim().replace(/\D/g, "").slice(-10);
  const cleanName = input.name.trim();
  if (!cleanName) return { ok: false as const, error: "Name is required" };
  if (cleanPhone.length !== 10) return { ok: false as const, error: "Valid 10-digit phone number is required" };
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        sql`right(regexp_replace(${users.phone}, '\\D', '', 'g'), 10) = ${cleanPhone}`,
        exceptId ? ne(users.id, exceptId) : undefined
      )
    )
    .limit(1);
  if (existing) return { ok: false as const, error: "This number is already registered." };
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
    .where(and(eq(users.id, id), eq(users.role, "sales_officer")))
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
  await requireFieldAdmin();
  return listFieldOrders();
}

function splitList(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

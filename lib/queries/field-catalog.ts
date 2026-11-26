import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  fieldCategories,
  fieldSubcategories,
  fieldSubcategoryProducts,
  products,
} from "@/db/schema";
import { FIELD_CATALOG_SEED } from "@/lib/field-catalog-seed";
import { movedOrder, type MoveDirection } from "@/lib/field-catalog-order";

export type { MoveDirection } from "@/lib/field-catalog-order";

export type FieldCatalogTreeSub = {
  id: number;
  slug: string;
  title: string;
  sortOrder: number;
  queries: string[];
  matchTerms: string[];
  iconKey: string | null;
  iconUri: string | null;
  iconTint: boolean;
  productIds: number[];
};

export type FieldCatalogTreeCategory = {
  id: number;
  slug: string;
  title: string;
  sortOrder: number;
  queries: string[];
  iconKey: string;
  iconUri: string | null;
  subs: FieldCatalogTreeSub[];
};

export type FieldCatalogProduct = {
  id: number;
  name: string;
  sku: string | null;
  saleRate: string;
  gstRate: string;
  stockQty: string;
  hsnCode: string | null;
  isActive: boolean;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

export async function seedFieldCatalogIfEmpty() {
  const [existing] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(fieldCategories);
  if (Number(existing?.count ?? 0) > 0) return { seeded: false };

  for (const [catIndex, category] of FIELD_CATALOG_SEED.entries()) {
    const [created] = await db
      .insert(fieldCategories)
      .values({
        slug: category.slug,
        title: category.title,
        sortOrder: catIndex,
        queries: category.queries,
        iconKey: category.iconKey,
      })
      .returning();

    for (const [subIndex, sub] of category.subs.entries()) {
      const [subRow] = await db
        .insert(fieldSubcategories)
        .values({
          categoryId: created.id,
          slug: sub.slug,
          title: sub.title,
          sortOrder: subIndex,
          queries: sub.queries,
          matchTerms: sub.matchTerms,
          iconKey: sub.iconKey,
          iconUri: sub.iconUri ?? null,
          iconTint: sub.iconTint,
        })
        .returning();

      if (sub.productIds.length) {
        const live = await db
          .select({ id: products.id })
          .from(products)
          .where(inArray(products.id, sub.productIds));
        const liveIds = new Set(live.map((row) => row.id));
        const rows = sub.productIds
          .filter((id) => liveIds.has(id))
          .map((productId) => ({ subcategoryId: subRow.id, productId }));
        if (rows.length) {
          await db.insert(fieldSubcategoryProducts).values(rows);
        }
      }
    }
  }

  return { seeded: true };
}

export async function getFieldCatalogTree(): Promise<FieldCatalogTreeCategory[]> {
  await seedFieldCatalogIfEmpty();

  const categories = await db
    .select()
    .from(fieldCategories)
    .orderBy(asc(fieldCategories.sortOrder), asc(fieldCategories.id));
  const subs = await db
    .select()
    .from(fieldSubcategories)
    .orderBy(asc(fieldSubcategories.sortOrder), asc(fieldSubcategories.id));
  // In the order set on the dashboard (Catalog → category → ↑ ↓); the app shows them in this order.
  const links = await db
    .select()
    .from(fieldSubcategoryProducts)
    .orderBy(asc(fieldSubcategoryProducts.sortOrder), asc(fieldSubcategoryProducts.id));

  const productsBySub = new Map<number, number[]>();
  for (const link of links) {
    const list = productsBySub.get(link.subcategoryId) ?? [];
    list.push(link.productId);
    productsBySub.set(link.subcategoryId, list);
  }

  return categories.map((category) => ({
    id: category.id,
    slug: category.slug,
    title: category.title,
    sortOrder: category.sortOrder,
    queries: asStringArray(category.queries),
    iconKey: category.iconKey,
    iconUri: category.iconUri ? category.iconUri.replace(/:3000(?=\/)/g, "") : null,
    subs: subs
      .filter((sub) => sub.categoryId === category.id)
      .map((sub) => ({
        id: sub.id,
        slug: sub.slug,
        title: sub.title,
        sortOrder: sub.sortOrder,
        queries: asStringArray(sub.queries),
        matchTerms: asStringArray(sub.matchTerms),
        iconKey: sub.iconKey,
        iconUri: sub.iconUri ? sub.iconUri.replace(/:3000(?=\/)/g, "") : null,
        iconTint: sub.iconTint,
        productIds: productsBySub.get(sub.id) ?? [],
      })),
  }));
}

export async function getFieldCategoryBySlug(slug: string) {
  const tree = await getFieldCatalogTree();
  return tree.find((category) => category.slug === slug) ?? null;
}

export async function listProductsByIds(ids: number[]): Promise<FieldCatalogProduct[]> {
  if (!ids.length) return [];
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      saleRate: products.saleRate,
      gstRate: products.gstRate,
      stockQty: products.stockQty,
      hsnCode: products.hsnCode,
      isActive: products.isActive,
    })
    .from(products)
    .where(inArray(products.id, ids));
  const order = new Map(ids.map((id, index) => [id, index]));
  return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function createFieldCategory(input: {
  slug: string;
  title: string;
  queries: string[];
  iconKey: string;
}) {
  const slug = slugify(input.slug || input.title);
  const [max] = await db
    .select({ n: sql<number>`coalesce(max(${fieldCategories.sortOrder}), -1)` })
    .from(fieldCategories);
  const [row] = await db
    .insert(fieldCategories)
    .values({
      slug,
      title: input.title.trim(),
      sortOrder: Number(max?.n ?? -1) + 1,
      queries: input.queries,
      iconKey: input.iconKey || slug,
    })
    .returning();
  return row;
}

export async function updateFieldCategory(
  id: number,
  input: { title?: string; queries?: string[]; iconKey?: string }
) {
  const [row] = await db
    .update(fieldCategories)
    .set({
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.queries !== undefined ? { queries: input.queries } : {}),
      ...(input.iconKey !== undefined ? { iconKey: input.iconKey } : {}),
    })
    .where(eq(fieldCategories.id, id))
    .returning();
  return row;
}

/** Uploaded icon for a category (null removes it; the app goes back to the built-in icon). */
export async function setFieldCategoryIconUri(id: number, iconUri: string | null) {
  const [row] = await db.update(fieldCategories).set({ iconUri }).where(eq(fieldCategories.id, id)).returning({ id: fieldCategories.id });
  if (!row) throw new Error("This category no longer exists.");
}

/** Uploaded icon for a subcategory. Uploaded artwork keeps its colours (no tint). */
export async function setFieldSubcategoryIconUri(id: number, iconUri: string | null) {
  const [row] = await db
    .update(fieldSubcategories)
    .set({ iconUri, iconTint: iconUri ? false : true })
    .where(eq(fieldSubcategories.id, id))
    .returning({ id: fieldSubcategories.id });
  if (!row) throw new Error("This subcategory no longer exists.");
}

export async function deleteFieldCategory(id: number) {
  await db.delete(fieldCategories).where(eq(fieldCategories.id, id));
}

export async function createFieldSubcategory(input: {
  categoryId: number;
  slug: string;
  title: string;
  queries: string[];
  matchTerms: string[];
  iconKey?: string;
  iconUri?: string;
  iconTint?: boolean;
}) {
  const slug = slugify(input.slug || input.title);
  const [max] = await db
    .select({ n: sql<number>`coalesce(max(${fieldSubcategories.sortOrder}), -1)` })
    .from(fieldSubcategories)
    .where(eq(fieldSubcategories.categoryId, input.categoryId));
  const [row] = await db
    .insert(fieldSubcategories)
    .values({
      categoryId: input.categoryId,
      slug,
      title: input.title.trim(),
      sortOrder: Number(max?.n ?? -1) + 1,
      queries: input.queries,
      matchTerms: input.matchTerms,
      iconKey: input.iconKey || slug,
      iconUri: input.iconUri || null,
      iconTint: input.iconTint ?? true,
    })
    .returning();
  return row;
}

export async function updateFieldSubcategory(
  id: number,
  input: {
    title?: string;
    queries?: string[];
    matchTerms?: string[];
    iconKey?: string;
    iconUri?: string | null;
    iconTint?: boolean;
  }
) {
  const [row] = await db
    .update(fieldSubcategories)
    .set({
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.queries !== undefined ? { queries: input.queries } : {}),
      ...(input.matchTerms !== undefined ? { matchTerms: input.matchTerms } : {}),
      ...(input.iconKey !== undefined ? { iconKey: input.iconKey } : {}),
      ...(input.iconUri !== undefined ? { iconUri: input.iconUri } : {}),
      ...(input.iconTint !== undefined ? { iconTint: input.iconTint } : {}),
    })
    .where(eq(fieldSubcategories.id, id))
    .returning();
  return row;
}

export async function deleteFieldSubcategory(id: number) {
  await db.delete(fieldSubcategories).where(eq(fieldSubcategories.id, id));
}

export async function assignProductToSubcategory(subcategoryId: number, productId: number) {
  const [existing] = await db
    .select({ id: fieldSubcategoryProducts.id })
    .from(fieldSubcategoryProducts)
    .where(
      and(
        eq(fieldSubcategoryProducts.subcategoryId, subcategoryId),
        eq(fieldSubcategoryProducts.productId, productId)
      )
    )
    .limit(1);
  if (existing) return existing;
  // New products go to the end of the subcategory's list.
  const [max] = await db
    .select({ n: sql<number>`coalesce(max(${fieldSubcategoryProducts.sortOrder}), 0)` })
    .from(fieldSubcategoryProducts)
    .where(eq(fieldSubcategoryProducts.subcategoryId, subcategoryId));
  const [row] = await db
    .insert(fieldSubcategoryProducts)
    .values({ subcategoryId, productId, sortOrder: Number(max?.n ?? 0) + 1 })
    .returning();
  return row;
}

export async function unassignProductFromSubcategory(subcategoryId: number, productId: number) {
  await db
    .delete(fieldSubcategoryProducts)
    .where(
      and(
        eq(fieldSubcategoryProducts.subcategoryId, subcategoryId),
        eq(fieldSubcategoryProducts.productId, productId)
      )
    );
}

/** Moves a category on the Products page (and dashboard). Positions are renumbered 0, 1, 2… */
export async function moveFieldCategory(id: number, direction: MoveDirection) {
  const rows = await db
    .select({ id: fieldCategories.id })
    .from(fieldCategories)
    .orderBy(asc(fieldCategories.sortOrder), asc(fieldCategories.id));
  const next = movedOrder(rows.map((r) => r.id), id, direction);
  if (!next) return false;
  await db.transaction(async (tx) => {
    for (let i = 0; i < next.length; i++) {
      await tx.update(fieldCategories).set({ sortOrder: i }).where(eq(fieldCategories.id, next[i]!));
    }
  });
  return true;
}

/** Moves a subcategory within its category. */
export async function moveFieldSubcategory(id: number, direction: MoveDirection) {
  const [sub] = await db
    .select({ categoryId: fieldSubcategories.categoryId })
    .from(fieldSubcategories)
    .where(eq(fieldSubcategories.id, id))
    .limit(1);
  if (!sub) throw new Error("This subcategory no longer exists.");
  const rows = await db
    .select({ id: fieldSubcategories.id })
    .from(fieldSubcategories)
    .where(eq(fieldSubcategories.categoryId, sub.categoryId))
    .orderBy(asc(fieldSubcategories.sortOrder), asc(fieldSubcategories.id));
  const next = movedOrder(rows.map((r) => r.id), id, direction);
  if (!next) return false;
  await db.transaction(async (tx) => {
    for (let i = 0; i < next.length; i++) {
      await tx.update(fieldSubcategories).set({ sortOrder: i }).where(eq(fieldSubcategories.id, next[i]!));
    }
  });
  return true;
}

/** Moves a product within one subcategory's list. */
export async function moveFieldSubcategoryProduct(subcategoryId: number, productId: number, direction: MoveDirection) {
  const rows = await db
    .select({ id: fieldSubcategoryProducts.id, productId: fieldSubcategoryProducts.productId })
    .from(fieldSubcategoryProducts)
    .where(eq(fieldSubcategoryProducts.subcategoryId, subcategoryId))
    .orderBy(asc(fieldSubcategoryProducts.sortOrder), asc(fieldSubcategoryProducts.id));
  const next = movedOrder(rows.map((r) => r.productId), productId, direction);
  if (!next) return false;
  const linkByProduct = new Map(rows.map((r) => [r.productId, r.id]));
  await db.transaction(async (tx) => {
    for (let i = 0; i < next.length; i++) {
      await tx
        .update(fieldSubcategoryProducts)
        .set({ sortOrder: i + 1 })
        .where(eq(fieldSubcategoryProducts.id, linkByProduct.get(next[i]!)!));
    }
  });
  return true;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || `item-${Date.now()}`;
}

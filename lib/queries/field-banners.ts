import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { fieldBanners, fieldCategories, products } from "@/db/schema";
import { movedOrder, type MoveDirection } from "@/lib/field-catalog-order";
import type { AppBanner, CleanBanner } from "@/lib/field-banner-rules";

/** Every banner (shown and hidden) for the dashboard, in order within each page. */
export async function listFieldBanners() {
  return db
    .select({
      id: fieldBanners.id,
      imageUrl: fieldBanners.imageUrl,
      placement: fieldBanners.placement,
      categoryId: fieldBanners.categoryId,
      categoryTitle: fieldCategories.title,
      productId: fieldBanners.productId,
      productName: products.name,
      title: fieldBanners.title,
      active: fieldBanners.active,
      sortOrder: fieldBanners.sortOrder,
      createdBy: fieldBanners.createdBy,
      createdAt: fieldBanners.createdAt,
    })
    .from(fieldBanners)
    .leftJoin(fieldCategories, eq(fieldCategories.id, fieldBanners.categoryId))
    .leftJoin(products, eq(products.id, fieldBanners.productId))
    .orderBy(asc(fieldBanners.placement), asc(fieldBanners.categoryId), asc(fieldBanners.sortOrder), asc(fieldBanners.id));
}

/** Shown banners for the app. */
export async function appFieldBanners(): Promise<AppBanner[]> {
  const rows = await db
    .select({
      id: fieldBanners.id,
      imageUrl: fieldBanners.imageUrl,
      placement: fieldBanners.placement,
      category: fieldCategories.slug,
      productId: fieldBanners.productId,
    })
    .from(fieldBanners)
    .leftJoin(fieldCategories, eq(fieldCategories.id, fieldBanners.categoryId))
    .where(eq(fieldBanners.active, true))
    .orderBy(asc(fieldBanners.sortOrder), asc(fieldBanners.id));
  return rows
    .filter((r) => r.placement === "products" || (r.placement === "category" && r.category))
    .map((r) => ({
      id: r.id,
      imageUrl: r.imageUrl.replace(/:3000(?=\/)/g, ""),
      placement: r.placement === "category" ? "category" : "products",
      category: r.placement === "category" ? r.category : null,
      productId: r.productId,
    }));
}

function samePage(placement: string, categoryId: number | null) {
  return and(
    eq(fieldBanners.placement, placement),
    categoryId == null ? isNull(fieldBanners.categoryId) : eq(fieldBanners.categoryId, categoryId)
  );
}

export async function createFieldBanner(value: CleanBanner, createdBy: string) {
  const [max] = await db
    .select({ n: sql<number>`coalesce(max(${fieldBanners.sortOrder}), -1)` })
    .from(fieldBanners)
    .where(samePage(value.placement, value.categoryId));
  const [row] = await db
    .insert(fieldBanners)
    .values({ ...value, sortOrder: Number(max?.n ?? -1) + 1, createdBy })
    .returning({ id: fieldBanners.id });
  return row!.id;
}

export async function setFieldBannerActive(id: number, active: boolean) {
  const [row] = await db.update(fieldBanners).set({ active }).where(eq(fieldBanners.id, id)).returning({ id: fieldBanners.id });
  if (!row) throw new Error("This banner no longer exists.");
}

export async function deleteFieldBanner(id: number) {
  await db.delete(fieldBanners).where(eq(fieldBanners.id, id));
}

export async function moveFieldBanner(id: number, direction: MoveDirection) {
  const [banner] = await db
    .select({ placement: fieldBanners.placement, categoryId: fieldBanners.categoryId })
    .from(fieldBanners)
    .where(eq(fieldBanners.id, id))
    .limit(1);
  if (!banner) throw new Error("This banner no longer exists.");
  const rows = await db
    .select({ id: fieldBanners.id })
    .from(fieldBanners)
    .where(samePage(banner.placement, banner.categoryId))
    .orderBy(asc(fieldBanners.sortOrder), asc(fieldBanners.id));
  const next = movedOrder(rows.map((r) => r.id), id, direction);
  if (!next) return false;
  await db.transaction(async (tx) => {
    for (let i = 0; i < next.length; i++) {
      await tx.update(fieldBanners).set({ sortOrder: i }).where(eq(fieldBanners.id, next[i]!));
    }
  });
  return true;
}

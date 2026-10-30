import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  fieldCategories,
  fieldProductDetails,
  fieldSubcategories,
  fieldSubcategoryProducts,
  products,
  type FieldUsageRow,
  type FieldVideo,
} from "@/db/schema";
import { listedProductIds } from "@/lib/field-listed";
import { fieldDetailGaps } from "@/lib/field-product-rules";

export const FIELD_PRODUCT_PAGE_SIZE = 40;

export type FieldProductDetailInput = {
  displayName: string;
  images: string[];
  brochureUrl: string;
  activeIngredient: string;
  packSizes: string;
  headline: string;
  description: string;
  antidote: string;
  usage: FieldUsageRow[];
  videos: FieldVideo[];
};

export function youtubeId(url: string) {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function videoThumbnail(video: FieldVideo) {
  if (video.thumbnail) return video.thumbnail;
  const id = youtubeId(video.url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "";
}

const clean = (s: string | null | undefined) => (s ?? "").trim();

/** Uploads behind the billing container were saved with the internal :3000 port. */
export function fieldImageUrl(src: string) {
  return src.trim().replace(/:3000(?=\/)/g, "");
}

function fieldImages(images: string[] | null | undefined) {
  return (images ?? []).map(fieldImageUrl).filter(Boolean);
}

export async function listFieldCatalogProducts() {
  const rows = await db
    .select({
      productId: products.id,
      name: products.name,
      sku: products.sku,
      category: fieldCategories.title,
      categorySlug: fieldCategories.slug,
      sub: fieldSubcategories.title,
    })
    .from(products)
    .leftJoin(fieldSubcategoryProducts, eq(fieldSubcategoryProducts.productId, products.id))
    .leftJoin(fieldSubcategories, eq(fieldSubcategories.id, fieldSubcategoryProducts.subcategoryId))
    .leftJoin(fieldCategories, eq(fieldCategories.id, fieldSubcategories.categoryId))
    .where(and(eq(products.isActive, true), inArray(products.id, listedProductIds())))
    .orderBy(asc(products.name), asc(fieldCategories.title), asc(fieldSubcategories.title));

  const ids = [...new Set(rows.map((r) => r.productId))];
  const details = ids.length
    ? await db
        .select({
          productId: fieldProductDetails.productId,
          description: fieldProductDetails.description,
          images: fieldProductDetails.images,
          activeIngredient: fieldProductDetails.activeIngredient,
          usage: fieldProductDetails.usage,
          videos: fieldProductDetails.videos,
          updatedAt: fieldProductDetails.updatedAt,
        })
        .from(fieldProductDetails)
        .where(inArray(fieldProductDetails.productId, ids))
    : [];
  const byId = new Map(details.map((d) => [d.productId, d]));

  const seen = new Set<number>();
  return rows
    .filter((r) => (seen.has(r.productId) ? false : (seen.add(r.productId), true)))
    .map((r) => {
      const d = byId.get(r.productId);
      const images = fieldImages(d?.images);
      const gaps = fieldDetailGaps({
        description: d?.description,
        activeIngredient: d?.activeIngredient,
        usage: d?.usage,
      });
      return {
        ...r,
        category: r.category ?? "Not in catalogue",
        categorySlug: r.categorySlug ?? "unassigned",
        sub: r.sub ?? "—",
        image: images[0] ?? null,
        gaps,
        hasDetails: gaps.length === 0,
        updatedAt: d?.updatedAt?.toISOString() ?? null,
      };
    });
}

function productIsMapped() {
  return sql`exists (
    select 1 from ${fieldSubcategoryProducts}
    where ${fieldSubcategoryProducts.productId} = ${products.id}
  )`;
}

function productDetailsComplete() {
  return sql`exists (
    select 1 from ${fieldProductDetails}
    where ${fieldProductDetails.productId} = ${products.id}
      and btrim(coalesce(${fieldProductDetails.description}, '')) <> ''
      and (
        btrim(coalesce(${fieldProductDetails.activeIngredient}, '')) <> ''
        or jsonb_array_length(coalesce(${fieldProductDetails.usage}, '[]'::jsonb)) > 0
      )
  )`;
}

function productInCategory(slug: string) {
  return sql`exists (
    select 1 from ${fieldSubcategoryProducts}
    inner join ${fieldSubcategories} on ${fieldSubcategories.id} = ${fieldSubcategoryProducts.subcategoryId}
    inner join ${fieldCategories} on ${fieldCategories.id} = ${fieldSubcategories.categoryId}
    where ${fieldSubcategoryProducts.productId} = ${products.id}
      and ${fieldCategories.slug} = ${slug}
  )`;
}

export async function fieldProductStats() {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      mapped: sql<number>`count(*) filter (where ${productIsMapped()})::int`,
      complete: sql<number>`count(*) filter (where ${productDetailsComplete()})::int`,
    })
    .from(products)
    .where(and(eq(products.isActive, true), inArray(products.id, listedProductIds())));
  const total = Number(row?.total ?? 0);
  const complete = Number(row?.complete ?? 0);
  const mapped = Number(row?.mapped ?? 0);
  return { total, complete, needsDetails: total - complete, mapped };
}

export async function fieldProductCategories() {
  return db
    .select({ slug: fieldCategories.slug, title: fieldCategories.title })
    .from(fieldCategories)
    .orderBy(asc(fieldCategories.title), asc(fieldCategories.id));
}

export async function listFieldProductsPage(filter?: {
  q?: string;
  category?: string;
  status?: "all" | "needs" | "complete";
  page?: number;
}) {
  const pageSize = FIELD_PRODUCT_PAGE_SIZE;
  const page = Math.max(1, filter?.page ?? 1);
  const conditions: SQL[] = [eq(products.isActive, true), inArray(products.id, listedProductIds())];
  const raw = filter?.q?.trim().replace(/[%_]/g, "") ?? "";
  if (raw) {
    const pattern = `%${raw}%`;
    const search = or(ilike(products.name, pattern), ilike(products.sku, pattern));
    if (search) conditions.push(search);
  }
  if (filter?.category === "unassigned") conditions.push(sql`not (${productIsMapped()})`);
  else if (filter?.category) conditions.push(productInCategory(filter.category));
  if (filter?.status === "complete") conditions.push(productDetailsComplete());
  else if (filter?.status === "needs") conditions.push(sql`not (${productDetailsComplete()})`);
  const where = and(...conditions);

  const [countRow, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(where),
    db
      .select({
        productId: products.id,
        name: products.name,
        sku: products.sku,
        stockQty: products.stockQty,
        description: fieldProductDetails.description,
        images: fieldProductDetails.images,
        activeIngredient: fieldProductDetails.activeIngredient,
        usage: fieldProductDetails.usage,
        updatedAt: fieldProductDetails.updatedAt,
        category: sql<string | null>`(
          select ${fieldCategories.title}
          from ${fieldSubcategoryProducts}
          inner join ${fieldSubcategories} on ${fieldSubcategories.id} = ${fieldSubcategoryProducts.subcategoryId}
          inner join ${fieldCategories} on ${fieldCategories.id} = ${fieldSubcategories.categoryId}
          where ${fieldSubcategoryProducts.productId} = ${products.id}
          order by ${fieldCategories.title}, ${fieldSubcategories.title}
          limit 1
        )`,
        categorySlug: sql<string | null>`(
          select ${fieldCategories.slug}
          from ${fieldSubcategoryProducts}
          inner join ${fieldSubcategories} on ${fieldSubcategories.id} = ${fieldSubcategoryProducts.subcategoryId}
          inner join ${fieldCategories} on ${fieldCategories.id} = ${fieldSubcategories.categoryId}
          where ${fieldSubcategoryProducts.productId} = ${products.id}
          order by ${fieldCategories.title}, ${fieldSubcategories.title}
          limit 1
        )`,
        sub: sql<string | null>`(
          select ${fieldSubcategories.title}
          from ${fieldSubcategoryProducts}
          inner join ${fieldSubcategories} on ${fieldSubcategories.id} = ${fieldSubcategoryProducts.subcategoryId}
          inner join ${fieldCategories} on ${fieldCategories.id} = ${fieldSubcategories.categoryId}
          where ${fieldSubcategoryProducts.productId} = ${products.id}
          order by ${fieldCategories.title}, ${fieldSubcategories.title}
          limit 1
        )`,
      })
      .from(products)
      .leftJoin(fieldProductDetails, eq(fieldProductDetails.productId, products.id))
      .where(where)
      .orderBy(asc(products.name), asc(products.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  return {
    total: Number(countRow[0]?.count ?? 0),
    page,
    pageSize,
    rows: rows.map((row) => {
      const images = fieldImages(row.images);
      const gaps = fieldDetailGaps({
        description: row.description,
        activeIngredient: row.activeIngredient,
        usage: row.usage,
      });
      return {
        productId: row.productId,
        name: row.name,
        sku: row.sku,
        stock: Number(row.stockQty) || 0,
        image: images[0] ?? null,
        category: row.category ?? "Not in catalogue",
        categorySlug: row.categorySlug ?? "unassigned",
        sub: row.sub ?? "—",
        gaps,
        updatedAt: row.updatedAt?.toISOString() ?? null,
      };
    }),
  };
}

export async function getFieldProductDetail(productId: number) {
  const [product] = await db
    .select({ id: products.id, name: products.name, sku: products.sku, saleRate: products.saleRate })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) return null;
  const [detail] = await db
    .select()
    .from(fieldProductDetails)
    .where(eq(fieldProductDetails.productId, productId))
    .limit(1);
  const [placement] = await db
    .select({
      category: fieldCategories.title,
      categorySlug: fieldCategories.slug,
      sub: fieldSubcategories.title,
    })
    .from(fieldSubcategoryProducts)
    .innerJoin(fieldSubcategories, eq(fieldSubcategories.id, fieldSubcategoryProducts.subcategoryId))
    .innerJoin(fieldCategories, eq(fieldCategories.id, fieldSubcategories.categoryId))
    .where(eq(fieldSubcategoryProducts.productId, productId))
    .orderBy(asc(fieldCategories.title), asc(fieldSubcategories.title))
    .limit(1);
  return {
    product,
    placement: placement ?? null,
    detail: {
      displayName: detail?.displayName ?? "",
      images: fieldImages(detail?.images),
      brochureUrl: detail?.brochureUrl ?? "",
      activeIngredient: detail?.activeIngredient ?? "",
      packSizes: detail?.packSizes ?? "",
      headline: detail?.headline ?? "",
      description: detail?.description ?? "",
      antidote: detail?.antidote ?? "",
      usage: detail?.usage ?? [],
      videos: detail?.videos ?? [],
    } satisfies FieldProductDetailInput,
    updatedAt: detail?.updatedAt?.toISOString() ?? null,
  };
}

export async function upsertFieldProductDetail(productId: number, input: FieldProductDetailInput) {
  const values = {
    displayName: clean(input.displayName) || null,
    images: input.images.map(clean).filter(Boolean),
    brochureUrl: clean(input.brochureUrl) || null,
    activeIngredient: clean(input.activeIngredient) || null,
    packSizes: clean(input.packSizes) || null,
    headline: clean(input.headline) || null,
    description: clean(input.description) || null,
    antidote: clean(input.antidote) || null,
    usage: input.usage
      .map((u) => ({
        crop: clean(u.crop),
        pest: clean(u.pest),
        perHectare: clean(u.perHectare),
        perAcre: clean(u.perAcre),
      }))
      .filter((u) => u.crop || u.pest),
    videos: input.videos
      .map((v) => ({ title: clean(v.title), url: clean(v.url), thumbnail: clean(v.thumbnail) || undefined }))
      .filter((v) => v.url),
    updatedAt: new Date(),
  };
  await db
    .insert(fieldProductDetails)
    .values({ productId, ...values })
    .onConflictDoUpdate({ target: fieldProductDetails.productId, set: values });
}

export async function publicFieldProductDetail(productId: number) {
  const found = await getFieldProductDetail(productId);
  if (!found) return null;
  const { product, detail } = found;
  return {
    productId: product.id,
    name: detail.displayName || product.name,
    sku: product.sku,
    price: Number(product.saleRate),
    images: detail.images,
    brochureUrl: detail.brochureUrl || null,
    activeIngredient: detail.activeIngredient,
    packSizes: detail.packSizes,
    headline: detail.headline,
    description: detail.description,
    antidote: detail.antidote,
    usage: detail.usage,
    videos: detail.videos.map((v) => ({ ...v, thumbnail: videoThumbnail(v) })),
  };
}

import { asc, eq, inArray } from "drizzle-orm";
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
    .where(eq(products.isActive, true))
    .orderBy(asc(products.name), asc(fieldCategories.title), asc(fieldSubcategories.title));

  const ids = [...new Set(rows.map((r) => r.productId))];
  const details = ids.length
    ? await db
        .select({
          productId: fieldProductDetails.productId,
          description: fieldProductDetails.description,
          images: fieldProductDetails.images,
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
      return {
        ...r,
        category: r.category ?? "Not in catalogue",
        categorySlug: r.categorySlug ?? "unassigned",
        sub: r.sub ?? "—",
        hasDetails: !!d && !!(clean(d.description) || d.images.length || d.usage.length || d.videos.length),
        updatedAt: d?.updatedAt?.toISOString() ?? null,
      };
    });
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
  return {
    product,
    detail: {
      displayName: detail?.displayName ?? "",
      images: detail?.images ?? [],
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

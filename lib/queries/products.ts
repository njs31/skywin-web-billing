import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { products, categories } from "@/db/schema";
import { ilike, or, sql, asc, eq, and } from "drizzle-orm";
import { z } from "zod";
import { inferGstRate, parseSkuFromName } from "@/lib/gst";

const CACHE_TAG = {
  products: "products",
  suppliers: "suppliers",
  purchases: "purchases",
  sales: "sales",
} as const;

export async function searchProducts(query: string, limit = 20) {
  const q = query.trim();
  if (!q) return [];

  return db
    .select()
    .from(products)
    .where(
      and(
        eq(products.isActive, true),
        or(
          ilike(products.name, `%${q}%`),
          ilike(products.sku, `%${q}%`),
          ilike(products.barcode, `%${q}%`),
          eq(products.barcode, q)
        )
      )
    )
    .orderBy(asc(products.name))
    .limit(limit);
}

export const getProducts = unstable_cache(
  async (search?: string, page = 1, pageSize = 50) => {
    if (search?.trim()) {
      return searchProducts(search, 100);
    }
    const offset = (page - 1) * pageSize;
    return db
      .select()
      .from(products)
      .orderBy(asc(products.name))
      .limit(pageSize)
      .offset(offset);
  },
  ["products-list"],
  { revalidate: 30, tags: [CACHE_TAG.products] }
);

export const getProductCount = unstable_cache(
  async () => {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(products);
    return result?.count ?? 0;
  },
  ["products-count"],
  { revalidate: 60, tags: [CACHE_TAG.products] }
);

export async function getProductById(id: number) {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  return product ?? null;
}

export const getLowStockProducts = unstable_cache(
  async (threshold = 10) => {
    return db
      .select()
      .from(products)
      .where(sql`${products.stockQty}::numeric < ${threshold}`)
      .orderBy(asc(products.stockQty))
      .limit(20);
  },
  ["low-stock"],
  { revalidate: 30, tags: [CACHE_TAG.products] }
);

export const getProductStats = unstable_cache(
  async () => {
    const [result] = await db
      .select({
        total: sql<number>`count(*)::int`,
        lowStock: sql<number>`count(*) filter (where ${products.stockQty}::numeric < 10)::int`,
      })
      .from(products);
    return result;
  },
  ["product-stats"],
  { revalidate: 60, tags: [CACHE_TAG.products] }
);

export { CACHE_TAG as PRODUCT_CACHE_TAG };

export async function updateProduct(
  id: number,
  data: {
    saleRate: number;
    wholesaleRate?: number;
    gstRate: number;
    stockQty?: number;
    reorderLevel?: number;
    mrp?: number;
    hsnCode?: string;
    barcode?: string;
    expiryDate?: string | null;
  }
) {
  const { revalidatePath, revalidateTag } = await import("next/cache");
  await db
    .update(products)
    .set({
      saleRate: data.saleRate.toFixed(2),
      gstRate: data.gstRate.toFixed(2),
      ...(data.wholesaleRate !== undefined
        ? { wholesaleRate: data.wholesaleRate.toFixed(2) }
        : {}),
      ...(data.stockQty !== undefined
        ? { stockQty: data.stockQty.toFixed(2) }
        : {}),
      ...(data.reorderLevel !== undefined
        ? { reorderLevel: data.reorderLevel.toFixed(2) }
        : {}),
      ...(data.mrp !== undefined ? { mrp: data.mrp.toFixed(2) } : {}),
      ...(data.hsnCode !== undefined ? { hsnCode: data.hsnCode } : {}),
      ...(data.barcode !== undefined ? { barcode: data.barcode } : {}),
      ...(data.expiryDate !== undefined
        ? { expiryDate: data.expiryDate }
        : {}),
    })
    .where(eq(products.id, id));

  revalidateTag("products", "max");
  revalidatePath("/products");
  revalidatePath("/pos");
  revalidatePath("/stock");
}

const productSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  categoryId: z.number().optional(),
  unit: z.string().default("pcs"),
  purchaseRate: z.number().nonnegative(),
  saleRate: z.number().nonnegative(),
  wholesaleRate: z.number().nonnegative().optional(),
  mrp: z.number().nonnegative().optional(),
  stockQty: z.number().nonnegative().default(0),
  reorderLevel: z.number().nonnegative().default(10),
  hsnCode: z.string().min(1, "HSN code is mandatory"),
  gstRate: z.number().nonnegative().default(18),
  expiryDate: z.string().optional(),
});

export async function createProduct(input: z.infer<typeof productSchema>) {
  const { revalidatePath, revalidateTag } = await import("next/cache");
  const data = productSchema.parse(input);
  const [product] = await db
    .insert(products)
    .values({
      name: data.name,
      sku: data.sku ?? parseSkuFromName(data.name),
      barcode: data.barcode,
      categoryId: data.categoryId,
      unit: data.unit,
      purchaseRate: data.purchaseRate.toFixed(2),
      saleRate: data.saleRate.toFixed(2),
      wholesaleRate: (data.wholesaleRate ?? data.saleRate).toFixed(2),
      mrp: data.mrp?.toFixed(2),
      stockQty: data.stockQty.toFixed(2),
      reorderLevel: data.reorderLevel.toFixed(2),
      hsnCode: data.hsnCode,
      gstRate: data.gstRate.toFixed(2),
      expiryDate: data.expiryDate ?? null,
    })
    .returning();

  revalidateTag("products", "max");
  revalidatePath("/products");
  return product;
}

export const getCategories = unstable_cache(
  async () => db.select().from(categories).orderBy(asc(categories.name)),
  ["categories"],
  { revalidate: 120, tags: ["products"] }
);

export async function getOrCreateCategory(name: string) {
  const [existing] = await db
    .select()
    .from(categories)
    .where(eq(categories.name, name))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(categories).values({ name }).returning();
  return created;
}

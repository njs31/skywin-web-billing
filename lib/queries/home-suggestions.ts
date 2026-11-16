import { and, asc, desc, eq, gt, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, farms, fieldListedProducts, fieldProductDetails, products, saleItems, sales } from "@/db/schema";
import { listedProductIds } from "@/lib/field-listed";
import {
  cropSuggestionIds,
  HOME_SUGGESTION_MIN,
  HOME_SUGGESTION_TTL_MS,
  pickSuggestionSource,
  uniquePins,
  type HomeSuggestionSource,
} from "@/lib/home-suggestions";
import { getBatchBillingRate, inclusiveSalePrice } from "@/lib/gst";
import { fieldImageUrl } from "@/lib/queries/field-product-details";
import { listProductBatchesByIds, type ProductBatchSearchResult } from "@/lib/queries/products";

export type HomeSuggestionItem = {
  productId: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  hsnCode: string | null;
  gstRate: string;
  saleRate: string;
  mrp: string | null;
  unit: string;
  productStockQty: string;
  batchId: number | null;
  batchNumber: string | null;
  batchQty: string;
  batchExpiry: string | null;
  rate: number;
  price: number;
  listPrice: number;
  discountPercent: number;
  image: string | null;
  stock: number;
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  lineKey: string;
};

export type HomeSuggestionResult = {
  source: HomeSuggestionSource | null;
  items: HomeSuggestionItem[];
};

const cache = new Map<number, { at: number; value: HomeSuggestionResult }>();
const CACHE_MAX = 500;

function remember(farmerId: number, value: HomeSuggestionResult) {
  cache.delete(farmerId);
  cache.set(farmerId, { at: Date.now(), value });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
}

function sellable() {
  return and(eq(products.isActive, true), gt(products.stockQty, "0"), inArray(products.id, listedProductIds()));
}

async function buyAgain(farmerId: number) {
  const rows = await db
    .select({
      productId: saleItems.productId,
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .innerJoin(products, eq(products.id, saleItems.productId))
    .where(
      and(
        eq(sales.customerId, farmerId),
        eq(sales.status, "active"),
        isNotNull(saleItems.productId),
        sellable()
      )
    )
    .groupBy(saleItems.productId)
    .orderBy(desc(sql`max(${sales.date})`))
    .limit(10);
  return rows.flatMap((row) => (row.productId ? [row.productId] : []));
}

async function forCrop(farmerId: number) {
  const [customer] = await db
    .select({ crop: customers.crop })
    .from(customers)
    .where(eq(customers.id, farmerId))
    .limit(1);
  const farmRows = await db.select({ crop: farms.crop }).from(farms).where(eq(farms.customerId, farmerId));
  const farmerCrops = [customer?.crop ?? "", ...farmRows.map((row) => row.crop ?? "")]
    .flatMap((value) => value.split(/[,;\n]/))
    .map((value) => value.trim())
    .filter(Boolean);
  if (farmerCrops.length === 0) return [];
  const rows = await db
    .select({
      id: products.id,
      crops: fieldProductDetails.crops,
      usage: fieldProductDetails.usage,
    })
    .from(products)
    .leftJoin(fieldProductDetails, eq(fieldProductDetails.productId, products.id))
    .where(sellable())
    .orderBy(asc(products.name));
  return cropSuggestionIds(
    rows.map((row) => ({ id: row.id, crops: row.crops, usage: row.usage ?? [] })),
    farmerCrops
  );
}

async function topSelling(customerIds?: number[]) {
  if (customerIds && customerIds.length === 0) return [];
  const rows = await db
    .select({
      productId: saleItems.productId,
      qty: sql<string>`sum(${saleItems.qty})`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .innerJoin(products, eq(products.id, saleItems.productId))
    .where(
      and(
        gte(sales.date, sql`now() - interval '60 days'`),
        eq(sales.status, "active"),
        isNotNull(saleItems.productId),
        sellable(),
        customerIds ? inArray(sales.customerId, customerIds) : undefined
      )
    )
    .groupBy(saleItems.productId)
    .orderBy(desc(sql`sum(${saleItems.qty})`))
    .limit(10);
  return rows.flatMap((row) => (row.productId ? [row.productId] : []));
}

async function customerIdsForPins(pins: string[]) {
  if (pins.length === 0) return [];
  const pinSql = sql.join(pins.map((pin) => sql`${pin}`), sql`, `);
  const byCustomer = await db
    .select({ id: customers.id })
    .from(customers)
    .where(sql`right(regexp_replace(coalesce(${customers.pinCode}, ''), '\\D', '', 'g'), 6) in (${pinSql})`);
  const byFarm = await db
    .select({ id: farms.customerId })
    .from(farms)
    .where(sql`right(regexp_replace(coalesce(${farms.pin}, ''), '\\D', '', 'g'), 6) in (${pinSql})`);
  return [...new Set([...byCustomer.map((row) => row.id), ...byFarm.map((row) => row.id)])];
}

async function customerIdsForDistrict(district: string) {
  const key = district.trim().toLocaleLowerCase();
  if (key.length < 2) return [];
  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(sql`lower(btrim(coalesce(${customers.district}, ''))) = ${key}`);
  return rows.map((row) => row.id);
}

async function nearby(farmerId: number) {
  const [customer] = await db
    .select({ pinCode: customers.pinCode, district: customers.district })
    .from(customers)
    .where(eq(customers.id, farmerId))
    .limit(1);
  const farmRows = await db.select({ pin: farms.pin }).from(farms).where(eq(farms.customerId, farmerId));
  const pins = uniquePins([customer?.pinCode, ...farmRows.map((row) => row.pin)]);
  const byPin = await topSelling(await customerIdsForPins(pins));
  if (byPin.length >= HOME_SUGGESTION_MIN) return byPin;
  return topSelling(await customerIdsForDistrict(customer?.district ?? ""));
}

async function present(ids: number[]): Promise<HomeSuggestionItem[]> {
  if (ids.length === 0) return [];
  const rows = await listProductBatchesByIds(ids);
  const chosen = new Map<number, ProductBatchSearchResult>();
  for (const row of rows) {
    const stock = Number(row.batchQty) || 0;
    const current = chosen.get(row.productId);
    const currentStock = current ? Number(current.batchQty) || 0 : -1;
    if (!current || (stock > 0 && currentStock <= 0)) chosen.set(row.productId, row);
  }
  const images = new Map<number, string | null>();
  const detailRows = await db
    .select({ productId: fieldProductDetails.productId, images: fieldProductDetails.images })
    .from(fieldProductDetails)
    .where(inArray(fieldProductDetails.productId, ids));
  for (const row of detailRows) {
    images.set(
      row.productId,
      row.images.map(fieldImageUrl).find((src) => src && !/images\.unsplash\.com/i.test(src)) ?? null
    );
  }
  const shipping = new Map<number, { weightGrams: number | null; lengthCm: number | null; widthCm: number | null; heightCm: number | null }>();
  const shipRows = await db
    .select({
      productId: fieldListedProducts.productId,
      weightGrams: fieldListedProducts.weightGrams,
      lengthCm: fieldListedProducts.lengthCm,
      widthCm: fieldListedProducts.widthCm,
      heightCm: fieldListedProducts.heightCm,
    })
    .from(fieldListedProducts)
    .where(inArray(fieldListedProducts.productId, ids));
  for (const row of shipRows) {
    shipping.set(row.productId, {
      weightGrams: row.weightGrams,
      lengthCm: row.lengthCm == null ? null : Number(row.lengthCm),
      widthCm: row.widthCm == null ? null : Number(row.widthCm),
      heightCm: row.heightCm == null ? null : Number(row.heightCm),
    });
  }
  return ids.flatMap((id) => {
    const row = chosen.get(id);
    if (!row) return [];
    const batchQty = Number(row.batchQty) || 0;
    const productQty = Number(row.productStockQty) || 0;
    const stock = batchQty > 0 ? batchQty : productQty;
    if (stock <= 0) return [];
    const rate = getBatchBillingRate(row, "retail");
    const gst = Number(row.gstRate) || 0;
    const ship = shipping.get(id);
    return [
      {
        productId: row.productId,
        name: row.name,
        sku: row.sku,
        barcode: row.barcode,
        hsnCode: row.hsnCode,
        gstRate: row.gstRate,
        saleRate: row.saleRate,
        mrp: row.mrp,
        unit: row.unit,
        productStockQty: row.productStockQty,
        batchId: row.batchId,
        batchNumber: row.batchNumber,
        batchQty: row.batchQty,
        batchExpiry: row.batchExpiry,
        rate,
        price: inclusiveSalePrice(rate, gst),
        listPrice: inclusiveSalePrice(Number(row.saleRate) || rate, gst),
        discountPercent: Number(row.discountPercent) || 0,
        image: images.get(id) ?? null,
        stock,
        weightGrams: ship?.weightGrams ?? null,
        lengthCm: ship?.lengthCm ?? null,
        widthCm: ship?.widthCm ?? null,
        heightCm: ship?.heightCm ?? null,
        lineKey: `${row.productId}-${row.batchId ?? "none"}`,
      },
    ];
  });
}

const empty: HomeSuggestionResult = { source: null, items: [] };

export async function homeSuggestionsForFarmer(farmerId: number): Promise<HomeSuggestionResult> {
  const hit = cache.get(farmerId);
  if (hit && Date.now() - hit.at < HOME_SUGGESTION_TTL_MS) return hit.value;

  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, farmerId))
    .limit(1);
  if (!customer) return empty;

  const sources: Array<() => Promise<{ source: HomeSuggestionSource; ids: number[] }>> = [
    async () => ({ source: "buy_again", ids: await buyAgain(farmerId) }),
    async () => ({ source: "crop", ids: await forCrop(farmerId) }),
    async () => ({ source: "nearby", ids: await nearby(farmerId) }),
    async () => ({ source: "bestsellers", ids: await topSelling() }),
  ];
  let value: HomeSuggestionResult = empty;
  for (const load of sources) {
    const picked = pickSuggestionSource([await load()]);
    if (!picked) continue;
    const items = await present(picked.ids);
    if (items.length < HOME_SUGGESTION_MIN) continue;
    value = { source: picked.source, items };
    break;
  }
  remember(farmerId, value);
  return value;
}

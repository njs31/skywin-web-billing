/**
 * Excel export and import of Field app products (Product details page).
 * The sheet format and row rules live in lib/field-product-sheet.ts.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  fieldCategories,
  fieldListedProducts,
  fieldProductDetails,
  fieldSubcategories,
  fieldSubcategoryProducts,
  products,
} from "@/db/schema";
import {
  PRODUCT_IMPORT_MAX_ROWS,
  matchKey,
  missingForNewProduct,
  readSheetRow,
  type ProductSheetRow,
  type ProductSheetValues,
} from "@/lib/field-product-sheet";
import { assignProductToSubcategory } from "@/lib/queries/field-catalog";
import { createProduct, updateProduct } from "@/lib/queries/products";

const n2 = (v: string | number | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/** Every product listed for the Field app (switched on or off), one row each, in sheet column order. */
export async function exportFieldProductRows() {
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      barcode: products.barcode,
      name: products.name,
      hsnCode: products.hsnCode,
      gstRate: products.gstRate,
      mrp: products.mrp,
      saleRate: products.saleRate,
      purchaseRate: products.purchaseRate,
      stockQty: products.stockQty,
      unit: products.unit,
      appVisible: fieldListedProducts.appVisible,
      brand: fieldProductDetails.brand,
      displayName: fieldProductDetails.displayName,
      activeIngredient: fieldProductDetails.activeIngredient,
      packSizes: fieldProductDetails.packSizes,
      crops: fieldProductDetails.crops,
      minOrderQty: fieldProductDetails.minOrderQty,
      maxOrderQty: fieldProductDetails.maxOrderQty,
      description: fieldProductDetails.description,
      category: sql<string | null>`(
        select ${fieldCategories.title}
        from ${fieldSubcategoryProducts}
        inner join ${fieldSubcategories} on ${fieldSubcategories.id} = ${fieldSubcategoryProducts.subcategoryId}
        inner join ${fieldCategories} on ${fieldCategories.id} = ${fieldSubcategories.categoryId}
        where ${fieldSubcategoryProducts.productId} = ${products.id}
        order by ${fieldCategories.title}, ${fieldSubcategories.title}
        limit 1
      )`,
      subcategory: sql<string | null>`(
        select ${fieldSubcategories.title}
        from ${fieldSubcategoryProducts}
        inner join ${fieldSubcategories} on ${fieldSubcategories.id} = ${fieldSubcategoryProducts.subcategoryId}
        inner join ${fieldCategories} on ${fieldCategories.id} = ${fieldSubcategories.categoryId}
        where ${fieldSubcategoryProducts.productId} = ${products.id}
        order by ${fieldCategories.title}, ${fieldSubcategories.title}
        limit 1
      )`,
    })
    .from(fieldListedProducts)
    .innerJoin(products, eq(products.id, fieldListedProducts.productId))
    .leftJoin(fieldProductDetails, eq(fieldProductDetails.productId, products.id))
    .where(eq(products.isActive, true))
    .orderBy(asc(products.name), asc(products.id));

  return rows.map((r) => ({
    "Product ID": r.id,
    SKU: r.sku ?? "",
    Barcode: r.barcode ?? "",
    Name: r.name,
    Category: r.category ?? "",
    Subcategory: r.subcategory ?? "",
    HSN: r.hsnCode ?? "",
    "GST %": n2(r.gstRate),
    MRP: r.mrp == null || r.mrp === "" ? "" : n2(r.mrp),
    "Sale rate": n2(r.saleRate),
    "Purchase rate": n2(r.purchaseRate),
    Stock: n2(r.stockQty),
    Unit: r.unit ?? "",
    "In app": r.appVisible === false ? "Off" : "On",
    Brand: r.brand ?? "",
    "Display name": r.displayName ?? "",
    "Active ingredient": r.activeIngredient ?? "",
    "Pack sizes": r.packSizes ?? "",
    Crops: r.crops ?? "",
    "Min order qty": r.minOrderQty == null ? "" : n2(r.minOrderQty),
    "Max order qty": r.maxOrderQty == null ? "" : n2(r.maxOrderQty),
    Description: r.description ?? "",
  }));
}

export type ImportRowPlan = {
  /** Spreadsheet row number (header is row 1). */
  row: number;
  action: "update" | "create" | "unchanged" | "error";
  productId: number | null;
  name: string;
  /** Human-readable changes, e.g. "Sale rate ₹120 → ₹135". */
  changes: string[];
  errors: string[];
  notes: string[];
};

type Current = {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  hsnCode: string | null;
  gstRate: string;
  mrp: string | null;
  saleRate: string;
  purchaseRate: string;
  stockQty: string | null;
  unit: string;
  isActive: boolean;
  listed: boolean;
  appVisible: boolean | null;
  brand: string | null;
  displayName: string | null;
  activeIngredient: string | null;
  packSizes: string | null;
  crops: string | null;
  minOrderQty: string | null;
  maxOrderQty: string | null;
  description: string | null;
};

type Prepared = {
  plan: ImportRowPlan;
  values: ProductSheetValues;
  current: Current | null;
  subcategoryId: number | null;
  alreadyPinned: boolean;
};

const rupees = (v: string | number | null | undefined) => (v == null || v === "" ? "—" : `₹${n2(v).toLocaleString("en-IN")}`);
const same = (a: string | number | null | undefined, b: number | null) => b == null || n2(a) === n2(b);
/** Spacing-insensitive: a sheet cell "A  B " equals "A B" in billing, so a round trip changes nothing. */
const tidy = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const sameText = (a: string | null | undefined, b: string | null) => b == null || tidy(a) === tidy(b);

async function loadCurrent(ids: number[], skus: string[], barcodes: string[]) {
  const conds = [
    ids.length ? inArray(products.id, ids) : undefined,
    skus.length ? sql`lower(btrim(${products.sku})) in (${sql.join(skus.map((s) => sql`${s}`), sql`, `)})` : undefined,
    barcodes.length ? sql`lower(btrim(${products.barcode})) in (${sql.join(barcodes.map((s) => sql`${s}`), sql`, `)})` : undefined,
  ].filter(Boolean);
  if (!conds.length) return [] as Current[];
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      hsnCode: products.hsnCode,
      gstRate: products.gstRate,
      mrp: products.mrp,
      saleRate: products.saleRate,
      purchaseRate: products.purchaseRate,
      stockQty: products.stockQty,
      unit: products.unit,
      isActive: products.isActive,
      listedId: fieldListedProducts.productId,
      appVisible: fieldListedProducts.appVisible,
      brand: fieldProductDetails.brand,
      displayName: fieldProductDetails.displayName,
      activeIngredient: fieldProductDetails.activeIngredient,
      packSizes: fieldProductDetails.packSizes,
      crops: fieldProductDetails.crops,
      minOrderQty: fieldProductDetails.minOrderQty,
      maxOrderQty: fieldProductDetails.maxOrderQty,
      description: fieldProductDetails.description,
    })
    .from(products)
    .leftJoin(fieldListedProducts, eq(fieldListedProducts.productId, products.id))
    .leftJoin(fieldProductDetails, eq(fieldProductDetails.productId, products.id))
    .where(sql.join(conds as ReturnType<typeof sql>[], sql` or `));
  return rows.map((r) => ({ ...r, listed: r.listedId != null }));
}

async function prepareImport(rows: ProductSheetRow[]): Promise<Prepared[]> {
  if (rows.length > PRODUCT_IMPORT_MAX_ROWS) {
    throw new Error(`The file has ${rows.length} rows. Import at most ${PRODUCT_IMPORT_MAX_ROWS} at a time.`);
  }
  const read = rows.map((row) => readSheetRow(row));
  const ids = [...new Set(read.map((r) => r.values.productId).filter((v): v is number => v != null))];
  const skus = [...new Set(read.map((r) => matchKey(r.values.sku)).filter(Boolean))];
  const barcodes = [...new Set(read.map((r) => matchKey(r.values.barcode)).filter(Boolean))];

  const [current, categories, subs, pins] = await Promise.all([
    loadCurrent(ids, skus, barcodes),
    db.select({ id: fieldCategories.id, title: fieldCategories.title }).from(fieldCategories),
    db.select({ id: fieldSubcategories.id, categoryId: fieldSubcategories.categoryId, title: fieldSubcategories.title }).from(fieldSubcategories),
    ids.length
      ? db
          .select({ productId: fieldSubcategoryProducts.productId, subcategoryId: fieldSubcategoryProducts.subcategoryId })
          .from(fieldSubcategoryProducts)
          .where(inArray(fieldSubcategoryProducts.productId, ids))
      : Promise.resolve([] as Array<{ productId: number; subcategoryId: number }>),
  ]);

  const byId = new Map(current.map((c) => [c.id, c]));
  const bySku = new Map<string, Current[]>();
  const byBarcode = new Map<string, Current[]>();
  for (const c of current) {
    if (c.sku) bySku.set(matchKey(c.sku), [...(bySku.get(matchKey(c.sku)) ?? []), c]);
    if (c.barcode) byBarcode.set(matchKey(c.barcode), [...(byBarcode.get(matchKey(c.barcode)) ?? []), c]);
  }
  const pinned = new Set(pins.map((p) => `${p.productId}:${p.subcategoryId}`));
  const seen = new Map<number, number>();
  const newKeys = new Map<string, number>();

  return read.map(({ values, errors: rowErrors }, i) => {
    const rowNo = i + 2;
    const errors = [...rowErrors];
    const notes: string[] = [];
    const changes: string[] = [];

    // Match: Product ID, then SKU, then barcode.
    let found: Current | null = null;
    if (values.productId != null) {
      found = byId.get(values.productId) ?? null;
      if (!found) errors.push(`No product has ID ${values.productId}`);
    } else if (values.sku) {
      const list = bySku.get(matchKey(values.sku)) ?? [];
      if (list.length > 1) errors.push(`${list.length} products share SKU ${values.sku}; add the Product ID`);
      else found = list[0] ?? null;
    }
    if (!found && values.productId == null && values.barcode && !errors.length) {
      const list = byBarcode.get(matchKey(values.barcode)) ?? [];
      if (list.length > 1) errors.push(`${list.length} products share barcode ${values.barcode}; add the Product ID`);
      else found = list[0] ?? null;
    }
    if (found && !found.isActive) errors.push(`${found.name} is deactivated in billing`);
    if (found) {
      const earlier = seen.get(found.id);
      if (earlier) errors.push(`Same product as row ${earlier}`);
      else seen.set(found.id, rowNo);
    } else if (!errors.length) {
      const key = matchKey(values.sku) || matchKey(values.name);
      const earlier = key ? newKeys.get(key) : undefined;
      if (earlier) errors.push(`Same new product as row ${earlier}`);
      else if (key) newKeys.set(key, rowNo);
    }

    // Category and subcategory, matched by name.
    let subcategoryId: number | null = null;
    if (values.category) {
      const cat = categories.find((c) => matchKey(c.title) === matchKey(values.category));
      if (!cat) errors.push(`No category called "${values.category}"`);
      else if (values.subcategory) {
        const sub = subs.find((s) => s.categoryId === cat.id && matchKey(s.title) === matchKey(values.subcategory));
        if (!sub) errors.push(`"${values.category}" has no subcategory called "${values.subcategory}"`);
        else subcategoryId = sub.id;
      } else {
        const own = subs.filter((s) => s.categoryId === cat.id);
        if (own.length === 1) subcategoryId = own[0].id;
        else errors.push(`Give the Subcategory inside "${values.category}"`);
      }
    }
    const alreadyPinned = !!(found && subcategoryId && pinned.has(`${found.id}:${subcategoryId}`));

    if (found) {
      const c = found;
      if (!sameText(c.name, values.name)) changes.push(`Name → ${values.name}`);
      if (values.sku && c.sku && matchKey(values.sku) !== matchKey(c.sku) && values.productId != null) {
        notes.push(`SKU stays ${c.sku} (SKU can't be changed by import)`);
      }
      if (values.barcode && matchKey(values.barcode) !== matchKey(c.barcode) && values.productId != null) {
        changes.push(`Barcode ${c.barcode || "—"} → ${values.barcode}`);
      }
      if (!sameText(c.hsnCode, values.hsnCode)) changes.push(`HSN ${c.hsnCode || "—"} → ${values.hsnCode}`);
      if (!same(c.gstRate, values.gstRate)) changes.push(`GST ${n2(c.gstRate)}% → ${values.gstRate}%`);
      if (values.mrp != null && (c.mrp == null || c.mrp === "" || n2(c.mrp) !== values.mrp)) changes.push(`MRP ${rupees(c.mrp)} → ${rupees(values.mrp)}`);
      if (!same(c.saleRate, values.saleRate)) changes.push(`Sale rate ${rupees(c.saleRate)} → ${rupees(values.saleRate)}`);
      if (!same(c.purchaseRate, values.purchaseRate)) changes.push(`Purchase rate ${rupees(c.purchaseRate)} → ${rupees(values.purchaseRate)}`);
      if (!same(c.stockQty, values.stock)) changes.push(`Stock ${n2(c.stockQty)} → ${values.stock}`);
      if (!sameText(c.unit, values.unit)) changes.push(`Unit ${c.unit} → ${values.unit}`);
      if (!c.listed) {
        changes.push(values.appVisible === false ? "Add to the Field app, switched Off" : "Add to the Field app");
      } else if (values.appVisible != null && values.appVisible !== (c.appVisible !== false)) {
        changes.push(`In app → ${values.appVisible ? "On" : "Off"}`);
      }
      const detail: Array<[string, string | null, string | null]> = [
        ["Brand", c.brand, values.brand],
        ["Display name", c.displayName, values.displayName],
        ["Active ingredient", c.activeIngredient, values.activeIngredient],
        ["Pack sizes", c.packSizes, values.packSizes],
        ["Crops", c.crops, values.crops],
        ["Description", c.description, values.description],
      ];
      for (const [label, before, after] of detail) if (!sameText(before, after)) changes.push(`${label} updated`);
      if (!same(c.minOrderQty, values.minOrderQty)) changes.push(`Min order qty → ${values.minOrderQty}`);
      if (!same(c.maxOrderQty, values.maxOrderQty)) changes.push(`Max order qty → ${values.maxOrderQty}`);
      const minAfter = values.minOrderQty ?? (c.minOrderQty == null ? null : n2(c.minOrderQty));
      const maxAfter = values.maxOrderQty ?? (c.maxOrderQty == null ? null : n2(c.maxOrderQty));
      if (minAfter != null && maxAfter != null && minAfter > maxAfter) errors.push("Min order qty would be more than Max order qty");
      if (subcategoryId && !alreadyPinned) changes.push(`Add to ${values.category} › ${values.subcategory ?? ""}`.replace(/ › $/, ""));
    } else if (!errors.length) {
      const missing = missingForNewProduct(values);
      if (missing.length) errors.push(`New product needs ${missing.join(", ")}`);
      else changes.push("New product");
    }

    const action: ImportRowPlan["action"] = errors.length ? "error" : found ? (changes.length ? "update" : "unchanged") : "create";
    return {
      plan: {
        row: rowNo,
        action,
        productId: found?.id ?? null,
        name: values.name || found?.name || values.sku || values.barcode || "—",
        changes,
        errors,
        notes,
      },
      values,
      current: found,
      subcategoryId,
      alreadyPinned,
    };
  });
}

export async function planFieldProductImport(rows: ProductSheetRow[]) {
  const prepared = await prepareImport(rows);
  const plans = prepared.map((p) => p.plan);
  return {
    rows: plans,
    counts: {
      update: plans.filter((p) => p.action === "update").length,
      create: plans.filter((p) => p.action === "create").length,
      unchanged: plans.filter((p) => p.action === "unchanged").length,
      error: plans.filter((p) => p.action === "error").length,
    },
  };
}

async function saveDetails(productId: number, v: ProductSheetValues) {
  const set: Partial<typeof fieldProductDetails.$inferInsert> = {};
  if (v.brand != null) set.brand = v.brand;
  if (v.displayName != null) set.displayName = v.displayName;
  if (v.activeIngredient != null) set.activeIngredient = v.activeIngredient;
  if (v.packSizes != null) set.packSizes = v.packSizes;
  if (v.crops != null) set.crops = v.crops;
  if (v.description != null) set.description = v.description;
  if (v.minOrderQty != null) set.minOrderQty = String(v.minOrderQty);
  if (v.maxOrderQty != null) set.maxOrderQty = String(v.maxOrderQty);
  if (!Object.keys(set).length) return;
  await db
    .insert(fieldProductDetails)
    .values({ productId, ...set, updatedAt: new Date() })
    .onConflictDoUpdate({ target: fieldProductDetails.productId, set: { ...set, updatedAt: new Date() } });
}

async function saveListing(productId: number, sourceCode: string, appVisible: boolean | null) {
  await db
    .insert(fieldListedProducts)
    .values({ productId, sourceCode, appVisible: appVisible ?? true })
    .onConflictDoUpdate({
      target: fieldListedProducts.productId,
      set: appVisible == null ? { productId: sql`${fieldListedProducts.productId}` } : { appVisible },
    });
}

/**
 * Applies the import. Each row is saved on its own: a row that fails is reported and the rest
 * still save. Rows are checked again here, so a file edited after the preview is still safe.
 */
export async function applyFieldProductImport(rows: ProductSheetRow[], actor: { userId: number | null; userName: string }) {
  const prepared = await prepareImport(rows);
  const result = { updated: 0, created: 0, unchanged: 0, failed: [] as Array<{ row: number; name: string; reason: string }> };
  const sourceCode = `import-${new Date().toISOString().slice(0, 10)}`;

  for (const p of prepared) {
    const { plan, values: v, current: c } = p;
    if (plan.action === "error") {
      result.failed.push({ row: plan.row, name: plan.name, reason: plan.errors.join("; ") });
      continue;
    }
    if (plan.action === "unchanged") {
      result.unchanged += 1;
      continue;
    }
    try {
      if (c) {
        const productChanged =
          !sameText(c.name, v.name) ||
          (v.barcode && v.productId != null && matchKey(v.barcode) !== matchKey(c.barcode)) ||
          !sameText(c.hsnCode, v.hsnCode) ||
          !same(c.gstRate, v.gstRate) ||
          (v.mrp != null && (c.mrp == null || c.mrp === "" || n2(c.mrp) !== v.mrp)) ||
          !same(c.saleRate, v.saleRate) ||
          !same(c.purchaseRate, v.purchaseRate) ||
          !same(c.stockQty, v.stock) ||
          !sameText(c.unit, v.unit);
        if (productChanged) {
          await updateProduct(
            c.id,
            {
              saleRate: v.saleRate ?? n2(c.saleRate),
              gstRate: v.gstRate ?? n2(c.gstRate),
              ...(v.purchaseRate != null ? { purchaseRate: v.purchaseRate } : {}),
              ...(v.mrp != null ? { mrp: v.mrp } : {}),
              ...(v.hsnCode ? { hsnCode: v.hsnCode } : {}),
              ...(v.barcode && v.productId != null ? { barcode: v.barcode } : {}),
              ...(v.name && !sameText(c.name, v.name) ? { name: v.name } : {}),
              ...(v.unit ? { unit: v.unit } : {}),
              ...(v.stock != null && !same(c.stockQty, v.stock) ? { stockQty: v.stock } : {}),
            },
            actor
          );
        }
        if (!c.listed || v.appVisible != null) await saveListing(c.id, c.sku || sourceCode, v.appVisible);
        await saveDetails(c.id, v);
        if (p.subcategoryId && !p.alreadyPinned) await assignProductToSubcategory(p.subcategoryId, c.id);
        result.updated += 1;
      } else {
        const product = await createProduct({
          name: v.name!,
          sku: v.sku ?? undefined,
          barcode: v.barcode ?? undefined,
          unit: v.unit || "pcs",
          purchaseRate: v.purchaseRate ?? v.saleRate!,
          saleRate: v.saleRate!,
          mrp: v.mrp ?? undefined,
          gstRate: v.gstRate!,
          hsnCode: v.hsnCode!,
          stockQty: v.stock ?? 0,
          reorderLevel: 10,
        });
        if (!product) throw new Error("Product was not created");
        await saveListing(product.id, product.sku || sourceCode, v.appVisible ?? true);
        await saveDetails(product.id, v);
        if (p.subcategoryId) await assignProductToSubcategory(p.subcategoryId, product.id);
        result.created += 1;
      }
    } catch (err) {
      result.failed.push({ row: plan.row, name: plan.name, reason: err instanceof Error ? err.message : "Could not save" });
    }
  }
  return result;
}

/** Switches one listed product on or off in the app. */
export async function setFieldProductAppVisible(productId: number, visible: boolean) {
  const [row] = await db
    .update(fieldListedProducts)
    .set({ appVisible: visible })
    .where(eq(fieldListedProducts.productId, productId))
    .returning({ productId: fieldListedProducts.productId });
  if (!row) throw new Error("This product is not listed for the Field app.");
}

/** Counts for the Product details page. */
export async function fieldProductVisibilityCounts() {
  const [row] = await db
    .select({
      hidden: sql<number>`count(*) filter (where ${fieldListedProducts.appVisible} = false)::int`,
    })
    .from(fieldListedProducts)
    .innerJoin(products, and(eq(products.id, fieldListedProducts.productId), eq(products.isActive, true)));
  return { hidden: Number(row?.hidden ?? 0) };
}

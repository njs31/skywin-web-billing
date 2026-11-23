/**
 * The Field dashboard's product spreadsheet: the columns the export writes and the import reads,
 * and the pure rules that turn one sheet row into changes. No database code here (tested in
 * lib/field-product-sheet.test.ts).
 *
 * Import rules
 * - A row is matched to a product by Product ID, then SKU, then barcode.
 * - Matched rows update only the cells that are filled in. A blank cell keeps what is there.
 * - A row that matches nothing creates a new product; it needs Name, Sale rate, GST % and HSN.
 * - "In app" takes On/Off (also Yes/No, 1/0, Show/Hide).
 */

export const PRODUCT_SHEET_COLUMNS = [
  "Product ID",
  "SKU",
  "Barcode",
  "Name",
  "Category",
  "Subcategory",
  "HSN",
  "GST %",
  "MRP",
  "Sale rate",
  "Purchase rate",
  "Stock",
  "Unit",
  "In app",
  "Brand",
  "Display name",
  "Active ingredient",
  "Pack sizes",
  "Crops",
  "Min order qty",
  "Max order qty",
  "Description",
] as const;

export type ProductSheetColumn = (typeof PRODUCT_SHEET_COLUMNS)[number];
export type ProductSheetRow = Partial<Record<ProductSheetColumn, string | number | boolean | null>>;

/** Largest file the import accepts in one go. */
export const PRODUCT_IMPORT_MAX_ROWS = 3000;

/** GST slabs billing accepts. */
export const GST_RATES = [0, 5, 12, 18, 28];

export type ProductSheetValues = {
  productId: number | null;
  sku: string | null;
  barcode: string | null;
  name: string | null;
  category: string | null;
  subcategory: string | null;
  hsnCode: string | null;
  gstRate: number | null;
  mrp: number | null;
  saleRate: number | null;
  purchaseRate: number | null;
  stock: number | null;
  unit: string | null;
  appVisible: boolean | null;
  brand: string | null;
  displayName: string | null;
  activeIngredient: string | null;
  packSizes: string | null;
  crops: string | null;
  minOrderQty: number | null;
  maxOrderQty: number | null;
  description: string | null;
};

/** Header text → column, forgiving case, spaces and a few common names. */
const HEADER_ALIASES: Record<string, ProductSheetColumn> = {
  productid: "Product ID",
  id: "Product ID",
  sku: "SKU",
  code: "SKU",
  itemcode: "SKU",
  barcode: "Barcode",
  name: "Name",
  productname: "Name",
  itemname: "Name",
  category: "Category",
  subcategory: "Subcategory",
  hsn: "HSN",
  hsncode: "HSN",
  gst: "GST %",
  gstrate: "GST %",
  "gst%": "GST %",
  mrp: "MRP",
  salerate: "Sale rate",
  saleprice: "Sale rate",
  sellingprice: "Sale rate",
  price: "Sale rate",
  rate: "Sale rate",
  purchaserate: "Purchase rate",
  purchaseprice: "Purchase rate",
  cost: "Purchase rate",
  stock: "Stock",
  stockqty: "Stock",
  qty: "Stock",
  quantity: "Stock",
  unit: "Unit",
  inapp: "In app",
  showinapp: "In app",
  visible: "In app",
  visibility: "In app",
  brand: "Brand",
  displayname: "Display name",
  appname: "Display name",
  activeingredient: "Active ingredient",
  ingredient: "Active ingredient",
  packsizes: "Pack sizes",
  packsize: "Pack sizes",
  crops: "Crops",
  minorderqty: "Min order qty",
  minqty: "Min order qty",
  maxorderqty: "Max order qty",
  maxqty: "Max order qty",
  description: "Description",
};

export function sheetColumnFor(header: string): ProductSheetColumn | null {
  const key = header.toLowerCase().replace(/[\s_.\-()]/g, "");
  return HEADER_ALIASES[key] ?? null;
}

/** Re-keys raw sheet rows (any header spelling) to the export's column names. Drops empty rows. */
export function normalizeSheetRows(raw: Array<Record<string, unknown>>): ProductSheetRow[] {
  const out: ProductSheetRow[] = [];
  for (const row of raw) {
    const next: ProductSheetRow = {};
    let filled = false;
    for (const [header, value] of Object.entries(row)) {
      const col = sheetColumnFor(header);
      if (!col || next[col] != null) continue;
      if (value == null || (typeof value === "string" && !value.trim())) continue;
      next[col] = typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : String(value);
      filled = true;
    }
    if (filled) out.push(next);
  }
  return out;
}

function text(v: unknown) {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s ? s : null;
}

/** Long text keeps its line breaks. */
function longText(v: unknown) {
  if (v == null) return null;
  const s = String(v).replace(/\r\n?/g, "\n").trim();
  return s ? s : null;
}

/** Numbers like "₹1,250.50", "18%" or 1250.5. */
function num(v: unknown, label: string, errors: string[]) {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) {
      errors.push(`${label} is not a number`);
      return null;
    }
    return v;
  }
  const cleaned = String(v).replace(/[₹,%\s]/g, "").replace(/^rs\.?/i, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    errors.push(`${label} "${String(v).trim()}" is not a number`);
    return null;
  }
  return n;
}

function onOff(v: unknown, errors: string[]) {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["on", "yes", "y", "1", "true", "show", "shown", "visible"].includes(s)) return true;
  if (["off", "no", "n", "0", "false", "hide", "hidden"].includes(s)) return false;
  errors.push(`In app must be On or Off, not "${String(v).trim()}"`);
  return null;
}

/** Codes keep their digits as typed; Excel turns long numbers into 1.23E+12, which is refused. */
function code(v: unknown, label: string, errors: string[]) {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) {
      errors.push(`${label} lost digits in Excel; format that column as Text and type it again`);
      return null;
    }
    return String(v);
  }
  const s = String(v).trim();
  if (/^\d+(\.\d+)?e\+\d+$/i.test(s)) {
    errors.push(`${label} lost digits in Excel; format that column as Text and type it again`);
    return null;
  }
  return s || null;
}

/** Reads one sheet row. Errors are per row; the rest of the file still imports. */
export function readSheetRow(row: ProductSheetRow): { values: ProductSheetValues; errors: string[] } {
  const errors: string[] = [];
  const idRaw = num(row["Product ID"], "Product ID", errors);
  const productId = idRaw == null ? null : Number.isInteger(idRaw) && idRaw > 0 ? idRaw : (errors.push("Product ID must be a whole number"), null);

  const gstRate = num(row["GST %"], "GST %", errors);
  if (gstRate != null && !GST_RATES.includes(gstRate)) errors.push(`GST % must be one of ${GST_RATES.join(", ")}`);

  const money = (col: ProductSheetColumn) => {
    const n = num(row[col], col, errors);
    if (n != null && n < 0) {
      errors.push(`${col} cannot be negative`);
      return null;
    }
    return n == null ? null : Math.round(n * 100) / 100;
  };
  const qty = (col: ProductSheetColumn) => {
    const n = num(row[col], col, errors);
    if (n != null && n < 0) {
      errors.push(`${col} cannot be negative`);
      return null;
    }
    return n;
  };

  const values: ProductSheetValues = {
    productId,
    sku: code(row["SKU"], "SKU", errors),
    barcode: code(row["Barcode"], "Barcode", errors),
    name: text(row["Name"]),
    category: text(row["Category"]),
    subcategory: text(row["Subcategory"]),
    hsnCode: code(row["HSN"], "HSN", errors),
    gstRate: gstRate != null && GST_RATES.includes(gstRate) ? gstRate : null,
    mrp: money("MRP"),
    saleRate: money("Sale rate"),
    purchaseRate: money("Purchase rate"),
    stock: qty("Stock"),
    unit: text(row["Unit"]),
    appVisible: onOff(row["In app"], errors),
    brand: text(row["Brand"]),
    displayName: text(row["Display name"]),
    activeIngredient: text(row["Active ingredient"]),
    packSizes: text(row["Pack sizes"]),
    crops: text(row["Crops"]),
    minOrderQty: qty("Min order qty"),
    maxOrderQty: qty("Max order qty"),
    description: longText(row["Description"]),
  };

  if (values.hsnCode && !/^\d{4,8}$/.test(values.hsnCode)) errors.push("HSN must be 4 to 8 digits");
  if (values.minOrderQty != null && values.maxOrderQty != null && values.minOrderQty > values.maxOrderQty) {
    errors.push("Min order qty is more than Max order qty");
  }
  if (values.stock != null && Math.abs(Math.round(values.stock * 100) - values.stock * 100) > 1e-6) {
    errors.push("Stock can have at most 2 decimals");
  }
  if (values.subcategory && !values.category) errors.push("Give the Category for that Subcategory");
  if (values.name && values.name.length > 200) errors.push("Name is longer than 200 characters");
  return { values, errors };
}

/** What a new product needs before it can be created. */
export function missingForNewProduct(v: ProductSheetValues) {
  const missing: string[] = [];
  if (!v.name) missing.push("Name");
  if (v.saleRate == null) missing.push("Sale rate");
  if (v.gstRate == null) missing.push("GST %");
  if (!v.hsnCode) missing.push("HSN");
  return missing;
}

/** Case- and space-insensitive key for matching category, SKU and barcode text. */
export function matchKey(s: string | null | undefined) {
  return String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

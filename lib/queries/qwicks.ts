import { db } from "@/db";
import { products, categories, customers } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { getSettings } from "@/lib/settings";
import { createSale } from "@/lib/queries/sales";
import { toNumber } from "@/lib/utils";

export type QwicksProductItem = {
  productCode: string;
  fullName: string;
  shortName: string;
  description?: string;
  salePrice: number;
  price: number;
  mrp: number;
  stock: number;
  categoryName?: string;
  category?: string;
  barCode?: string;
  hsn?: string;
  taxPercentage: number;
  taxPercent: number;
  expiryDate?: string | null;
  isActive: boolean;
};

export async function getQwicksInventoryPayload() {
  const settings = await getSettings();
  const merchantId = settings.qwicksMerchantId || "skywin";

  const rows = await db
    .select({
      product: products,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.isActive, true))
    .orderBy(asc(products.name));

  const items: QwicksProductItem[] = rows.map(({ product, categoryName }) => {
    const code = product.sku || product.barcode || `PROD-${product.id}`;
    const saleRateNum = toNumber(product.saleRate);
    const mrpNum = product.mrp ? toNumber(product.mrp) : saleRateNum;
    const stockNum = Math.max(0, Math.floor(toNumber(product.stockQty)));
    const gstNum = toNumber(product.gstRate);
    const cat = categoryName || "General";

    return {
      productCode: code,
      fullName: product.name,
      shortName: product.name,
      description: `HSN: ${product.hsnCode || "-"}`,
      salePrice: saleRateNum,
      price: saleRateNum,
      mrp: mrpNum,
      stock: stockNum,
      categoryName: cat,
      category: cat,
      barCode: product.barcode || product.sku || code,
      hsn: product.hsnCode || "",
      taxPercentage: gstNum,
      taxPercent: gstNum,
      expiryDate: product.expiryDate ?? null,
      isActive: product.isActive,
    };
  });

  return {
    merchantId,
    totalProducts: items.length,
    replaceExistingImages: false,
    products: items,
  };
}

export async function validateQwicksStockCheck(body: {
  merchantId?: string;
  requestId?: string;
  items?: Array<{
    productId?: string;
    productCode?: string;
    barCode?: string;
    requestedQty: number;
  }>;
}) {
  const settings = await getSettings();
  const merchantId = settings.qwicksMerchantId || "skywin";
  const items = body.items ?? [];

  if (items.length === 0) {
    return {
      success: true,
      merchantId,
      requestId: body.requestId,
      canPlaceOrder: true,
      results: [],
    };
  }

  const allProducts = await db
    .select()
    .from(products)
    .where(eq(products.isActive, true));

  let canPlaceOrder = true;
  const results = items.map((item) => {
    const targetCode = (item.productCode || item.productId || item.barCode || "").trim();

    const matched = allProducts.find(
      (p) =>
        (p.sku && p.sku.trim() === targetCode) ||
        (p.barcode && p.barcode.trim() === targetCode) ||
        String(p.id) === targetCode ||
        p.name.trim().toLowerCase() === targetCode.toLowerCase()
    );

    if (!matched) {
      canPlaceOrder = false;
      return {
        productCode: targetCode || "UNKNOWN",
        availableQty: 0,
        isAvailable: false,
      };
    }

    const availableQty = Math.max(0, Math.floor(toNumber(matched.stockQty)));
    const reqQty = Number(item.requestedQty) || 1;
    const isAvailable = availableQty >= reqQty;

    if (!isAvailable) {
      canPlaceOrder = false;
    }

    return {
      productCode: targetCode,
      availableQty,
      isAvailable,
    };
  });

  return {
    success: true,
    merchantId,
    requestId: body.requestId,
    canPlaceOrder,
    results,
  };
}

export async function processQwicksOrderPlaced(body: any) {
  const orderId = body.orderId || body.requestId || `QW-${Date.now()}`;
  const customerInfo = body.customer || {};
  const customerName = customerInfo.name || "QwicksApp Customer";
  const customerPhone = customerInfo.phone || "";

  // 1. Find or create QwicksApp customer
  let customerId: number | undefined = undefined;
  if (customerPhone) {
    const [existing] = await db
      .select()
      .from(customers)
      .where(eq(customers.phone, customerPhone))
      .limit(1);
    if (existing) {
      customerId = existing.id;
    }
  }

  const items = body.items || [];
  if (!items.length) {
    throw new Error("No items provided in order payload");
  }

  // 2. Fetch active products
  const allProducts = await db
    .select()
    .from(products)
    .where(eq(products.isActive, true));

  const saleLineItems: Array<{
    productId: number;
    qty: number;
    rate: number;
    gstRate: number;
    discountType: "percent" | "value";
    discountValue: number;
  }> = [];

  for (const item of items) {
    const code = (item.productCode || item.productId || item.barcode || "").trim();
    const matched = allProducts.find(
      (p) =>
        (p.sku && p.sku.trim() === code) ||
        (p.barcode && p.barcode.trim() === code) ||
        String(p.id) === code ||
        p.name.trim().toLowerCase() === code.toLowerCase()
    );

    if (!matched) {
      throw new Error(`Product not found for code "${code}"`);
    }

    saleLineItems.push({
      productId: matched.id,
      qty: Number(item.qty) || 1,
      rate: item.unitPrice ? Number(item.unitPrice) : toNumber(matched.saleRate),
      gstRate: toNumber(matched.gstRate),
      discountType: "percent",
      discountValue: 0,
    });
  }

  // 3. Record Sale in Skywin POS DB
  const sale = await createSale({
    billType: "retail",
    customerId,
    customerName: customerName || undefined,
    customerPhone: customerPhone || undefined,
    paymentMode: "upi",
    operatorName: "QwicksApp API",
    notes: `QwicksApp Order #${orderId}`,
    items: saleLineItems,
  });

  return {
    success: true,
    orderId,
    saleId: sale.id,
    message: "Order successfully ingested into Skywin POS",
  };
}

export async function pushInventoryToQwicksApp() {
  const settings = await getSettings();
  const apiKey = settings.qwicksApiKey;
  const merchantId = settings.qwicksMerchantId || "skywin";
  const host = settings.qwicksHost || "qwicks.app";

  if (!apiKey) {
    throw new Error("QwicksApp API Key is not configured in Settings.");
  }

  const payload = await getQwicksInventoryPayload();
  const url = `https://${host}/api/updateInventory/${merchantId}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      replaceExistingImages: false,
      products: payload.products,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`QwicksApp Push failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

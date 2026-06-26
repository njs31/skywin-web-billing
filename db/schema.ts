import {
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const paymentTypeEnum = pgEnum("payment_type", ["credit", "cash"]);
export const paymentModeEnum = pgEnum("payment_mode", ["cash", "upi", "credit"]);
export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "purchase",
  "sale",
  "adjustment",
]);

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  contact: text("contact"),
  totalPurchased: numeric("total_purchased", { precision: 14, scale: 2 })
    .default("0")
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku"),
  unit: text("unit").default("pcs").notNull(),
  purchaseRate: numeric("purchase_rate", { precision: 14, scale: 2 }).notNull(),
  saleRate: numeric("sale_rate", { precision: 14, scale: 2 }).notNull(),
  stockQty: numeric("stock_qty", { precision: 14, scale: 2 })
    .default("0")
    .notNull(),
  hsnCode: text("hsn_code"),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).default("18").notNull(),
  barcode: text("barcode"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id")
    .references(() => suppliers.id)
    .notNull(),
  invoiceNo: text("invoice_no"),
  date: timestamp("date").defaultNow().notNull(),
  paymentType: paymentTypeEnum("payment_type").default("credit").notNull(),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  gstTotal: numeric("gst_total", { precision: 14, scale: 2 }).default("0").notNull(),
  grandTotal: numeric("grand_total", { precision: 14, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const purchaseItems = pgTable("purchase_items", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id")
    .references(() => purchases.id, { onDelete: "cascade" })
    .notNull(),
  productId: integer("product_id")
    .references(() => products.id)
    .notNull(),
  qty: numeric("qty", { precision: 14, scale: 2 }).notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
});

export const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  invoiceNo: text("invoice_no").notNull().unique(),
  date: timestamp("date").defaultNow().notNull(),
  customerName: text("customer_name"),
  paymentMode: paymentModeEnum("payment_mode").default("cash").notNull(),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  cgst: numeric("cgst", { precision: 14, scale: 2 }).default("0").notNull(),
  sgst: numeric("sgst", { precision: 14, scale: 2 }).default("0").notNull(),
  igst: numeric("igst", { precision: 14, scale: 2 }).default("0").notNull(),
  grandTotal: numeric("grand_total", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const saleItems = pgTable("sale_items", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id")
    .references(() => sales.id, { onDelete: "cascade" })
    .notNull(),
  productId: integer("product_id")
    .references(() => products.id)
    .notNull(),
  qty: numeric("qty", { precision: 14, scale: 2 }).notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
});

export const stockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .references(() => products.id)
    .notNull(),
  type: stockMovementTypeEnum("type").notNull(),
  qtyDelta: numeric("qty_delta", { precision: 14, scale: 2 }).notNull(),
  referenceId: integer("reference_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  purchases: many(purchases),
}));

export const productsRelations = relations(products, ({ many }) => ({
  purchaseItems: many(purchaseItems),
  saleItems: many(saleItems),
  stockMovements: many(stockMovements),
}));

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [purchases.supplierId],
    references: [suppliers.id],
  }),
  items: many(purchaseItems),
}));

export const purchaseItemsRelations = relations(purchaseItems, ({ one }) => ({
  purchase: one(purchases, {
    fields: [purchaseItems.purchaseId],
    references: [purchases.id],
  }),
  product: one(products, {
    fields: [purchaseItems.productId],
    references: [products.id],
  }),
}));

export const salesRelations = relations(sales, ({ many }) => ({
  items: many(saleItems),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, {
    fields: [saleItems.saleId],
    references: [sales.id],
  }),
  product: one(products, {
    fields: [saleItems.productId],
    references: [products.id],
  }),
}));

export type Supplier = typeof suppliers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type Sale = typeof sales.$inferSelect;

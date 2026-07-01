import {
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const paymentTypeEnum = pgEnum("payment_type", ["credit", "cash"]);
export const paymentModeEnum = pgEnum("payment_mode", [
  "cash",
  "upi",
  "credit",
  "card",
  "cheque",
]);
export const billTypeEnum = pgEnum("bill_type", ["retail", "wholesale"]);
export const customerTypeEnum = pgEnum("customer_type", [
  "retail",
  "wholesale",
  "farmer",
]);
export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "purchase",
  "sale",
  "adjustment",
  "return",
]);
export const partyPaymentTypeEnum = pgEnum("party_payment_type", [
  "receipt",
  "payment",
]);
export const roleEnum = pgEnum("role", [
  "admin",
  "regional_manager",
  "sales_officer",
  "dealer",
]);

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  contact: text("contact"),
  phone: text("phone"),
  gstin: text("gstin"),
  address: text("address"),
  totalPurchased: numeric("total_purchased", { precision: 14, scale: 2 })
    .default("0")
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  gstin: text("gstin"),
  address: text("address"),
  type: customerTypeEnum("type").default("retail").notNull(),
  creditLimit: numeric("credit_limit", { precision: 14, scale: 2 }).default(
    "0"
  ),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku"),
  barcode: text("barcode"),
  categoryId: integer("category_id").references(() => categories.id),
  unit: text("unit").default("pcs").notNull(),
  purchaseRate: numeric("purchase_rate", { precision: 14, scale: 2 }).notNull(),
  saleRate: numeric("sale_rate", { precision: 14, scale: 2 }).notNull(),
  wholesaleRate: numeric("wholesale_rate", { precision: 14, scale: 2 }),
  mrp: numeric("mrp", { precision: 14, scale: 2 }),
  stockQty: numeric("stock_qty", { precision: 14, scale: 2 })
    .default("0")
    .notNull(),
  reorderLevel: numeric("reorder_level", { precision: 14, scale: 2 }).default(
    "10"
  ),
  hsnCode: text("hsn_code"),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).default("18").notNull(),
  expiryDate: date("expiry_date"),
  isActive: boolean("is_active").default(true).notNull(),
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
  paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).default("0"),
  handlingCharges: numeric("handling_charges", { precision: 14, scale: 2 }).default("0").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const purchaseItems = pgTable("purchase_items", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id")
    .references(() => purchases.id, { onDelete: "cascade" })
    .notNull(),
  productId: integer("product_id")
    .references(() => products.id),
  customName: text("custom_name"),
  qty: numeric("qty", { precision: 14, scale: 2 }).notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
  discountType: text("discount_type").default("percent").notNull(),
  discountValue: numeric("discount_value", { precision: 14, scale: 2 }).default("0").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
});

export const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  invoiceNo: text("invoice_no").notNull().unique(),
  date: timestamp("date").defaultNow().notNull(),
  billType: billTypeEnum("bill_type").default("retail").notNull(),
  customerId: integer("customer_id").references(() => customers.id),
  customerName: text("customer_name"),
  paymentMode: paymentModeEnum("payment_mode").default("cash").notNull(),
  operatorName: text("operator_name"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 14, scale: 2 })
    .default("0")
    .notNull(),
  cgst: numeric("cgst", { precision: 14, scale: 2 }).default("0").notNull(),
  sgst: numeric("sgst", { precision: 14, scale: 2 }).default("0").notNull(),
  igst: numeric("igst", { precision: 14, scale: 2 }).default("0").notNull(),
  grandTotal: numeric("grand_total", { precision: 14, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const saleItems = pgTable("sale_items", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id")
    .references(() => sales.id, { onDelete: "cascade" })
    .notNull(),
  productId: integer("product_id")
    .references(() => products.id),
  customName: text("custom_name"),
  qty: numeric("qty", { precision: 14, scale: 2 }).notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 })
    .default("0")
    .notNull(),
  discountType: text("discount_type").default("percent").notNull(),
  discountValue: numeric("discount_value", { precision: 14, scale: 2 }).default("0").notNull(),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  hsnCode: text("hsn_code"),
});

export const saleReturns = pgTable("sale_returns", {
  id: serial("id").primaryKey(),
  returnNo: text("return_no").notNull().unique(),
  saleId: integer("sale_id").references(() => sales.id),
  customerId: integer("customer_id").references(() => customers.id),
  date: timestamp("date").defaultNow().notNull(),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  cgst: numeric("cgst", { precision: 14, scale: 2 }).default("0").notNull(),
  sgst: numeric("sgst", { precision: 14, scale: 2 }).default("0").notNull(),
  grandTotal: numeric("grand_total", { precision: 14, scale: 2 }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const saleReturnItems = pgTable("sale_return_items", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id")
    .references(() => saleReturns.id, { onDelete: "cascade" })
    .notNull(),
  productId: integer("product_id")
    .references(() => products.id),
  customName: text("custom_name"),
  qty: numeric("qty", { precision: 14, scale: 2 }).notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
});

export const purchaseReturns = pgTable("purchase_returns", {
  id: serial("id").primaryKey(),
  returnNo: text("return_no").notNull().unique(),
  purchaseId: integer("purchase_id").references(() => purchases.id),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  date: timestamp("date").defaultNow().notNull(),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  grandTotal: numeric("grand_total", { precision: 14, scale: 2 }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const purchaseReturnItems = pgTable("purchase_return_items", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id")
    .references(() => purchaseReturns.id, { onDelete: "cascade" })
    .notNull(),
  productId: integer("product_id")
    .references(() => products.id),
  customName: text("custom_name"),
  qty: numeric("qty", { precision: 14, scale: 2 }).notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
});

export const partyPayments = pgTable("party_payments", {
  id: serial("id").primaryKey(),
  type: partyPaymentTypeEnum("type").notNull(),
  customerId: integer("customer_id").references(() => customers.id),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paymentMode: paymentModeEnum("payment_mode").default("cash").notNull(),
  referenceNo: text("reference_no"),
  notes: text("notes"),
  date: timestamp("date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  purchases: many(purchases),
  payments: many(partyPayments),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  sales: many(sales),
  payments: many(partyPayments),
  returns: many(saleReturns),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
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

export const salesRelations = relations(sales, ({ one, many }) => ({
  customer: one(customers, {
    fields: [sales.customerId],
    references: [customers.id],
  }),
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

export const saleReturnsRelations = relations(saleReturns, ({ one, many }) => ({
  sale: one(sales, {
    fields: [saleReturns.saleId],
    references: [sales.id],
  }),
  customer: one(customers, {
    fields: [saleReturns.customerId],
    references: [customers.id],
  }),
  items: many(saleReturnItems),
}));

export const purchaseReturnsRelations = relations(purchaseReturns, ({ one, many }) => ({
  purchase: one(purchases, {
    fields: [purchaseReturns.purchaseId],
    references: [purchases.id],
  }),
  supplier: one(suppliers, {
    fields: [purchaseReturns.supplierId],
    references: [suppliers.id],
  }),
  items: many(purchaseReturnItems),
}));

export const purchaseReturnItemsRelations = relations(purchaseReturnItems, ({ one }) => ({
  return: one(purchaseReturns, {
    fields: [purchaseReturnItems.returnId],
    references: [purchaseReturns.id],
  }),
  product: one(products, {
    fields: [purchaseReturnItems.productId],
    references: [products.id],
  }),
}));

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  role: roleEnum("role").notNull(),
  customerId: integer("customer_id").references(() => customers.id),
  otp: text("otp"),
  otpExpiry: timestamp("otp_expiry"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reportingLines = pgTable("reporting_lines", {
  id: serial("id").primaryKey(),
  managerId: integer("manager_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  officerId: integer("officer_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
});

export const dealerMappings = pgTable("dealer_mappings", {
  id: serial("id").primaryKey(),
  officerId: integer("officer_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  dealerId: integer("dealer_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
});

export type Category = typeof categories.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type SaleReturn = typeof saleReturns.$inferSelect;
export type PartyPayment = typeof partyPayments.$inferSelect;
export type PurchaseReturn = typeof purchaseReturns.$inferSelect;
export type PurchaseReturnItem = typeof purchaseReturnItems.$inferSelect;
export type User = typeof users.$inferSelect;
export type ReportingLine = typeof reportingLines.$inferSelect;
export type DealerMapping = typeof dealerMappings.$inferSelect;

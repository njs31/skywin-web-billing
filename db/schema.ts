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
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

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
  pan: text("pan"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  pinCode: text("pin_code"),
  totalPurchased: numeric("total_purchased", { precision: 14, scale: 2 })
    .default("0")
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone"),
    gstin: text("gstin"),
    address: text("address"),
    membershipNo: text("membership_no"),
    acre: text("acre"),
    crop: text("crop"),
    pinCode: text("pin_code"),
    village: text("village"),
    taluk: text("taluk"),
    district: text("district"),
    type: customerTypeEnum("type").default("retail").notNull(),
    creditLimit: numeric("credit_limit", { precision: 14, scale: 2 }).default(
      "0"
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    gstinUnique: uniqueIndex("customers_gstin_unique").on(table.gstin),
    phoneIdx: index("customers_phone_idx").on(table.phone),
    nameIdx: index("customers_name_idx").on(table.name),
  })
);

export const products = pgTable(
  "products",
  {
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
    discountPercent: numeric("discount_percent", { precision: 5, scale: 2 })
      .default("0")
      .notNull(),
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
  },
  (table) => ({
    // Trigram indexes accelerate the %query% ILIKE searches used by POS.
    nameTrgmIdx: index("products_name_trgm_idx").using(
      "gin",
      table.name.op("gin_trgm_ops")
    ),
    skuTrgmIdx: index("products_sku_trgm_idx").using(
      "gin",
      table.sku.op("gin_trgm_ops")
    ),
    barcodeIdx: index("products_barcode_idx").on(table.barcode),
    skuIdx: index("products_sku_idx").on(table.sku),
  })
);

export const productBatches = pgTable(
  "product_batches",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    batchNumber: text("batch_number").notNull(),
    qty: numeric("qty", { precision: 14, scale: 2 }).default("0").notNull(),
    purchaseRate: numeric("purchase_rate", { precision: 14, scale: 2 }),
    saleRate: numeric("sale_rate", { precision: 14, scale: 2 }),
    expiryDate: date("expiry_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    productBatchUnique: uniqueIndex("product_batches_product_batch_unique").on(
      table.productId,
      table.batchNumber
    ),
    productIdIdx: index("product_batches_product_id_idx").on(table.productId),
    batchNumberTrgmIdx: index("product_batches_batch_number_trgm_idx").using(
      "gin",
      table.batchNumber.op("gin_trgm_ops")
    ),
  })
);

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
  hsnCode: text("hsn_code"),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).default("0").notNull(),
  batchNumber: text("batch_number"),
  expiryDate: date("expiry_date"),
});

export const sales = pgTable(
  "sales",
  {
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
    roundOff: numeric("round_off", { precision: 14, scale: 2 })
      .default("0")
      .notNull(),
    paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).default("0"),
    cashAmount: numeric("cash_amount", { precision: 14, scale: 2 })
      .default("0")
      .notNull(),
    upiAmount: numeric("upi_amount", { precision: 14, scale: 2 })
      .default("0")
      .notNull(),
    poNumber: text("po_number"),
    purchaseOrderId: integer("purchase_order_id"),
    quotationNumber: text("quotation_number"),
    ewayBillNo: text("eway_bill_no"),
    vehicleNo: text("vehicle_no"),
    dispatchedThrough: text("dispatched_through"),
    destination: text("destination"),
    deliveryNote: text("delivery_note"),
    paymentTerms: text("payment_terms"),
    transporterName: text("transporter_name"),
    notes: text("notes"),
    /** External order id for idempotent ingestion (QwicksApp etc.). */
    externalOrderId: text("external_order_id"),
    /** Whether an e-invoice / QR was requested for this bill. */
    eInvoiceRequested: boolean("e_invoice_requested").default(false).notNull(),
    /** "active" | "cancelled" — cancelled bills keep their number. */
    status: text("status").default("active").notNull(),
    cancelledAt: timestamp("cancelled_at"),
    cancelledBy: text("cancelled_by"),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    customerIdIdx: index("sales_customer_id_idx").on(table.customerId),
    dateIdx: index("sales_date_idx").on(table.date),
    statusIdx: index("sales_status_idx").on(table.status),
    externalOrderIdUk: uniqueIndex("sales_external_order_id_uk")
      .on(table.externalOrderId)
      .where(sql`external_order_id is not null`),
    // Supports the prefix LIKE scan used to compute the next invoice number.
    invoiceNoPatternIdx: index("sales_invoice_no_pattern_idx").using(
      "btree",
      table.invoiceNo.op("text_pattern_ops")
    ),
  })
);

export const saleItems = pgTable(
  "sale_items",
  {
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
    batchId: integer("batch_id").references(() => productBatches.id),
    batchNumber: text("batch_number"),
  },
  (table) => ({
    saleIdIdx: index("sale_items_sale_id_idx").on(table.saleId),
    productIdIdx: index("sale_items_product_id_idx").on(table.productId),
  })
);

export const saleReturns = pgTable(
  "sale_returns",
  {
    id: serial("id").primaryKey(),
    returnNo: text("return_no").notNull().unique(),
    saleId: integer("sale_id").references(() => sales.id),
    customerId: integer("customer_id").references(() => customers.id),
    customerGstin: text("customer_gstin"),
    date: timestamp("date").defaultNow().notNull(),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
    cgst: numeric("cgst", { precision: 14, scale: 2 }).default("0").notNull(),
    sgst: numeric("sgst", { precision: 14, scale: 2 }).default("0").notNull(),
    grandTotal: numeric("grand_total", { precision: 14, scale: 2 }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    customerIdIdx: index("sale_returns_customer_id_idx").on(table.customerId),
  })
);

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
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 })
    .default("0")
    .notNull(),
  discountType: text("discount_type").default("percent").notNull(),
  discountValue: numeric("discount_value", { precision: 14, scale: 2 })
    .default("0")
    .notNull(),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  hsnCode: text("hsn_code"),
});

export const purchaseReturns = pgTable("purchase_returns", {
  id: serial("id").primaryKey(),
  returnNo: text("return_no").notNull().unique(),
  purchaseId: integer("purchase_id").references(() => purchases.id),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  date: timestamp("date").defaultNow().notNull(),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  cgst: numeric("cgst", { precision: 14, scale: 2 }).default("0").notNull(),
  sgst: numeric("sgst", { precision: 14, scale: 2 }).default("0").notNull(),
  igst: numeric("igst", { precision: 14, scale: 2 }).default("0").notNull(),
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
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).default("0").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  hsnCode: text("hsn_code"),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  poNumber: text("po_number").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  supplierName: text("supplier_name"),
  date: timestamp("date").defaultNow().notNull(),
  notes: text("notes"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).default("0").notNull(),
  grandTotal: numeric("grand_total", { precision: 14, scale: 2 }).default("0").notNull(),
  status: text("status").default("open").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id")
    .references(() => purchaseOrders.id, { onDelete: "cascade" })
    .notNull(),
  productId: integer("product_id").references(() => products.id),
  customName: text("custom_name"),
  qty: numeric("qty", { precision: 14, scale: 2 }).notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).default("0").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  hsnCode: text("hsn_code"),
});

export const quotations = pgTable("quotations", {
  id: serial("id").primaryKey(),
  quotationNo: text("quotation_no").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  date: timestamp("date").defaultNow().notNull(),
  paymentTerms: text("payment_terms"),
  dispatchedThrough: text("dispatched_through"),
  destination: text("destination"),
  notes: text("notes"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).default("0").notNull(),
  cgst: numeric("cgst", { precision: 14, scale: 2 }).default("0").notNull(),
  sgst: numeric("sgst", { precision: 14, scale: 2 }).default("0").notNull(),
  igst: numeric("igst", { precision: 14, scale: 2 }).default("0").notNull(),
  roundOff: numeric("round_off", { precision: 14, scale: 2 }).default("0").notNull(),
  grandTotal: numeric("grand_total", { precision: 14, scale: 2 }).default("0").notNull(),
  status: text("status").default("open").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const quotationItems = pgTable("quotation_items", {
  id: serial("id").primaryKey(),
  quotationId: integer("quotation_id")
    .references(() => quotations.id, { onDelete: "cascade" })
    .notNull(),
  productId: integer("product_id").references(() => products.id),
  customName: text("custom_name"),
  qty: numeric("qty", { precision: 14, scale: 2 }).notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).default("0").notNull(),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 })
    .default("0")
    .notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  hsnCode: text("hsn_code"),
});

export const partyPayments = pgTable(
  "party_payments",
  {
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
  },
  (table) => ({
    customerIdIdx: index("party_payments_customer_id_idx").on(table.customerId),
  })
);

export const partyPaymentAllocations = pgTable(
  "party_payment_allocations",
  {
    id: serial("id").primaryKey(),
    paymentId: integer("payment_id")
      .references(() => partyPayments.id, { onDelete: "cascade" })
      .notNull(),
    saleId: integer("sale_id").references(() => sales.id),
    purchaseId: integer("purchase_id").references(() => purchases.id),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    paymentIdIdx: index("party_payment_allocations_payment_id_idx").on(
      table.paymentId
    ),
    saleIdIdx: index("party_payment_allocations_sale_id_idx").on(table.saleId),
    purchaseIdIdx: index("party_payment_allocations_purchase_id_idx").on(
      table.purchaseId
    ),
  })
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .references(() => products.id)
      .notNull(),
    batchId: integer("batch_id").references(() => productBatches.id),
    batchNumber: text("batch_number"),
    type: stockMovementTypeEnum("type").notNull(),
    qtyDelta: numeric("qty_delta", { precision: 14, scale: 2 }).notNull(),
    referenceId: integer("reference_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    productIdIdx: index("stock_movements_product_id_idx").on(table.productId),
  })
);

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
  batches: many(productBatches),
  purchaseItems: many(purchaseItems),
  saleItems: many(saleItems),
  stockMovements: many(stockMovements),
}));

export const productBatchesRelations = relations(productBatches, ({ one }) => ({
  product: one(products, {
    fields: [productBatches.productId],
    references: [products.id],
  }),
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
export type ProductBatch = typeof productBatches.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type SaleReturn = typeof saleReturns.$inferSelect;
export type PartyPayment = typeof partyPayments.$inferSelect;
export type PurchaseReturn = typeof purchaseReturns.$inferSelect;
export type PurchaseReturnItem = typeof purchaseReturnItems.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type User = typeof users.$inferSelect;
export type ReportingLine = typeof reportingLines.$inferSelect;
export type DealerMapping = typeof dealerMappings.$inferSelect;

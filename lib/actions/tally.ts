"use server";

import { db } from "@/db";
import {
  sales,
  saleItems,
  products,
  categories,
  customers,
  purchases,
  purchaseItems,
  suppliers,
  saleReturns,
  saleReturnItems,
  purchaseReturns,
  purchaseReturnItems,
  partyPayments,
} from "@/db/schema";
import { and, gte, lte, eq, sql } from "drizzle-orm";
import { format } from "date-fns";

export async function getTallyExportData(startDateStr: string, endDateStr: string) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  end.setHours(23, 59, 59, 999); // Include the entire end date

  // 1. Fetch Sales Items
  const dbSales = await db
    .select({
      date: sales.date,
      invoiceNo: sales.invoiceNo,
      customerName: sales.customerName,
      customerRecordName: customers.name,
      productName: products.name,
      customName: saleItems.customName,
      sku: products.sku,
      hsnCode: sql<string>`coalesce(${saleItems.hsnCode}, ${products.hsnCode})`,
      categoryName: categories.name,
      notes: sales.notes,
      qty: saleItems.qty,
      unit: products.unit,
      rate: saleItems.rate,
      gstRate: saleItems.gstRate,
      amount: saleItems.amount,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .leftJoin(products, eq(saleItems.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .where(and(gte(sales.date, start), lte(sales.date, end)));

  const salesRows = dbSales.map((s) => {
    const qty = parseFloat(s.qty);
    const rate = parseFloat(s.rate);
    const amount = parseFloat(s.amount);
    const gstRate = parseFloat(s.gstRate);
    const tax = Math.round((amount * gstRate) / 100 * 100) / 100;
    return {
      "Date": format(new Date(s.date), "dd/MM/yyyy"),
      "Invoice No./Txn No.": s.invoiceNo,
      "Party Name": s.customerRecordName ?? s.customerName ?? "Walk-in",
      "Item Name": s.productName ?? s.customName ?? "Custom Item",
      "Item Code": s.sku ?? "",
      "HSN/SAC": s.hsnCode ?? "",
      "LOCATION": "",
      "Category": s.categoryName ?? "General",
      "Description": s.notes ?? "",
      "Challan/Order No.": "",
      "Quantity": qty,
      "Unit": s.unit ?? "pcs",
      "UnitPrice": rate,
      "Tax Percent": gstRate,
      "Tax": tax,
    };
  });

  // 2. Fetch Purchase Items
  const dbPurchases = await db
    .select({
      date: purchases.date,
      invoiceNo: purchases.invoiceNo,
      supplierName: suppliers.name,
      productName: products.name,
      customName: purchaseItems.customName,
      sku: products.sku,
      hsnCode: products.hsnCode,
      categoryName: categories.name,
      notes: purchases.notes,
      qty: purchaseItems.qty,
      unit: products.unit,
      rate: purchaseItems.rate,
      amount: purchaseItems.amount,
      gstRate: products.gstRate,
    })
    .from(purchaseItems)
    .innerJoin(purchases, eq(purchaseItems.purchaseId, purchases.id))
    .leftJoin(products, eq(purchaseItems.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .where(and(gte(purchases.date, start), lte(purchases.date, end)));

  const purchaseRows = dbPurchases.map((p) => {
    const qty = parseFloat(p.qty);
    const rate = parseFloat(p.rate);
    const amount = parseFloat(p.amount);
    const gstRate = p.gstRate ? parseFloat(p.gstRate) : 18;
    const tax = Math.round((amount * gstRate) / 100 * 100) / 100;
    return {
      "Date": format(new Date(p.date), "dd/MM/yyyy"),
      "Invoice No./Txn No.": p.invoiceNo ?? "",
      "Party Name": p.supplierName,
      "Item Name": p.productName ?? p.customName ?? "Custom Item",
      "Item Code": p.sku ?? "",
      "HSN/SAC": p.hsnCode ?? "",
      "LOCATION": "",
      "Category": p.categoryName ?? "General",
      "Description": p.notes ?? "",
      "Challan/Order No.": "",
      "Quantity": qty,
      "Unit": p.unit ?? "pcs",
      "UnitPrice": rate,
      "Tax Percent": gstRate,
      "Tax": tax,
    };
  });

  // 3. Fetch Credit Notes (Sales Returns)
  const dbCreditNotes = await db
    .select({
      date: saleReturns.date,
      returnNo: saleReturns.returnNo,
      customerName: customers.name,
      productName: products.name,
      customName: saleReturnItems.customName,
      sku: products.sku,
      hsnCode: products.hsnCode,
      categoryName: categories.name,
      reason: saleReturns.reason,
      qty: saleReturnItems.qty,
      unit: products.unit,
      rate: saleReturnItems.rate,
      gstRate: saleReturnItems.gstRate,
      amount: saleReturnItems.amount,
    })
    .from(saleReturnItems)
    .innerJoin(saleReturns, eq(saleReturnItems.returnId, saleReturns.id))
    .leftJoin(products, eq(saleReturnItems.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(customers, eq(saleReturns.customerId, customers.id))
    .where(and(gte(saleReturns.date, start), lte(saleReturns.date, end)));

  const creditNoteRows = dbCreditNotes.map((c) => {
    const qty = parseFloat(c.qty);
    const rate = parseFloat(c.rate);
    const amount = parseFloat(c.amount);
    const gstRate = parseFloat(c.gstRate);
    const tax = Math.round((amount * gstRate) / 100 * 100) / 100;
    return {
      "Date": format(new Date(c.date), "dd/MM/yyyy"),
      "Invoice No./Txn No.": c.returnNo,
      "Party Name": c.customerName ?? "Walk-in",
      "Item Name": c.productName ?? c.customName ?? "Custom Item",
      "Item Code": c.sku ?? "",
      "HSN/SAC": c.hsnCode ?? "",
      "LOCATION": "",
      "Category": c.categoryName ?? "General",
      "Description": c.reason ?? "",
      "Challan/Order No.": "",
      "Quantity": qty,
      "Unit": c.unit ?? "pcs",
      "UnitPrice": rate,
      "Tax Percent": gstRate,
      "Tax": tax,
    };
  });

  // 4. Fetch Debit Notes (Purchase Returns)
  const dbDebitNotes = await db
    .select({
      date: purchaseReturns.date,
      returnNo: purchaseReturns.returnNo,
      supplierName: suppliers.name,
      productName: products.name,
      customName: purchaseReturnItems.customName,
      sku: products.sku,
      hsnCode: products.hsnCode,
      categoryName: categories.name,
      reason: purchaseReturns.reason,
      qty: purchaseReturnItems.qty,
      unit: products.unit,
      rate: purchaseReturnItems.rate,
      amount: purchaseReturnItems.amount,
      gstRate: products.gstRate,
    })
    .from(purchaseReturnItems)
    .innerJoin(purchaseReturns, eq(purchaseReturnItems.returnId, purchaseReturns.id))
    .leftJoin(products, eq(purchaseReturnItems.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .innerJoin(suppliers, eq(purchaseReturns.supplierId, suppliers.id))
    .where(and(gte(purchaseReturns.date, start), lte(purchaseReturns.date, end)));

  const debitNoteRows = dbDebitNotes.map((d) => {
    const qty = parseFloat(d.qty);
    const rate = parseFloat(d.rate);
    const amount = parseFloat(d.amount);
    const gstRate = d.gstRate ? parseFloat(d.gstRate) : 18;
    const tax = Math.round((amount * gstRate) / 100 * 100) / 100;
    return {
      "Date": format(new Date(d.date), "dd/MM/yyyy"),
      "Invoice No./Txn No.": d.returnNo,
      "Party Name": d.supplierName,
      "Item Name": d.productName ?? d.customName ?? "Custom Item",
      "Item Code": d.sku ?? "",
      "HSN/SAC": d.hsnCode ?? "",
      "LOCATION": "",
      "Category": d.categoryName ?? "General",
      "Description": d.reason ?? "",
      "Challan/Order No.": "",
      "Quantity": qty,
      "Unit": d.unit ?? "pcs",
      "UnitPrice": rate,
      "Tax Percent": gstRate,
      "Tax": tax,
    };
  });

  // 5. Fetch Receipts (Customer payments)
  const dbReceipts = await db
    .select({
      date: partyPayments.date,
      id: partyPayments.id,
      customerName: customers.name,
      amount: partyPayments.amount,
      paymentMode: partyPayments.paymentMode,
      referenceNo: partyPayments.referenceNo,
      notes: partyPayments.notes,
    })
    .from(partyPayments)
    .innerJoin(customers, eq(partyPayments.customerId, customers.id))
    .where(
      and(
        eq(partyPayments.type, "receipt"),
        gte(partyPayments.date, start),
        lte(partyPayments.date, end)
      )
    );

  const receiptRows = dbReceipts.map((r) => {
    const total = parseFloat(r.amount);
    return {
      "Date": format(new Date(r.date), "dd/MM/yyyy"),
      "Reference No": r.referenceNo || `RCP-${r.id}`,
      "Party Name": r.customerName,
      "Category Name": "",
      "Type": "receipt",
      "Total": total,
      "Payment Type": r.paymentMode,
      "Paid": "",
      "Received": total,
      "Balance": "",
      "Due Date": "",
      "Status": "Used",
      "Description": r.notes ?? "",
    };
  });

  // 6. Fetch Payments (Supplier payments)
  const dbPayments = await db
    .select({
      date: partyPayments.date,
      id: partyPayments.id,
      supplierName: suppliers.name,
      amount: partyPayments.amount,
      paymentMode: partyPayments.paymentMode,
      referenceNo: partyPayments.referenceNo,
      notes: partyPayments.notes,
    })
    .from(partyPayments)
    .innerJoin(suppliers, eq(partyPayments.supplierId, suppliers.id))
    .where(
      and(
        eq(partyPayments.type, "payment"),
        gte(partyPayments.date, start),
        lte(partyPayments.date, end)
      )
    );

  const paymentRows = dbPayments.map((p) => {
    const total = parseFloat(p.amount);
    return {
      "Date": format(new Date(p.date), "dd/MM/yyyy"),
      "Reference No": p.referenceNo || `PAY-${p.id}`,
      "Party Name": p.supplierName,
      "Category Name": "",
      "Type": "Payment",
      "Total": total,
      "Payment Type": p.paymentMode,
      "Paid": total,
      "Received": "",
      "Balance": "",
      "Due Date": "",
      "Status": "Used",
      "Description": p.notes ?? "",
    };
  });

  return {
    sales: salesRows,
    purchase: purchaseRows,
    "credit note": creditNoteRows,
    "debit note": debitNoteRows,
    receipt: receiptRows,
    payment: paymentRows,
  };
}

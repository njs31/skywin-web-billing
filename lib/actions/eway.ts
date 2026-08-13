"use server";

import { db } from "@/db";
import { sales, saleItems, products, customers } from "@/db/schema";
import { isInterstateGst } from "@/lib/gst";
import { getSettings } from "@/lib/settings";
import { and, gte, lte, eq, sql, isNotNull, ne } from "drizzle-orm";
import { format } from "date-fns";

const GST_STATE_NAMES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

function placeOfSupplyFromGstin(
  gstin: string | null | undefined,
  fallbackState: string,
  fallbackCode: string
) {
  const code = gstin?.trim().slice(0, 2) || fallbackCode;
  const name = GST_STATE_NAMES[code] || fallbackState;
  return `${name} (${code})`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function getEwayExportData(startDateStr: string, endDateStr: string) {
  const settings = await getSettings();
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  end.setHours(23, 59, 59, 999);

  const rows = await db
    .select({
      date: sales.date,
      invoiceNo: sales.invoiceNo,
      customerName: sales.customerName,
      customerRecordName: customers.name,
      customerGstin: customers.gstin,
      productName: products.name,
      customName: saleItems.customName,
      hsnCode: sql<string>`coalesce(${saleItems.hsnCode}, ${products.hsnCode})`,
      qty: saleItems.qty,
      unit: products.unit,
      gstRate: saleItems.gstRate,
      amount: saleItems.amount,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .leftJoin(products, eq(saleItems.productId, products.id))
    .where(
      and(
        gte(sales.date, start),
        lte(sales.date, end),
        isNotNull(customers.gstin),
        ne(customers.gstin, "")
      )
    );

  return rows.map((row) => {
    const taxable = parseFloat(row.amount);
    const gstRate = parseFloat(row.gstRate);
    const tax = round2((taxable * gstRate) / 100);
    const interstate = isInterstateGst(row.customerGstin, settings.stateCode);
    const halfRate = round2(gstRate / 2);
    const halfTax = round2(tax / 2);

    const cgstRate = interstate ? 0 : halfRate;
    const sgstRate = interstate ? 0 : halfRate;
    const igstRate = interstate ? gstRate : 0;
    const cgstAmount = interstate ? 0 : halfTax;
    const sgstAmount = interstate ? 0 : round2(tax - halfTax);
    const igstAmount = interstate ? tax : 0;

    return {
      "Invoice Date": format(new Date(row.date), "dd/MM/yyyy"),
      "Invoice No": row.invoiceNo,
      "Customer Name": row.customerRecordName ?? row.customerName ?? "",
      "Customer GSTIN": row.customerGstin ?? "",
      "Place of Supply": placeOfSupplyFromGstin(
        row.customerGstin,
        settings.state,
        settings.stateCode
      ),
      HSN: row.hsnCode ?? "",
      "Product Name": row.productName ?? row.customName ?? "Item",
      Qty: parseFloat(row.qty),
      Unit: row.unit ?? "pcs",
      "Taxable Value": taxable,
      "CGST Rate": cgstRate,
      "CGST Amount": cgstAmount,
      "SGST Rate": sgstRate,
      "SGST Amount": sgstAmount,
      "IGST Rate": igstRate,
      "IGST Amount": igstAmount,
      "Total Amount": round2(taxable + tax),
      "Transport Mode": "",
      "Vehicle No": "",
      Distance: "",
    };
  });
}

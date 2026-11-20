import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { buildSalesTallyRow, isTallyCreditSale, withSoNameColumn } from "./tally-sales-sheet";

function columnIndex(letter: string) {
  let n = 0;
  for (const ch of letter) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const sample = buildSalesTallyRow({
  date: "03/10/2026",
  invoiceNo: "INV-20261001-1378",
  partyName: "MR.AJAY",
  paymentMode: "upi",
  itemName: "HCBA001-2 COUNCIL ACTIVE 60 GM",
  itemCode: "10000184",
  hsn: "38089290",
  category: "General",
  description: "",
  challan: "",
  quantity: 3,
  unit: "GM",
  unitPrice: 805.06,
  taxPercent: 18,
  taxabilityType: "Taxable",
  tax: 391.26,
  amount: 2564.92,
  cgst: 195.63,
  taxableAmount: 2173.66,
  sgst: 195.63,
  netAmount: 2564.92,
  salesLedger: "sales 18%",
  gstNo: "",
  gstType: "Unregistered/Consumer",
  state: "Tamil Nadu",
  billedTo: "SIVAPURAM",
});

test("sales sheet column P is Taxability type and column U is the taxable amount", () => {
  const sheet = XLSX.utils.json_to_sheet([sample]);
  assert.equal(sheet.P1.v, "Taxability type");
  assert.equal(sheet.U1.v, "taxable amount");
  assert.equal(sheet.P2.v, "Taxable");
  assert.equal(sheet.U2.v, 2173.66);
  assert.equal(sheet.T2.v, 195.63);
  assert.equal(sheet.V2.v, 195.63);

  const headers = Object.keys(sample);
  assert.equal(headers[columnIndex("P")], "Taxability type");
  assert.equal(headers[columnIndex("Q")], "Tax");
  assert.equal(headers[columnIndex("T")], "cgst");
  assert.equal(headers[columnIndex("U")], "taxable amount");
  assert.equal(headers[columnIndex("V")], "sgst");
  assert.equal(headers[columnIndex("W")], "net amount");
  assert.equal(headers[columnIndex("Z")], "Gst type");
});

test("credit sheet takes credit bills and GSTIN bills; the rest go to Cash Sales", () => {
  assert.equal(isTallyCreditSale("credit", null), true);
  assert.equal(isTallyCreditSale("upi", "33CWDPA5565P1Z9"), true);
  assert.equal(isTallyCreditSale("cash", null), false);
  assert.equal(isTallyCreditSale("upi", ""), false);
  assert.equal(isTallyCreditSale("card", "URP"), false);
});

test("sales sheet: SO Name in column Z and Gst type shifted to AA", () => {
  const row = withSoNameColumn(sample, "KANNAN");
  const sheet = XLSX.utils.json_to_sheet([row]);
  assert.equal(sheet.Y1.v, "GST NO.");
  assert.equal(sheet.Z1.v, "SO");
  assert.equal(sheet.Z2.v, "KANNAN");
  assert.equal(sheet.AA1.v, "Gst type");
  assert.equal(sheet.AB1.v, "STATE");
  assert.equal(sheet.AE1.v, "SHIPPED TO ADDRESS");
  // Columns before Z are unchanged.
  assert.equal(sheet.U1.v, "taxable amount");
  // The plain row (Cash Sales sheet) keeps Gst type in Z.
  assert.equal(Object.keys(sample)[columnIndex("Z")], "Gst type");
});

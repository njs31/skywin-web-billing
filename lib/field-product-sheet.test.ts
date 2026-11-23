import { test } from "node:test";
import assert from "node:assert/strict";
import { missingForNewProduct, normalizeSheetRows, readSheetRow, sheetColumnFor } from "./field-product-sheet";

test("headers are matched in any spelling", () => {
  assert.equal(sheetColumnFor("Product ID"), "Product ID");
  assert.equal(sheetColumnFor("product_id"), "Product ID");
  assert.equal(sheetColumnFor(" GST % "), "GST %");
  assert.equal(sheetColumnFor("Selling Price"), "Sale rate");
  assert.equal(sheetColumnFor("In App"), "In app");
  assert.equal(sheetColumnFor("Unknown column"), null);
});

test("empty rows and empty cells are dropped", () => {
  const rows = normalizeSheetRows([
    { Name: "  ", SKU: null },
    { name: "Urea 1 KG", "Sale Rate": 120, Extra: "x", HSN: "" },
  ]);
  assert.deepEqual(rows, [{ Name: "Urea 1 KG", "Sale rate": 120 }]);
});

test("numbers accept rupee signs, commas and percent", () => {
  const { values, errors } = readSheetRow({ MRP: "₹1,250.50", "Sale rate": "1,100", "GST %": "18%", Stock: 12.5 });
  assert.deepEqual(errors, []);
  assert.equal(values.mrp, 1250.5);
  assert.equal(values.saleRate, 1100);
  assert.equal(values.gstRate, 18);
  assert.equal(values.stock, 12.5);
});

test("bad values are reported per row", () => {
  const { errors } = readSheetRow({ "GST %": 7, Stock: -1, "Sale rate": "abc", HSN: "12", "In app": "maybe", "Min order qty": 10, "Max order qty": 2 });
  assert.ok(errors.some((e) => e.startsWith("GST % must be one of")));
  assert.ok(errors.includes("Stock cannot be negative"));
  assert.ok(errors.some((e) => e.includes("is not a number")));
  assert.ok(errors.includes("HSN must be 4 to 8 digits"));
  assert.ok(errors.some((e) => e.startsWith("In app must be On or Off")));
  assert.ok(errors.includes("Min order qty is more than Max order qty"));
});

test("In app reads On/Off, Yes/No and 1/0", () => {
  for (const v of ["On", "yes", "1", true, "SHOW"]) assert.equal(readSheetRow({ "In app": v }).values.appVisible, true);
  for (const v of ["Off", "no", "0", false, "hidden"]) assert.equal(readSheetRow({ "In app": v }).values.appVisible, false);
  assert.equal(readSheetRow({}).values.appVisible, null);
});

test("codes keep their digits; Excel's 1.2E+12 is refused", () => {
  assert.equal(readSheetRow({ SKU: 10000925 }).values.sku, "10000925");
  assert.equal(readSheetRow({ HSN: 38089199 }).values.hsnCode, "38089199");
  assert.ok(readSheetRow({ Barcode: "8.90123E+12" }).errors[0].includes("lost digits"));
  assert.ok(readSheetRow({ Barcode: 8901234567890123456 }).errors[0].includes("lost digits"));
});

test("stock allows two decimals only", () => {
  assert.deepEqual(readSheetRow({ Stock: 1.1 }).errors, []);
  assert.deepEqual(readSheetRow({ Stock: 0.07 }).errors, []);
  assert.ok(readSheetRow({ Stock: 1.005 }).errors.includes("Stock can have at most 2 decimals"));
});

test("a new product needs name, sale rate, GST and HSN", () => {
  assert.deepEqual(missingForNewProduct(readSheetRow({ Name: "X" }).values), ["Sale rate", "GST %", "HSN"]);
  assert.deepEqual(missingForNewProduct(readSheetRow({ Name: "X", "Sale rate": 0, "GST %": 0, HSN: "1006" }).values), []);
});

test("a subcategory needs its category", () => {
  assert.ok(readSheetRow({ Subcategory: "BAYER" }).errors.includes("Give the Category for that Subcategory"));
});

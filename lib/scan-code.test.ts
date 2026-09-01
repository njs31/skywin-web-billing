import test from "node:test";
import assert from "node:assert/strict";
import { MAX_PRODUCT_ID, parseScanCode } from "./scan-code";
import { productCode as serverProductCode } from "./label-svg";
import { productCode as clientProductCode } from "./label-render";

const product = (
  over: Partial<{ id: number; sku: string | null; barcode: string | null }> = {}
) => ({ id: 123, sku: null, barcode: null, ...over });

test("parseScanCode", async (t) => {
  await t.test("reads the SW code our labels print", () => {
    assert.deepEqual(parseScanCode("SW000123"), { text: "SW000123", id: 123 });
    assert.deepEqual(parseScanCode("SW-123"), { text: "SW-123", id: 123 });
    assert.equal(parseScanCode("sw000123").id, 123);
  });

  await t.test("accepts a bare number typed by hand", () => {
    assert.equal(parseScanCode("123").id, 123);
  });

  await t.test("refuses an id larger than a Postgres int4", () => {
    // The regression this exists for: a 13-digit EAN is a plain number, and
    // asking the database to compare it against a serial column raises
    // "value out of range for type integer". The scan then did nothing at
    // all, because the thrown error never reached the UI.
    assert.equal(parseScanCode("8901234567890").id, null);
    assert.equal(parseScanCode(String(MAX_PRODUCT_ID)).id, MAX_PRODUCT_ID);
    assert.equal(parseScanCode(String(MAX_PRODUCT_ID + 1)).id, null);
  });

  await t.test("still carries the text so barcode and SKU can match", () => {
    assert.equal(parseScanCode("8901234567890").text, "8901234567890");
    assert.equal(parseScanCode("  SKW-ABCDEF  ").text, "SKW-ABCDEF");
  });

  await t.test("treats a non-numeric code as text only", () => {
    assert.equal(parseScanCode("SKW-ABCDEF").id, null);
    assert.equal(parseScanCode("SW12A").id, null);
  });

  await t.test("survives an empty scan", () => {
    assert.deepEqual(parseScanCode("   "), { text: "", id: null });
  });

  await t.test("rejects zero, which no serial ever is", () => {
    assert.equal(parseScanCode("0").id, null);
  });
});

test("what the label prints is what the scanner can resolve", async (t) => {
  await t.test("a product with a barcode resolves by its barcode", () => {
    const p = product({ barcode: "8901234567890", sku: "SW000123" });
    const printed = serverProductCode(p);
    assert.equal(printed, "8901234567890");
    const scanned = parseScanCode(printed);
    // Matched on text against products.barcode, never as an id — which is
    // what used to throw.
    assert.equal(scanned.text, p.barcode);
    assert.equal(scanned.id, null);
  });

  await t.test("a product with only a SKU resolves by its SKU", () => {
    const p = product({ sku: "SKW-ABCDEF" });
    assert.equal(serverProductCode(p), "SKW-ABCDEF");
    assert.equal(parseScanCode(serverProductCode(p)).text, p.sku);
  });

  await t.test("a product with neither resolves by id", () => {
    const p = product({ id: 8 });
    assert.equal(serverProductCode(p), "SW000008");
    assert.equal(parseScanCode(serverProductCode(p)).id, 8);
  });

  await t.test("both renderers print the same code", () => {
    // The browser prints from a canvas and the server from an SVG, each with
    // its own productCode. If they drift, a label printed from the phone
    // scans differently from one printed in the shop.
    for (const p of [
      product({ barcode: "8901234567890", sku: "X" }),
      product({ sku: "SKW-ABCDEF" }),
      product({ id: 8 }),
      product({ barcode: "  ", sku: "  " }),
    ]) {
      assert.equal(
        serverProductCode(p),
        clientProductCode({
          ...p,
          name: "N",
          saleRate: "1",
          gstRate: "0",
          expiryDate: null,
        }),
        `renderers disagree for ${JSON.stringify(p)}`
      );
    }
  });
});

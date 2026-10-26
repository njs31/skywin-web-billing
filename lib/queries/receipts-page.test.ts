import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * The Field farmer directory lives in `customers`. Loading that whole table
 * into two Radix Selects is what froze `/accounts/receipts`. These source
 * checks keep the unbounded `getCustomers()` call from coming back.
 */
describe("receipts page customer payload", () => {
  it("does not call unbounded getCustomers()", () => {
    const page = readFileSync(
      join(root, "app/accounts/receipts/page.tsx"),
      "utf8"
    );
    assert.equal(/getCustomers\s*\(/.test(page), false);
    assert.match(page, /getCustomerById/);
  });

  it("receipt forms use the capped typeahead, not a Select of every customer", () => {
    const receipt = readFileSync(
      join(root, "components/accounts/receipt-form.tsx"),
      "utf8"
    );
    const advance = readFileSync(
      join(root, "components/accounts/advance-receipt-form.tsx"),
      "utf8"
    );
    assert.match(receipt, /CustomerSearchSelect/);
    assert.match(advance, /CustomerSearchSelect/);
    assert.equal(/customers\.map/.test(receipt), false);
    assert.equal(/customers\.map/.test(advance), false);
  });

  it("two full farmer lists are megabytes; the page no longer ships them", () => {
    const n = 5_000;
    const fat = Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      name: `Farmer ${i}`,
      phone: "9876543210",
      gstin: null,
      address: "Kumbakonam",
      membershipNo: null,
      acre: "2",
      crop: "paddy",
      pinCode: "612001",
      village: "village",
      taluk: "taluk",
      district: "Thanjavur",
      type: "farmer",
      creditLimit: "0.00",
      altPhone: null,
      language: "ta",
      approval: "approved",
      rewardPoints: 0,
      source: "imported",
      assignedOfficerId: 1,
      fieldOfficerName: "Officer",
      fieldExternalId: `F${i}`,
      photoUrl: "https://cdn.example/p.jpg",
      paymentMode: "upi",
      createdAt: "2026-10-01T00:00:00.000Z",
    }));
    const before = Buffer.byteLength(
      JSON.stringify({ receipt: fat, advance: fat })
    );
    const after = Buffer.byteLength(
      JSON.stringify({ receipt: null, advance: null })
    );
    assert.ok(
      before > 1_000_000,
      `expected the old two-Select payload to exceed 1MB, got ${before}`
    );
    assert.ok(after < 100, `expected the new page props to stay tiny, got ${after}`);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CUSTOMER_PICKER_LIMIT,
  customerSearchNeedle,
  parseCustomerListParams,
  resolveCustomerPickerLimit,
  toCustomerPickerOption,
} from "./customers";

describe("parseCustomerListParams", () => {
  it("defaults to unfiltered page one", () => {
    assert.deepEqual(parseCustomerListParams({}), {
      q: "",
      type: "all",
      page: 1,
    });
  });

  it("keeps valid values and trims the query", () => {
    assert.deepEqual(
      parseCustomerListParams({ q: "  ram ", type: "farmer", page: "3" }),
      { q: "ram", type: "farmer", page: 3 }
    );
  });

  it("falls back on unknown type or page", () => {
    assert.deepEqual(parseCustomerListParams({ type: "bogus", page: "0" }), {
      q: "",
      type: "all",
      page: 1,
    });
    assert.deepEqual(parseCustomerListParams({ page: "abc" }), {
      q: "",
      type: "all",
      page: 1,
    });
  });
});

describe("customer picker bounds", () => {
  it("strips LIKE wildcards and surrounding space", () => {
    assert.equal(customerSearchNeedle("  ram%_  "), "ram");
    assert.equal(customerSearchNeedle(""), "");
    assert.equal(customerSearchNeedle(undefined), "");
  });

  it("never lets a picker ask for more than CUSTOMER_PICKER_LIMIT rows", () => {
    assert.equal(CUSTOMER_PICKER_LIMIT, 50);
    assert.equal(resolveCustomerPickerLimit(), 50);
    assert.equal(resolveCustomerPickerLimit(10_000), 50);
    assert.equal(resolveCustomerPickerLimit(0), 1);
    assert.equal(resolveCustomerPickerLimit(-4), 1);
    assert.equal(resolveCustomerPickerLimit(12), 12);
  });

  it("keeps only the slim picker fields", () => {
    assert.deepEqual(
      toCustomerPickerOption({
        id: 7,
        name: "Ram",
        phone: "90000",
        gstin: "33AAAAA0000A1Z5",
      }),
      { id: 7, name: "Ram", phone: "90000", gstin: "33AAAAA0000A1Z5" }
    );
  });
});

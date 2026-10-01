import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCustomerListParams } from "./customers";

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

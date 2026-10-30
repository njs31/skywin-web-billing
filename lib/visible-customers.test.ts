import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getVisibleCustomerIds } from "./actions/auth";

describe("store-wide roles are not scoped to an empty customer list", () => {
  for (const role of ["admin", "cashier", "store_manager", "manager"]) {
    it(role, async () => {
      assert.equal(await getVisibleCustomerIds({ id: 1, role, customerId: null }), null);
    });
  }
  it("dealer still sees only its own customer", async () => {
    assert.deepEqual(await getVisibleCustomerIds({ id: 1, role: "dealer", customerId: 7 }), [7]);
  });
});

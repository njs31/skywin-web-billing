import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SEED_ADMIN_PHONE,
  roleLabel,
  validateRoleChange,
} from "./user-roles";

describe("validateRoleChange", () => {
  it("blocks the seed administrator", () => {
    assert.equal(
      validateRoleChange({
        targetPhone: SEED_ADMIN_PHONE,
        currentRole: "admin",
        newRole: "dealer",
        customerId: 1,
        adminCount: 2,
      }),
      "The primary administrator account cannot be changed."
    );
  });

  it("requires a customer when promoting or demoting to dealer", () => {
    assert.match(
      validateRoleChange({
        targetPhone: "9876543210",
        currentRole: "sales_officer",
        newRole: "dealer",
        customerId: null,
        adminCount: 1,
      }) ?? "",
      /mapped to a customer/
    );
  });

  it("allows promoting a dealer to admin", () => {
    assert.equal(
      validateRoleChange({
        targetPhone: "9876543210",
        currentRole: "dealer",
        newRole: "admin",
        adminCount: 1,
      }),
      null
    );
  });

  it("blocks demoting the last admin", () => {
    assert.match(
      validateRoleChange({
        targetPhone: "9876543210",
        currentRole: "admin",
        newRole: "sales_officer",
        adminCount: 1,
      }) ?? "",
      /last administrator/
    );
  });

  it("allows demoting an admin when another remains", () => {
    assert.equal(
      validateRoleChange({
        targetPhone: "9876543210",
        currentRole: "admin",
        newRole: "regional_manager",
        adminCount: 2,
      }),
      null
    );
  });

  it("labels roles for logs and the users table", () => {
    assert.equal(roleLabel("sales_officer"), "Sales Officer");
    assert.equal(roleLabel("admin"), "Admin");
  });
});

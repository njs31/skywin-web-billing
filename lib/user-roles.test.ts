import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SEED_ADMIN_PHONE,
  canEditInvoices,
  matrixCanAccessPath,
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
    assert.equal(roleLabel("cashier"), "Cashier");
    assert.equal(roleLabel("store_manager"), "Store Manager");
  });
});

describe("cashier and store manager access", () => {
  it("lets a cashier bill and view invoices, and blocks purchase entry, logs, and edits", () => {
    assert.equal(matrixCanAccessPath("cashier", "/pos"), true);
    assert.equal(matrixCanAccessPath("cashier", "/invoices"), true);
    assert.equal(matrixCanAccessPath("cashier", "/invoices/12/edit"), false);
    assert.equal(matrixCanAccessPath("cashier", "/quotations/new"), true);
    assert.equal(matrixCanAccessPath("cashier", "/purchases"), true);
    assert.equal(matrixCanAccessPath("cashier", "/purchases/new"), false);
    assert.equal(matrixCanAccessPath("cashier", "/purchase-orders"), false);
    assert.equal(matrixCanAccessPath("cashier", "/stock/import"), false);
    assert.equal(matrixCanAccessPath("cashier", "/stock"), true);
    assert.equal(matrixCanAccessPath("cashier", "/accounts/receipts"), true);
    assert.equal(matrixCanAccessPath("cashier", "/accounts/receipts/4/edit"), false);
    assert.equal(matrixCanAccessPath("cashier", "/suppliers"), true);
    assert.equal(matrixCanAccessPath("cashier", "/logs"), false);
    assert.equal(matrixCanAccessPath("cashier", "/users"), false);
    assert.equal(matrixCanAccessPath("cashier", "/customers"), true);
    assert.equal(canEditInvoices("cashier"), false);
  });

  it("lets a store manager edit stock, purchases, and invoices, and blocks logs", () => {
    assert.equal(matrixCanAccessPath("store_manager", "/purchases/new"), true);
    assert.equal(matrixCanAccessPath("store_manager", "/purchases/9/edit"), true);
    assert.equal(matrixCanAccessPath("store_manager", "/invoices/9/edit"), true);
    assert.equal(matrixCanAccessPath("store_manager", "/products/new"), true);
    assert.equal(matrixCanAccessPath("store_manager", "/stock/import"), true);
    assert.equal(matrixCanAccessPath("store_manager", "/stock/adjust"), true);
    assert.equal(matrixCanAccessPath("store_manager", "/accounts/receipts/4/edit"), true);
    assert.equal(matrixCanAccessPath("store_manager", "/logs"), false);
    assert.equal(matrixCanAccessPath("store_manager", "/settings"), false);
    assert.equal(canEditInvoices("store_manager"), true);
  });

  it("leaves older roles on their existing rules", () => {
    assert.equal(matrixCanAccessPath("admin", "/logs"), null);
    assert.equal(matrixCanAccessPath("sales_officer", "/purchases"), null);
    assert.equal(matrixCanAccessPath("dealer", "/pos"), null);
    assert.equal(canEditInvoices("regional_manager"), false);
    assert.equal(canEditInvoices("admin"), true);
  });

  it("Manager follows Skywin-Manager-Access.xlsx", () => {
    assert.equal(roleLabel("manager"), "Manager");
    assert.equal(matrixCanAccessPath("manager", "/"), true);
    assert.equal(matrixCanAccessPath("manager", "/pos"), true);
    assert.equal(matrixCanAccessPath("manager", "/invoices"), true);
    assert.equal(matrixCanAccessPath("manager", "/invoices/9/edit"), false);
    assert.equal(matrixCanAccessPath("manager", "/quotations/new"), true);
    assert.equal(matrixCanAccessPath("manager", "/returns"), true);
    assert.equal(matrixCanAccessPath("manager", "/einvoice"), true);
    assert.equal(matrixCanAccessPath("manager", "/eway-bill"), true);
    assert.equal(matrixCanAccessPath("manager", "/purchases"), true);
    assert.equal(matrixCanAccessPath("manager", "/purchases/new"), true);
    assert.equal(matrixCanAccessPath("manager", "/purchases/9/edit"), false);
    assert.equal(matrixCanAccessPath("manager", "/purchase-orders/new"), true);
    assert.equal(matrixCanAccessPath("manager", "/suppliers"), true);
    assert.equal(matrixCanAccessPath("manager", "/products/new"), true);
    assert.equal(matrixCanAccessPath("manager", "/stock/import"), true);
    assert.equal(matrixCanAccessPath("manager", "/stock/adjust"), true);
    assert.equal(matrixCanAccessPath("manager", "/stock/expiry"), true);
    assert.equal(matrixCanAccessPath("manager", "/accounts/receipts"), true);
    assert.equal(matrixCanAccessPath("manager", "/accounts/receipts/4/edit"), false);
    assert.equal(matrixCanAccessPath("manager", "/accounts/payments"), true);
    assert.equal(matrixCanAccessPath("manager", "/accounts/credit"), true);
    assert.equal(matrixCanAccessPath("manager", "/accounts/outstanding"), true);
    assert.equal(matrixCanAccessPath("manager", "/reports"), true);
    assert.equal(matrixCanAccessPath("manager", "/logs"), false);
    assert.equal(matrixCanAccessPath("manager", "/users"), false);
    assert.equal(matrixCanAccessPath("manager", "/settings"), false);
    assert.equal(canEditInvoices("manager"), false);
  });

  it("opens the Customers page to every role", () => {
    for (const role of ["cashier", "store_manager", "manager"]) {
      assert.equal(matrixCanAccessPath(role, "/customers"), true);
      assert.equal(matrixCanAccessPath(role, "/customers/12"), true);
    }
  });
});

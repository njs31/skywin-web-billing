import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isIrpReportingWindowEnforced,
  isWithinReportingWindow,
  einvoiceMissingFields,
  ewayBillMissingFields,
  IRP_30DAY_WINDOW_AATO_CRORE,
} from "./einvoice";

const DAY = 24 * 60 * 60 * 1000;

describe("30-day IRP window enforcement (GSTN advisory 05.11.2024)", () => {
  it("documents the 10cr enforcement threshold", () => {
    assert.equal(IRP_30DAY_WINDOW_AATO_CRORE, 10);
  });

  it("is not enforced without (or below) a qualifying AATO", () => {
    assert.equal(isIrpReportingWindowEnforced(undefined), false);
    assert.equal(isIrpReportingWindowEnforced(5), false);
    assert.equal(isIrpReportingWindowEnforced(9.99), false);
  });

  it("is enforced at/above 10cr", () => {
    assert.equal(isIrpReportingWindowEnforced(10), true);
    assert.equal(isIrpReportingWindowEnforced(100), true);
  });

  it("never blocks this business's band (AATO 5-10cr), however old", () => {
    const ancient = new Date(Date.now() - 400 * DAY);
    assert.equal(isWithinReportingWindow(ancient), true);
    assert.equal(isWithinReportingWindow(new Date()), true);
  });

  it("blocks >30-day bills only when enforced", () => {
    const old = new Date(Date.now() - 40 * DAY);
    const fresh = new Date(Date.now() - 29 * DAY);
    assert.equal(isWithinReportingWindow(old, 10), false);
    assert.equal(isWithinReportingWindow(fresh, 10), true);
    assert.equal(isWithinReportingWindow(old, 5), true);
  });
});

describe("einvoiceMissingFields (customer readiness)", () => {
  const ready = {
    customerGstin: "33ABCDE1234F1Z5",
    customerAddress: "12 Main Road",
    customerDistrict: "Thanjavur",
    customerPinCode: "612001",
  };

  it("returns [] for a complete B2B customer", () => {
    assert.deepEqual(einvoiceMissingFields(ready), []);
  });

  it("rejects non-GSTIN buyers outright (J: invalid GSTIN)", () => {
    for (const gstin of [null, "", "URP", "33ABC"]) {
      assert.deepEqual(
        einvoiceMissingFields({ ...ready, customerGstin: gstin }),
        ["Not GST-registered — e-Invoicing doesn't apply"]
      );
    }
  });

  it("names the exact missing field (J/K: PIN, locality)", () => {
    assert.deepEqual(
      einvoiceMissingFields({ ...ready, customerPinCode: "  " }),
      ["Customer PIN code"]
    );
    assert.deepEqual(
      einvoiceMissingFields({ ...ready, customerDistrict: null }),
      ["Customer city"]
    );
    assert.deepEqual(
      einvoiceMissingFields({ ...ready, customerAddress: "" }),
      ["Customer address"]
    );
  });
});

describe("ewayBillMissingFields (dispatch readiness)", () => {
  it("returns [] when vehicle, transporter and distance exist", () => {
    assert.deepEqual(
      ewayBillMissingFields({
        vehicleNo: "TN68A1234",
        transporterName: "Selvam",
        distanceKm: "120.0",
      }),
      []
    );
  });

  it("lists each missing dispatch field", () => {
    assert.deepEqual(
      ewayBillMissingFields({ vehicleNo: null, transporterName: "  ", distanceKm: null }),
      ["Vehicle number", "Transporter name", "Distance"]
    );
  });
});

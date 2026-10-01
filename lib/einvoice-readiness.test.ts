import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { einvoiceReadiness, ewayBillReadiness } from "./gst";

const fullCustomer = {
  gstin: "33ABCDE1234F1Z5",
  address: "12 Main Road",
  district: "Thanjavur",
  village: null,
  taluk: null,
  pinCode: "612001",
};

describe("einvoiceReadiness", () => {
  it("is not eligible without a registered customer or GSTIN", () => {
    assert.deepEqual(einvoiceReadiness(null), {
      eligible: false,
      missing: [],
    });
    assert.deepEqual(einvoiceReadiness({ gstin: "URP" }), {
      eligible: false,
      missing: [],
    });
    assert.deepEqual(einvoiceReadiness({}), {
      eligible: false,
      missing: [],
    });
  });

  it("is eligible with nothing missing for a complete customer", () => {
    assert.deepEqual(einvoiceReadiness(fullCustomer), {
      eligible: true,
      missing: [],
    });
  });

  it("names each missing master field", () => {
    assert.deepEqual(
      einvoiceReadiness({ ...fullCustomer, address: "  " }).missing,
      ["Customer address"]
    );
    assert.deepEqual(
      einvoiceReadiness({
        ...fullCustomer,
        district: null,
        village: null,
        taluk: null,
      }).missing,
      ["Customer city"]
    );
    assert.deepEqual(
      einvoiceReadiness({ ...fullCustomer, pinCode: null }).missing,
      ["Customer PIN code"]
    );
  });

  it("accepts village or taluk as the locality", () => {
    assert.deepEqual(
      einvoiceReadiness({
        ...fullCustomer,
        district: null,
        village: "Kumbakonam",
      }),
      { eligible: true, missing: [] }
    );
  });
});

describe("ewayBillReadiness", () => {
  it("is not required below threshold", () => {
    assert.deepEqual(
      ewayBillReadiness({ grandTotal: 50000, interstate: true }),
      { required: false, missing: [] }
    );
    assert.deepEqual(
      ewayBillReadiness({ grandTotal: 100000, interstate: false }),
      { required: false, missing: [] }
    );
  });

  it("requires dispatch details above threshold", () => {
    assert.deepEqual(
      ewayBillReadiness({ grandTotal: 50001, interstate: true }),
      {
        required: true,
        missing: ["Vehicle number", "Transporter name", "Distance"],
      }
    );
    assert.deepEqual(
      ewayBillReadiness({ grandTotal: 100001, interstate: false }),
      {
        required: true,
        missing: ["Vehicle number", "Transporter name", "Distance"],
      }
    );
  });

  it("is satisfied when all dispatch details are present", () => {
    assert.deepEqual(
      ewayBillReadiness({
        grandTotal: 330000,
        interstate: false,
        vehicleNo: "TN68AV6675",
        transporterName: "SELF",
        distanceKm: 35,
      }),
      { required: true, missing: [] }
    );
  });

  it("treats zero or missing distance as missing", () => {
    const base = {
      grandTotal: 60000,
      interstate: true,
      vehicleNo: "TN01AB1234",
      transporterName: "SELF",
    };
    assert.deepEqual(ewayBillReadiness({ ...base, distanceKm: 0 }).missing, [
      "Distance",
    ]);
    assert.deepEqual(ewayBillReadiness(base).missing, ["Distance"]);
  });
});

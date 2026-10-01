import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildIrnPayload,
  formatNicDate,
  nicAmount,
  stateCodeOfGstin,
  uqcForUnit,
  type IrnSale,
  type IrnSeller,
} from "./irn-payload";

const seller: IrnSeller = {
  gstin: "33AJBPM9217B2ZM",
  name: "SKYWIN BIOTECH",
  address: "NO.171/E2-A, KOMALAVALLIPETTAI, KUMBAKONAM-612401",
  phone: "9942499929",
  email: "skywinagrisupermarket@gmail.com",
  stateCode: "33",
  locality: "Kumbakonam",
  pin: "612401",
};

function sale(overrides: Partial<IrnSale> = {}): IrnSale {
  return {
    invoiceNo: "R/1234",
    date: new Date(2026, 8, 30),
    grandTotal: 1180,
    billDiscount: 0,
    buyer: {
      name: "Test Farmer Supplies",
      gstin: "33ABCDE1234F1Z5",
      address: "12 Main Road",
      pinCode: "612001",
      phone: "9876543210",
      village: null,
      taluk: null,
      district: "Thanjavur",
    },
    items: [
      {
        name: "DAP 50KG",
        hsnCode: "31053000",
        qty: 2,
        rate: 500,
        gstRate: 18,
        unit: "Bag",
        amount: 1000,
      },
    ],
    ...overrides,
  };
}

describe("irn payload helpers", () => {
  it("maps units to NIC quantity codes", () => {
    assert.equal(uqcForUnit("Pcs"), "PCS");
    assert.equal(uqcForUnit("Bag"), "BAG");
    assert.equal(uqcForUnit("Gram"), "GMS");
    assert.equal(uqcForUnit("500 GM"), "GMS");
    assert.equal(uqcForUnit("Mtr."), "MTR");
    assert.throws(() => uqcForUnit("Sack"), /quantity code/);
  });

  it("reads the state code off a GSTIN", () => {
    assert.equal(stateCodeOfGstin("33abcde1234f1z5"), "33");
  });

  it("formats NIC dates as DD/MM/YYYY", () => {
    assert.equal(formatNicDate(new Date(2026, 0, 5)), "05/01/2026");
  });

  it("keeps decimals plain (no exponent)", () => {
    assert.equal(nicAmount(100.345), 100.345);
  });
});

describe("buildIrnPayload", () => {
  it("builds an intrastate document with CGST/SGST split", () => {
    const payload = buildIrnPayload(sale(), seller);
    assert.equal(payload.Version, "1.1");
    const doc = payload.DocDtls as { No: string; Dt: string };
    assert.equal(doc.No, "R/1234");
    assert.equal(doc.Dt, "30/09/2026");
    const items = payload.ItemList as Array<Record<string, number>>;
    assert.equal(items.length, 1);
    assert.equal(items[0].AssAmt, 1000);
    assert.equal(items[0].CgstAmt, 90);
    assert.equal(items[0].SgstAmt, 90);
    assert.equal(items[0].IgstAmt, 0);
    assert.equal(items[0].TotItemVal, 1180);
    const val = payload.ValDtls as Record<string, number>;
    assert.equal(val.AssVal, 1000);
    assert.equal(val.CgstVal, 90);
    assert.equal(val.SgstVal, 90);
    assert.equal(val.TotInvVal, 1180);
    assert.equal(val.RndOffAmt, 0);
    assert.ok(!("EwbDtls" in payload));
  });

  it("charges IGST for an interstate buyer", () => {
    const s = sale();
    s.buyer.gstin = "27ABCDE1234F1Z5";
    s.buyer.pinCode = "400001";
    s.buyer.district = "Mumbai";
    const payload = buildIrnPayload(s, seller);
    const buyer = payload.BuyerDtls as { Pos: string; Stcd: string };
    assert.equal(buyer.Pos, "27");
    const items = payload.ItemList as Array<Record<string, number>>;
    assert.equal(items[0].IgstAmt, 180);
    assert.equal(items[0].CgstAmt, 0);
  });

  it("prorates a bill discount across lines and absorbs rounding", () => {
    const s = sale({
      grandTotal: 1062,
      billDiscount: 100,
      items: [
        {
          name: "DAP 50KG",
          hsnCode: "31053000",
          qty: 2,
          rate: 500,
          gstRate: 18,
          unit: "Bag",
          amount: 1000,
        },
      ],
    });
    const payload = buildIrnPayload(s, seller);
    const items = payload.ItemList as Array<Record<string, number>>;
    assert.equal(items[0].AssAmt, 900);
    assert.equal(items[0].CgstAmt, 81);
    const val = payload.ValDtls as Record<string, number>;
    assert.equal(val.AssVal, 900);
    assert.equal(val.TotInvVal, 1062);
  });

  it("satisfies the IRP 2189 rule: TotInvVal = items + othChrg − discount ± 1", () => {
    // Multi-line bill with line discounts AND a bill discount — the exact
    // shape that double-subtracted Discount before the fix.
    const s = sale({
      grandTotal: 5239,
      billDiscount: 0,
      items: [
        {
          name: "Sprayer A",
          hsnCode: "84244100",
          qty: 1,
          rate: 4073.13,
          gstRate: 5,
          unit: "Pcs",
          amount: 3869.47,
        },
        {
          name: "Copper 500GM",
          hsnCode: "28332990",
          qty: 4,
          rate: 311.19,
          gstRate: 5,
          unit: "500 GM",
          amount: 1120.28,
        },
      ],
    });
    const payload = buildIrnPayload(s, seller);
    const items = payload.ItemList as Array<Record<string, number>>;
    const val = payload.ValDtls as Record<string, number>;
    const itemTotal = items.reduce((sum, it) => sum + it.TotItemVal, 0);
    const derived = itemTotal + val.OthChrg - val.Discount;
    assert.ok(
      Math.abs(val.TotInvVal - derived) <= 1,
      `TotInvVal ${val.TotInvVal} vs derived ${derived}`
    );
  });

  it("attaches EwbDtls only when dispatch details exist", () => {    const withDispatch = buildIrnPayload(sale(), seller, {
      vehicleNo: "TN68A1234",
      transporterName: "Selvam Transport",
      distanceKm: 120,
    });
    const ewb = withDispatch.EwbDtls as Record<string, unknown>;
    assert.equal(ewb.Vehno, "TN68A1234");
    assert.equal(ewb.Distance, 120);
    assert.equal(ewb.TransMode, "1");
  });

  it("keeps CGST/SGST exactly equal on odd-paisa tax (IRP 2227)", () => {
    const s = sale({
      grandTotal: 11,
      items: [
        {
          name: "Sample",
          hsnCode: "31053000",
          qty: 1,
          rate: 10.1,
          gstRate: 5,
          unit: "Pcs",
          amount: 10.1,
        },
      ],
    });
    const payload = buildIrnPayload(s, seller);
    const items = payload.ItemList as Array<Record<string, number>>;
    assert.equal(items[0].CgstAmt, items[0].SgstAmt);
    const val = payload.ValDtls as Record<string, number>;
    assert.equal(val.TotInvVal, 11);
  });

  it("rejects bad data with actionable messages", () => {
    const noHsn = sale();
    noHsn.items[0].hsnCode = null;
    assert.throws(() => buildIrnPayload(noHsn, seller), /HSN/);

    const noPin = sale();
    noPin.buyer.pinCode = null;
    assert.throws(() => buildIrnPayload(noPin, seller), /pincode/);

    const badGstin = sale();
    badGstin.buyer.gstin = "URP";
    assert.throws(() => buildIrnPayload(badGstin, seller), /GSTIN/);

    const badNo = sale({ invoiceNo: "THIS-INVOICE-NUMBER-IS-WAY-TOO-LONG" });
    assert.throws(() => buildIrnPayload(badNo, seller), /invoice number/);

    const mismatch = sale({ grandTotal: 5000 });
    assert.throws(() => buildIrnPayload(mismatch, seller), /does not foot/);
  });
});

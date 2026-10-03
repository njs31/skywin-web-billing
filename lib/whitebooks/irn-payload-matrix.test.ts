import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildIrnPayload,
  validateHsn,
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

function buyer(overrides = {}) {
  return {
    name: "Test Buyer",
    gstin: "33ABCDE1234F1Z5",
    address: "12 Main Road",
    pinCode: "612001",
    phone: "9876543210",
    village: null,
    taluk: null,
    district: "Thanjavur",
    ...overrides,
  };
}

function item(overrides = {}) {
  return {
    name: "Item",
    hsnCode: "310530",
    qty: 1,
    rate: 100,
    gstRate: 18,
    unit: "Pcs",
    amount: 100,
    ...overrides,
  };
}

function sale(overrides: Partial<IrnSale> = {}): IrnSale {
  return {
    invoiceNo: "INV-261001-0001",
    date: new Date(2026, 9, 1),
    grandTotal: 118,
    billDiscount: 0,
    buyer: buyer(),
    items: [item()],
    ...overrides,
  };
}

type ItemRow = Record<string, number>;

/** The IRP 2189 rule, asserted exactly as the portal states it. */
function assertIrp2189(payload: Record<string, unknown>) {
  const items = payload.ItemList as ItemRow[];
  const val = payload.ValDtls as Record<string, number>;
  const derived =
    items.reduce((s, it) => s + it.TotItemVal, 0) + val.OthChrg - val.Discount;
  assert.ok(
    Math.abs(val.TotInvVal - derived) <= 1,
    `TotInvVal ${val.TotInvVal} vs derived ${derived}`
  );
}

/** The IRP 2227 rule: intra-state halves identical, interstate IGST-only. */
function assertHalves(items: ItemRow[], interstate: boolean) {
  for (const it of items) {
    if (interstate) {
      assert.equal(it.CgstAmt, 0);
      assert.equal(it.SgstAmt, 0);
      assert.ok(it.IgstAmt > 0 || it.AssAmt === 0);
    } else {
      assert.equal(
        it.CgstAmt,
        it.SgstAmt,
        `CGST ${it.CgstAmt} != SGST ${it.SgstAmt}`
      );
    }
  }
}

describe("2189 totals matrix (gross → discount → taxable → GST → total)", () => {
  const cases: Array<{ name: string; sale: IrnSale; interstate: boolean }> = [
    {
      // gross 100, no discount, taxable 100, GST 18 → total 118.
      name: "no discount",
      sale: sale(),
      interstate: false,
    },
    {
      // gross 1000, 10% line discount → taxable 900, GST 162 → 1062.
      name: "line percentage discount",
      sale: sale({
        grandTotal: 1062,
        items: [
          item({ qty: 2, rate: 500, amount: 900, discountType: "percent", discountValue: 10 }),
        ],
      }),
      interstate: false,
    },
    {
      // gross 1000, ₹100 line discount → taxable 900, GST 12% → 1008.
      name: "line fixed discount",
      sale: sale({
        grandTotal: 1008,
        items: [
          item({
            qty: 1,
            rate: 1000,
            amount: 900,
            gstRate: 12,
            discountType: "value",
            discountValue: 100,
          }),
        ],
      }),
      interstate: false,
    },
    {
      // two lines, 5% + 12%: (100+5) + (400+48) = 553.
      name: "multiple lines, multiple GST rates",
      sale: sale({
        grandTotal: 553,
        items: [
          item({ name: "A", qty: 1, rate: 100, amount: 100, gstRate: 5 }),
          item({ name: "B", qty: 2, rate: 200, amount: 400, gstRate: 12 }),
        ],
      }),
      interstate: false,
    },
    {
      // gross 1000, ₹100 bill discount → taxable 900, GST 162 → 1062.
      name: "bill-level discount",
      sale: sale({
        grandTotal: 1062,
        billDiscount: 100,
        items: [item({ qty: 2, rate: 500, amount: 1000 })],
      }),
      interstate: false,
    },
    {
      // interstate: taxable 500, IGST 25+48=73 → 553.
      name: "IGST multi-rate interstate",
      sale: sale({
        grandTotal: 553,
        buyer: buyer({ gstin: "27ABCDE1234F1Z5", pinCode: "400001", district: "Mumbai" }),
        items: [
          item({ name: "A", qty: 1, rate: 100, amount: 100, gstRate: 5 }),
          item({ name: "B", qty: 2, rate: 200, amount: 400, gstRate: 12 }),
        ],
      }),
      interstate: true,
    },
    {
      // taxable 10.10, GST 5% = 0.51 → halves 0.26/0.26 (equal!).
      name: "odd-paisa GST",
      sale: sale({
        grandTotal: 11,
        items: [item({ rate: 10.1, amount: 10.1, gstRate: 5 })],
      }),
      interstate: false,
    },
    {
      // taxable 100.35, GST 18.06 → 118.41 vs bill 118 → round-off -0.41.
      name: "round-off",
      sale: sale({
        grandTotal: 118,
        items: [item({ rate: 100.35, amount: 100.35 })],
      }),
      interstate: false,
    },
    {
      // zero-rated: taxable 100, GST 0 → 100.
      name: "zero discount, zero rate",
      sale: sale({
        grandTotal: 100,
        items: [item({ gstRate: 0 })],
      }),
      interstate: false,
    },
    {
      // large: taxable 9999990, GST 28% = 2799997.20 → 12799987.20.
      name: "large invoice",
      sale: sale({
        grandTotal: 12799987,
        items: [
          item({ qty: 1000, rate: 9999.99, amount: 9999990, gstRate: 28 }),
        ],
      }),
      interstate: false,
    },
    {
      // small: taxable 1, GST 0 → 1.
      name: "small invoice",
      sale: sale({ grandTotal: 1, items: [item({ rate: 1, amount: 1, gstRate: 0 })] }),
      interstate: false,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const payload = buildIrnPayload(c.sale, seller);
      const items = payload.ItemList as ItemRow[];
      const val = payload.ValDtls as Record<string, number>;
      assertIrp2189(payload);
      assertHalves(items, c.interstate);
      assert.equal(val.TotInvVal, c.sale.grandTotal);
      assert.equal(val.Discount, 0);
    });
  }
});

describe("document number validation (Part 1 + Part 2)", () => {
  it("accepts the new INV-YYMMDD-NNNN format", () => {
    for (const no of ["INV-261001-0001", "INV-261001-0002", "INV-261001-0538"]) {
      const payload = buildIrnPayload(sale({ invoiceNo: no }), seller);
      assert.equal((payload.DocDtls as { No: string }).No, no);
    }
  });

  it("accepts exactly 16 characters", () => {
    const no = "1234567890123456";
    const payload = buildIrnPayload(sale({ invoiceNo: no }), seller);
    assert.equal((payload.DocDtls as { No: string }).No, no);
  });

  it("rejects the old 17-char retail format without substituting anything", () => {
    assert.throws(
      () => buildIrnPayload(sale({ invoiceNo: "INV-20260903-0538" }), seller),
      /not IRP-compatible/
    );
  });

  it("rejects IRP-forbidden leading characters", () => {
    for (const no of ["0ABC", "/ABC", "-ABC"]) {
      assert.throws(() => buildIrnPayload(sale({ invoiceNo: no }), seller), /not IRP-compatible/);
    }
  });
});

describe("custom lines carry their own unit", () => {
  it("maps a custom line unit to its UQC", () => {
    const s = sale({
      grandTotal: 236,
      items: [
        {
          name: "RUUF 1 LTR",
          hsnCode: "28332990",
          qty: 2,
          rate: 100,
          gstRate: 18,
          unit: "Ltr",
          amount: 200,
        },
      ],
    });
    const payload = buildIrnPayload(s, seller);
    const items = payload.ItemList as Array<Record<string, unknown>>;
    assert.equal(items[0].Unit, "LTR");
    assert.equal(items[0].TotItemVal, 236);
  });

  it("still blocks a custom line with a blank unit", () => {
    const s = sale({
      grandTotal: 236,
      items: [
        {
          name: "RUUF 1 LTR",
          hsnCode: "28332990",
          qty: 2,
          rate: 100,
          gstRate: 18,
          unit: "",
          amount: 200,
        },
      ],
    });
    assert.throws(() => buildIrnPayload(s, seller), /quantity code/);
  });
});

describe("HSN validation (AATO > 5cr: 6-or-8-digit numeric)", () => {
  it("accepts 6- and 8-digit codes", () => {
    assert.equal(validateHsn("310530", "X"), "310530");
    assert.equal(validateHsn("31053000", "X"), "31053000");
    assert.equal(validateHsn(" 3105 3000 ", "X"), "31053000");
  });

  it("rejects short, non-numeric and empty codes with the item named", () => {
    for (const hsn of ["3105", "31053", "ABC123", "", "   "]) {
      assert.throws(() => validateHsn(hsn, "DAP 50KG"), /DAP 50KG/);
    }
  });

  it("blocks the push (not the bill) on a 4-digit HSN", () => {
    const s = sale();
    s.items[0].hsnCode = "3105";
    assert.throws(() => buildIrnPayload(s, seller), /6- or 8-digit/);
  });
});

describe("golden payload shape", () => {
  it("emits the exact WhiteBooks/IRP JSON contract", () => {
    const payload = buildIrnPayload(sale(), seller);
    assert.deepEqual(Object.keys(payload).sort(), [
      "BuyerDtls",
      "DocDtls",
      "ItemList",
      "SellerDtls",
      "TranDtls",
      "ValDtls",
      "Version",
    ]);
    assert.deepEqual(payload.TranDtls, {
      TaxSch: "GST",
      SupTyp: "B2B",
      RegRev: "N",
      EcmGstin: null,
      IgstOnIntra: "N",
    });
    assert.deepEqual(payload.DocDtls, {
      Typ: "INV",
      No: "INV-261001-0001",
      Dt: "01/10/2026",
    });
    const buyer = payload.BuyerDtls as Record<string, unknown>;
    assert.equal(buyer.Gstin, "33ABCDE1234F1Z5");
    assert.equal(buyer.Pos, "33");
    assert.equal(buyer.Stcd, "33");
    assert.equal(buyer.Pin, 612001);
    const sellerDtls = payload.SellerDtls as Record<string, unknown>;
    assert.equal(sellerDtls.Gstin, "33AJBPM9217B2ZM");
    assert.equal(sellerDtls.Stcd, "33");
    const val = payload.ValDtls as Record<string, number>;
    assert.deepEqual(val, {
      AssVal: 100,
      CgstVal: 9,
      SgstVal: 9,
      IgstVal: 0,
      CesVal: 0,
      StCesVal: 0,
      Discount: 0,
      OthChrg: 0,
      RndOffAmt: 0,
      TotInvVal: 118,
    });
  });
});

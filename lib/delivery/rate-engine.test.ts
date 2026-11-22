import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickRate, splitShippingByGst, type RateRule } from "./rate-engine";

let id = 0;
function rule(p: Partial<RateRule> & { fee: number; min?: number; max?: number }): RateRule {
  id += 1;
  return {
    id,
    slab: p.slab ?? `${p.min ?? 0}-${p.max ?? 500}`,
    minWeightGrams: p.min ?? 0,
    maxWeightGrams: p.max ?? 500,
    zoneName: p.zoneName ?? `zone ${id}`,
    transitDays: "3 - 5 Days",
    shippingFee: p.fee,
    pincodes: p.pincodes ?? null,
    districts: p.districts ?? null,
    states: p.states ?? null,
    isActive: p.isActive ?? true,
  };
}

const chennaiPin = rule({ fee: 67, pincodes: "600016, 600043" });
const chennaiPinKg = rule({ fee: 85, min: 501, max: 1000, pincodes: "600016,600043" });
const coimbatore = rule({ fee: 109, districts: "coimbatore,madurai,tuticorin" });
const tn = rule({ fee: 63, states: "tamil nadu,puducherry" });
const tnBig = rule({ fee: 40, min: 1001, max: 2000, states: "tamil nadu" });
const kerala = rule({ fee: 50, min: 501, max: 1000, states: "kerala" });
const ne = rule({ fee: 150, states: "north-east" });
const rest = rule({ fee: 111 });
const restKg = rule({ fee: 159, min: 501, max: 1000 });
const rules = [chennaiPin, chennaiPinKg, coimbatore, tn, tnBig, kerala, ne, rest, restKg];

describe("pickRate", () => {
  it("prefers PIN over district over state", () => {
    assert.equal(pickRate(rules, { pin: "600016", district: "chennai", state: "TN" }, 400)?.rule.id, chennaiPin.id);
    assert.equal(pickRate(rules, { pin: "641001", district: "Coimbatore", state: "TN" }, 400)?.rule.id, coimbatore.id);
    assert.equal(pickRate(rules, { pin: "612001", district: "Thanjavur", state: "TN" }, 400)?.rule.id, tn.id);
  });

  it("picks the weight band (spec examples: Kerala 500g-1kg ₹50, TN 1-2kg ₹40)", () => {
    assert.equal(pickRate(rules, { pin: "682001", district: "Ernakulam", state: "Kerala" }, 800)?.amount, 50);
    assert.equal(pickRate(rules, { pin: "612001", district: "Thanjavur", state: "Tamil Nadu" }, 1500)?.amount, 40);
  });

  it("uses a covering band before a more specific destination without one", () => {
    // Chennai PIN rules stop at 1 kg; the Tamil Nadu 1-2 kg band covers 1.5 kg.
    const pick = pickRate(rules, { pin: "600016", district: "Chennai", state: "TN" }, 1500);
    assert.equal(pick?.rule.id, tnBig.id);
  });

  it("matches regions such as north-east", () => {
    const pick = pickRate(rules, { pin: "781001", district: "Kamrup", state: "AS" }, 300);
    assert.equal(pick?.rule.id, ne.id);
    assert.equal(pick?.matchedBy, "region");
  });

  it("falls back to the default rule for the rest of India", () => {
    assert.equal(pickRate(rules, { pin: "110001", district: "New Delhi", state: "DL" }, 700)?.amount, 159);
  });

  it("scales the heaviest band when the order is heavier than every band", () => {
    const pick = pickRate(rules, { pin: "110001", district: "New Delhi", state: "DL" }, 2400);
    assert.equal(pick?.multiplier, 3);
    assert.equal(pick?.amount, 159 * 3);
  });

  it("knows district spellings (Thoothukudi = Tuticorin)", () => {
    assert.equal(pickRate(rules, { pin: "628001", district: "Thoothukudi", state: "TN" }, 400)?.rule.id, coimbatore.id);
  });

  it("ignores switched-off rules", () => {
    const off = [{ ...tn, isActive: false }, rest];
    assert.equal(pickRate(off, { pin: "612001", district: "Thanjavur", state: "TN" }, 400)?.rule.id, rest.id);
  });

  it("returns null when nothing matches", () => {
    assert.equal(pickRate([tn], { pin: "110001", district: "Delhi", state: "DL" }, 400), null);
  });
});

describe("splitShippingByGst", () => {
  it("keeps one line for a single GST rate", () => {
    assert.deepEqual(splitShippingByGst(85, [{ gstRate: 5, value: 300 }]), [{ gstRate: 5, amount: 85 }]);
  });

  it("splits by goods value and always adds up exactly", () => {
    const parts = splitShippingByGst(100, [
      { gstRate: 5, value: 200 },
      { gstRate: 18, value: 100 },
      { gstRate: 5, value: 100 },
    ]);
    assert.deepEqual(parts, [
      { gstRate: 5, amount: 75 },
      { gstRate: 18, amount: 25 },
    ]);
    const odd = splitShippingByGst(67, [
      { gstRate: 5, value: 1 },
      { gstRate: 12, value: 1 },
      { gstRate: 18, value: 1 },
    ]);
    assert.equal(Math.round(odd.reduce((s, p) => s + p.amount, 0) * 100), 6700);
  });

  it("is empty for free delivery", () => {
    assert.deepEqual(splitShippingByGst(0, [{ gstRate: 5, value: 10 }]), []);
  });
});

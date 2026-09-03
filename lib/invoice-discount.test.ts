import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  lineDiscountAmount,
  lineDiscountLabel,
  lineDiscountPercent,
  totalLineDiscount,
} from "./invoice-discount";

describe("retail invoice discount details", () => {
  it("shows 10% and the rupee off for the lunch-box line from INV-20260903-0516", () => {
    const item = {
      qty: "1.00",
      rate: "207.90",
      amount: "187.11",
      discountType: "percent",
      discountValue: "10.00",
    };
    assert.equal(lineDiscountPercent(item), 10);
    assert.equal(lineDiscountAmount(item), 20.79);
    assert.equal(lineDiscountLabel(item), "10%");
  });

  it("totals both discounted lines on that cash bill", () => {
    const items = [
      {
        qty: "1.00",
        rate: "193.96",
        amount: "174.56",
        discountType: "percent",
        discountValue: "10",
      },
      {
        qty: "1.00",
        rate: "207.90",
        amount: "187.11",
        discountType: "percent",
        discountValue: "10",
      },
    ];
    assert.equal(totalLineDiscount(items), 40.19);
  });

  it("prints a rupee amount for value discounts", () => {
    const item = {
      qty: 2,
      rate: 100,
      amount: 150,
      discountType: "value",
      discountValue: 50,
    };
    assert.equal(lineDiscountAmount(item), 50);
    assert.equal(lineDiscountLabel(item), "50.00");
  });

  it("leaves the disc cell blank when nothing was discounted", () => {
    const item = {
      qty: 1,
      rate: 100,
      amount: 100,
      discountType: "percent",
      discountValue: 0,
    };
    assert.equal(lineDiscountAmount(item), 0);
    assert.equal(lineDiscountLabel(item), "");
  });
});

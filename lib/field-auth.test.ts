import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkOtpChallenge,
  cleanMobile,
  consumeOtpChallenge,
  createFieldToken,
  createOtpChallenge,
  rateLimited,
  reviewLogin,
  verifyFieldToken,
} from "./field-auth";
import { billedRate, legitimateRates, minimumLineTotal, packCart, unpackCart } from "./field-order-pricing";

process.env.FIELD_AUTH_SECRET = "test-secret";

describe("field OTP challenge", () => {
  const phone = "9876543210";

  it("accepts the right code", () => {
    const c = createOtpChallenge(phone, "farmer", "123456");
    assert.deepEqual(checkOtpChallenge(c, { phone, role: "farmer", code: "123456" }), { ok: true, phone, role: "farmer" });
  });

  it("rejects a wrong code", () => {
    const c = createOtpChallenge(phone, "farmer", "123456");
    assert.equal(checkOtpChallenge(c, { phone, role: "farmer", code: "654321" }).ok, false);
  });

  it("rejects another phone or role with the same challenge", () => {
    const c = createOtpChallenge(phone, "farmer", "123456");
    assert.equal(checkOtpChallenge(c, { phone: "9876543211", role: "farmer", code: "123456" }).ok, false);
    assert.equal(checkOtpChallenge(c, { phone, role: "officer", code: "123456" }).ok, false);
  });

  it("expires after 10 minutes", () => {
    const now = Date.now();
    const c = createOtpChallenge(phone, "farmer", "123456", now);
    assert.deepEqual(checkOtpChallenge(c, { phone, role: "farmer", code: "123456" }, now + 11 * 60 * 1000), {
      ok: false,
      error: "expired",
    });
  });

  it("rejects a tampered expiry", () => {
    const c = createOtpChallenge(phone, "farmer", "123456").split(".");
    c[2] = String(Number(c[2]) + 3600_000);
    assert.equal(checkOtpChallenge(c.join("."), { phone, role: "farmer", code: "123456" }).ok, false);
  });

  it("signs in only once per challenge", () => {
    const c = createOtpChallenge(phone, "officer", "246810");
    assert.equal(checkOtpChallenge(c, { phone, role: "officer", code: "246810" }).ok, true);
    assert.equal(consumeOtpChallenge(c), true);
    assert.equal(consumeOtpChallenge(c), false);
    assert.equal(consumeOtpChallenge(createOtpChallenge(phone, "officer", "246810")), true);
  });

  it("does not contain the code", () => {
    assert.equal(createOtpChallenge(phone, "farmer", "123456").includes("123456"), false);
  });
});

describe("field login token", () => {
  it("round-trips identity", () => {
    const t = createFieldToken({ phone: "9876543210", role: "officer", officerId: 7 });
    const id = verifyFieldToken(t);
    assert.equal(id?.phone, "9876543210");
    assert.equal(id?.role, "officer");
    assert.equal(id?.officerId, 7);
  });

  it("rejects a forged role", () => {
    const [p, payload, sig] = createFieldToken({ phone: "9876543210", role: "farmer" }).split(".");
    const body = JSON.parse(Buffer.from(payload!, "base64url").toString());
    body.role = "manager";
    const forged = `${p}.${Buffer.from(JSON.stringify(body)).toString("base64url")}.${sig}`;
    assert.equal(verifyFieldToken(forged), null);
  });

  it("expires", () => {
    const t = createFieldToken({ phone: "9876543210", role: "farmer" }, 0);
    assert.equal(verifyFieldToken(t), null);
  });

  it("is not a web session token", () => {
    assert.equal(verifyFieldToken("12.admin.99999999999999.abc"), null);
  });
});

describe("field helpers", () => {
  it("cleans phone numbers", () => {
    assert.equal(cleanMobile("+91 98765 43210"), "9876543210");
    assert.equal(cleanMobile("09876543210"), "9876543210");
  });

  it("knows review logins by role", () => {
    assert.equal(reviewLogin("9000000002", "farmer"), "739154");
    assert.equal(reviewLogin("9000000002", "officer"), null);
  });

  it("rate limits", () => {
    const key = `t-${Math.random()}`;
    assert.equal(rateLimited(key, 2, 60_000), false);
    assert.equal(rateLimited(key, 2, 60_000), false);
    assert.equal(rateLimited(key, 2, 60_000), true);
  });
});

describe("field order pricing", () => {
  const plain = { saleRate: "100", wholesaleRate: null, batchSaleRate: null, discountPercent: "0", gstRate: "18" };
  const offer = { ...plain, discountPercent: "10" };

  it("uses the billing rate when the client sends less", () => {
    assert.equal(billedRate(plain, 1), legitimateRates(plain).billing);
  });

  it("keeps an honest client rate", () => {
    assert.equal(billedRate(plain, 100), 100);
  });

  it("allows the offer price on discounted products", () => {
    assert.equal(legitimateRates(offer).floor, 90);
    assert.equal(billedRate(offer, 90), 90);
    assert.equal(billedRate(offer, 50), legitimateRates(offer).billing);
  });

  it("totals the minimum with GST", () => {
    assert.equal(minimumLineTotal(plain, 2), 236);
  });

  it("packs and unpacks the cart for Razorpay notes", () => {
    const lines = [
      { productId: 12, batchId: 3, qty: 2 },
      { productId: 40, batchId: null, qty: 1 },
    ];
    const packed = packCart(lines);
    assert.equal(packed, "12:3:2,40::1");
    assert.deepEqual(unpackCart(packed), lines);
  });
});

describe("field push payloads", async () => {
  const { expoPayloads, checkpointCopy, pushCopy } = await import("./field-push");

  it("only sends to Expo tokens and sets the Android channel and tap route", () => {
    const out = expoPayloads(["ExponentPushToken[abc]", "not-a-token"], {
      title: "t",
      body: "b",
      url: "/order/SW-1",
      orderId: "SW-1",
      channel: "advice",
    });
    assert.equal(out.length, 1);
    assert.equal(out[0]!.channelId, "advice");
    assert.equal(out[0]!.data.url, "/order/SW-1");
    assert.equal(out[0]!.priority, "high");
  });

  it("has Tamil and English shipping messages that open the order", () => {
    const copy = checkpointCopy("SW-9", "Out for delivery");
    assert.match(copy.en.title, /Out for delivery today · SW-9/);
    assert.ok(copy.ta && copy.ta.title.includes("SW-9"));
    assert.equal(copy.en.url, "/order/SW-9");
  });

  it("formats order amounts in rupees", () => {
    assert.match(pushCopy.orderPlacedForFarmer("SW-2", 1234.4).en.body, /₹1,234 paid/);
  });
});

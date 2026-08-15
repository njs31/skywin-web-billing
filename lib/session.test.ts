import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, verifySessionToken } from "./session";

describe("session tokens", () => {
  it("round-trips a valid token", async () => {
    const token = await createSessionToken(7, "sales_officer");
    const parsed = await verifySessionToken(token);
    assert.ok(parsed);
    assert.equal(parsed.userId, 7);
    assert.equal(parsed.role, "sales_officer");
    assert.ok(parsed.exp > Date.now());
  });

  it("rejects the legacy unsigned userId:role cookie", async () => {
    assert.equal(await verifySessionToken("2:admin"), null);
  });

  it("rejects a forged admin role", async () => {
    const token = await createSessionToken(7, "dealer");
    const [userId, , exp, sig] = token.split(".");
    const forged = `${userId}.admin.${exp}.${sig}`;
    assert.equal(await verifySessionToken(forged), null);
  });

  it("rejects a swapped user id", async () => {
    const token = await createSessionToken(7, "admin");
    const [, role, exp, sig] = token.split(".");
    const forged = `1.${role}.${exp}.${sig}`;
    assert.equal(await verifySessionToken(forged), null);
  });

  it("rejects truncated and empty values", async () => {
    assert.equal(await verifySessionToken(""), null);
    assert.equal(await verifySessionToken(undefined), null);
    assert.equal(await verifySessionToken("1.admin.9"), null);
  });
});

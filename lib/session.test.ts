import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, sessionCookieOptions, sessionNeedsRefresh, SESSION_MAX_AGE_SEC, verifySessionToken } from "./session";

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

  it("issues a long-lived token (400 days) that survives restarts with the same secret", async () => {
    const token = await createSessionToken(7, "admin");
    const parsed = await verifySessionToken(token);
    assert.ok(parsed);
    const days = (parsed.exp - Date.now()) / 86_400_000;
    assert.ok(days > 399.9 && days <= 400, `expected ~400 days, got ${days}`);
    assert.equal(SESSION_MAX_AGE_SEC, 400 * 86_400);
  });

  it("refreshes only once the token is over a day old", () => {
    const now = Date.now();
    const fresh = now + SESSION_MAX_AGE_SEC * 1000;
    assert.equal(sessionNeedsRefresh(fresh, now), false);
    assert.equal(sessionNeedsRefresh(fresh - 23 * 3_600_000, now), false);
    assert.equal(sessionNeedsRefresh(fresh - 25 * 3_600_000, now), true);
    // Old 7-day tokens from before this change are refreshed on the next page load.
    assert.equal(sessionNeedsRefresh(now + 7 * 86_400_000, now), true);
  });

  it("cookie attributes: HttpOnly, SameSite=Lax, path /, long max-age; logout uses max-age 0", () => {
    const o = sessionCookieOptions();
    assert.equal(o.httpOnly, true);
    assert.equal(o.sameSite, "lax");
    assert.equal(o.path, "/");
    assert.equal(o.maxAge, 400 * 86_400);
    assert.equal(sessionCookieOptions(0).maxAge, 0);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSaleListParams, istDayRange } from "./sales";

describe("parseSaleListParams", () => {
  it("defaults to unfiltered newest-first", () => {
    assert.deepEqual(parseSaleListParams({}), {
      q: "",
      billType: "all",
      day: null,
      sort: "newest",
    });
  });

  it("keeps valid values and trims the query", () => {
    assert.deepEqual(
      parseSaleListParams({
        q: "  SKYA/0409 ",
        type: "wholesale",
        day: "2026-10-01",
        sort: "amount-desc",
      }),
      {
        q: "SKYA/0409",
        billType: "wholesale",
        day: "2026-10-01",
        sort: "amount-desc",
      }
    );
  });

  it("falls back on unknown type, sort, or day", () => {
    assert.deepEqual(parseSaleListParams({ type: "bogus", sort: "nope", day: "tomorrow" }), {
      q: "",
      billType: "all",
      day: null,
      sort: "newest",
    });
  });
});

describe("istDayRange", () => {
  it("returns IST day bounds as UTC instants", () => {
    const range = istDayRange("2026-10-01");
    assert.ok(range);
    // 00:00 IST = 18:30 UTC previous day; 24h later is exclusive end.
    assert.equal(range.from.toISOString(), "2026-09-30T18:30:00.000Z");
    assert.equal(range.to.toISOString(), "2026-10-01T18:30:00.000Z");
  });

  it("rejects malformed or impossible dates", () => {
    assert.equal(istDayRange("01-10-2026"), null);
    assert.equal(istDayRange(""), null);
    assert.equal(istDayRange("2026-13-40"), null);
  });
});

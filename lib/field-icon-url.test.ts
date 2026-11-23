import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanIconUri } from "./field-icon-url";

const id = "82d34f28-3dd0-4912-9f07-2e8cc807509f";

test("accepts icons uploaded to our own sites", () => {
  assert.equal(cleanIconUri(`https://skywin-field.qwicksapp.com/api/field/media/${id}`, "production"), `https://skywin-field.qwicksapp.com/api/field/media/${id}`);
  assert.equal(cleanIconUri(`https://skywin.qwicksapp.com/api/field/media/${id}`, "production"), `https://skywin.qwicksapp.com/api/field/media/${id}`);
  assert.equal(cleanIconUri(null, "production"), null);
  assert.equal(cleanIconUri("", "production"), null);
});

test("refuses other hosts, paths and http", () => {
  for (const bad of [
    `https://evil.com/api/field/media/${id}`,
    `http://skywin.qwicksapp.com/api/field/media/${id}`,
    `https://skywin.qwicksapp.com/api/field/media/${id}?x=1`,
    "https://skywin.qwicksapp.com/logo.png",
    "javascript:alert(1)",
    "not a url",
  ]) assert.throws(() => cleanIconUri(bad, "production"), /Upload the icon/, bad);
});

test("localhost only outside production", () => {
  assert.ok(cleanIconUri(`http://localhost:3005/api/field/media/${id}`, "development"));
  assert.throws(() => cleanIconUri(`http://localhost:3005/api/field/media/${id}`, "production"));
});

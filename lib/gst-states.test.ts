import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  stateCodeFromGstin,
  stateNameFromGstin,
  placeOfSupplyFromGstin,
} from "./gst-states";

describe("gst-states", () => {
  it("reads the state code from a GSTIN prefix", () => {
    assert.equal(stateCodeFromGstin("33AAECS1234F1Z5"), "33");
    assert.equal(stateCodeFromGstin("27ABCDE1234F1Z0"), "27");
  });

  it("returns '' for a missing or malformed GSTIN", () => {
    assert.equal(stateCodeFromGstin(""), "");
    assert.equal(stateCodeFromGstin(null), "");
    assert.equal(stateCodeFromGstin("XX1234"), "");
  });

  it("maps the code to a state name, with a fallback", () => {
    assert.equal(stateNameFromGstin("33AAECS1234F1Z5"), "Tamil Nadu");
    assert.equal(stateNameFromGstin("27ABCDE1234F1Z0"), "Maharashtra");
    assert.equal(stateNameFromGstin("", "Tamil Nadu"), "Tamil Nadu");
    assert.equal(stateNameFromGstin("99XXXXX", "Kerala"), "Kerala");
  });

  it("formats place of supply as 'Name (code)'", () => {
    assert.equal(
      placeOfSupplyFromGstin("33AAECS1234F1Z5", "Tamil Nadu", "33"),
      "Tamil Nadu (33)"
    );
    assert.equal(
      placeOfSupplyFromGstin("", "Tamil Nadu", "33"),
      "Tamil Nadu (33)"
    );
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import type { OfficerName } from "./field-officer-names";
import { matchFaUser, matchVillageOfficer } from "./village-officer";

const officers: OfficerName[] = [
  [13, "A. Arun Kumar"],
  [29, "D. Siva"],
  [31, "Elangovan"],
  [34, "G. Vinoth"],
  [35, "Gowtham"],
  [38, "J. Manigandan"],
  [45, "K. Suryaprakash"],
  [48, "M. Elango"],
  [50, "M. Mukesh"],
  [51, "M. Mukilan"],
  [54, "Manikandan"],
  [57, "N. Mahendran"],
  [58, "N. Sudhagar"],
  [61, "P Arul Jothi"],
  [62, "P. Balraj"],
  [79, "S. Alagar"],
  [81, "S. Jeevanandham"],
  [82, "S. Karthik"],
  [83, "S. Karthikeyan"],
  [84, "S. Manikandan"],
  [86, "S. Sivabalan"],
  [94, "Sivabalan"],
  [107, "V. Sanjay"],
  [109, "Venkatesan"],
  [21, "B. Sathishkumar"],
  [27, "C. Thanaseelan"],
].map(([id, name]) => ({ id: id as number, name: name as string }));

test("sheet field officers map to one sales officer account", () => {
  const expectId: Record<string, number | null> = {
    ALAGAR: 79,
    ARULJOTHI: 61,
    Arun: null,
    Balraj: 62,
    Elango: 48,
    GOWTHAM: 35,
    Jeevanantham: 81,
    Karthikeyan: 83,
    Mahendhiran: 57,
    Manikandan: 54,
    Mukesh: 50,
    Mukilan: 51,
    "New-1": null,
    "New-2": null,
    SUDHAKAR: 58,
    Sanjay: 107,
    Saranesh: null,
    Sathishkumar: 21,
    Siva: 29,
    Sivabalan: 94,
    Suriyaprakash: 45,
    Thanaseelan: 27,
    Venkatesan: 109,
    Vinoth: 34,
  };
  for (const [fa, id] of Object.entries(expectId)) {
    assert.equal(matchFaUser(fa, officers)?.id ?? null, id, fa);
  }
});

test("an exact unique PIN assigns that field officer", () => {
  const match = matchVillageOfficer("613705", "", officers);
  assert.equal(match?.exact, true);
  assert.equal(match?.faName, "Elango");
  assert.equal(match?.userId, 48);
  assert.equal(match?.userName, "M. Elango");
});

test("a shared PIN uses the village written in the address", () => {
  const arun = matchVillageOfficer("614302", "Eari", officers);
  assert.equal(arun?.faName, "Arun");
  assert.equal(arun?.userId, null);
  const arul = matchVillageOfficer("614302", "House in Edaieruppu", officers);
  assert.equal(arul?.faName, "ARULJOTHI");
  assert.equal(arul?.userId, 61);
});

test("a shared PIN with no village uses the officer who covers more villages", () => {
  const match = matchVillageOfficer("608304", "", officers);
  assert.equal(match?.exact, true);
  assert.equal(match?.faName, "New-1");
  assert.equal(match?.userId, null);
});

test("a PIN missing from the sheet uses the nearest PIN", () => {
  const match = matchVillageOfficer("613706", "", officers);
  assert.equal(match?.exact, false);
  assert.equal(match?.pin, "613705");
  assert.equal(match?.userId, 48);
});

test("a short PIN is not assigned", () => {
  assert.equal(matchVillageOfficer("61370", "", officers), null);
});

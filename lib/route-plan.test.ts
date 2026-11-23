import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceKm, googleMapsLegs, inIndia, loopKm, parseLatLng, planRoute } from "./route-plan";

const office = { lat: 10.9617, lng: 79.3881 };

test("reads coordinates and Google Maps links", () => {
  assert.deepEqual(parseLatLng("13.006766, 80.203465"), { lat: 13.006766, lng: 80.203465 });
  assert.deepEqual(parseLatLng("https://www.google.com/maps/@10.9617,79.3881,15z"), { lat: 10.9617, lng: 79.3881 });
  assert.deepEqual(parseLatLng("https://maps.google.com/?q=11.5,79.1"), { lat: 11.5, lng: 79.1 });
  assert.equal(parseLatLng(""), null);
  assert.equal(parseLatLng("0, 0"), null);
  assert.equal(parseLatLng("near the temple"), null);
  assert.equal(parseLatLng("95.1, 80.2"), null);
});

test("swapped coordinates are outside India", () => {
  assert.equal(inIndia({ lat: 10.96, lng: 79.38 }), true);
  assert.equal(inIndia({ lat: 79.38, lng: 10.96 }), false);
});

test("distance is about right", () => {
  // Kumbakonam to Thanjavur is roughly 37 km in a straight line.
  const d = distanceKm(office, { lat: 10.787, lng: 79.1378 });
  assert.ok(d > 30 && d < 40, String(d));
  assert.equal(distanceKm(office, office), 0);
});

test("route visits every stop once, office at both ends", () => {
  const stops = [
    { lat: 10.985, lng: 79.412 },
    { lat: 10.9201, lng: 79.35 },
    { lat: 11.0405, lng: 79.4302 },
    { lat: 10.8833, lng: 79.4011 },
    { lat: 10.9755, lng: 79.308 },
    { lat: 11.0102, lng: 79.3655 },
    { lat: 10.948, lng: 79.46 },
  ];
  const order = planRoute(office, stops);
  assert.deepEqual([...order].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6]);
  // Never worse than visiting in the given order.
  assert.ok(loopKm(office, order.map((i) => stops[i])) <= loopKm(office, stops) + 1e-9);
});

test("route along a road is not zig-zagged", () => {
  // Points on a line east of the office, given out of order: the best loop goes out and back.
  const stops = [3, 1, 4, 2, 5].map((k) => ({ lat: office.lat, lng: office.lng + k * 0.05 }));
  const order = planRoute(office, stops).map((i) => stops[i].lng);
  const outward = [...order].sort((a, b) => a - b);
  const inward = [...outward].reverse();
  assert.ok(JSON.stringify(order) === JSON.stringify(outward) || JSON.stringify(order) === JSON.stringify(inward));
});

test("no stops, one stop", () => {
  assert.deepEqual(planRoute(office, []), []);
  assert.deepEqual(planRoute(office, [{ lat: 11, lng: 79 }]), [0]);
  assert.equal(loopKm(office, []), 0);
});

test("Google Maps links split long routes into legs of 9 stops", () => {
  const stops = Array.from({ length: 20 }, (_, i) => ({ lat: 10.9 + i * 0.01, lng: 79.4 }));
  const legs = googleMapsLegs(office, stops);
  assert.equal(legs.length, 3);
  const first = new URL(legs[0]);
  assert.equal(first.searchParams.get("origin"), "10.9617,79.3881");
  assert.equal(first.searchParams.get("waypoints")!.split("|").length, 9);
  const last = new URL(legs[legs.length - 1]);
  assert.equal(last.searchParams.get("destination"), "10.9617,79.3881");
  // Each leg starts where the previous one ended.
  assert.equal(new URL(legs[1]).searchParams.get("origin"), first.searchParams.get("destination"));
  assert.deepEqual(googleMapsLegs(office, []), []);
});

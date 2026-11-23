/**
 * Delivery route for pending orders: starts at the SkyWin office, visits every stop once and
 * returns to the office. Pure (tested in lib/route-plan.test.ts).
 *
 * Method: nearest-neighbour from the office, then 2-opt (reverse any stretch that shortens the
 * loop) until nothing improves. Distances are straight-line (haversine); roads add roughly a
 * quarter to a third, so the page shows an estimate, and Google Maps gives the driving route.
 */

export type LatLng = { lat: number; lng: number };

/** "13.0068, 80.2034" or a Google Maps link containing "@13.0068,80.2034" / "q=13.0068,80.2034". */
export function parseLatLng(raw: string | null | undefined): LatLng | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const m = text.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

/** India (with a margin), to catch swapped or mistyped coordinates. */
export function inIndia(p: LatLng) {
  return p.lat >= 6 && p.lat <= 37.5 && p.lng >= 68 && p.lng <= 98;
}

/** Straight-line distance in kilometres. */
export function distanceKm(a: LatLng, b: LatLng) {
  const R = 6371.0088;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Length of office → stops (in order) → office. */
export function loopKm(office: LatLng, stops: LatLng[]) {
  if (!stops.length) return 0;
  let total = distanceKm(office, stops[0]);
  for (let i = 1; i < stops.length; i++) total += distanceKm(stops[i - 1], stops[i]);
  return total + distanceKm(stops[stops.length - 1], office);
}

/**
 * Visiting order (indexes into `stops`) for the shortest loop found from the office and back.
 * Stops at the same spot stay next to each other.
 */
export function planRoute(office: LatLng, stops: LatLng[]): number[] {
  const n = stops.length;
  if (n <= 1) return n ? [0] : [];

  // Node 0 is the office; stop i is node i + 1.
  const nodes = [office, ...stops];
  const d = nodes.map((a) => nodes.map((b) => distanceKm(a, b)));

  // Nearest neighbour.
  const route = [0];
  const left = new Set(Array.from({ length: n }, (_, i) => i + 1));
  while (left.size) {
    const last = route[route.length - 1];
    let best = -1;
    for (const j of left) if (best === -1 || d[last][j] < d[last][best] - 1e-12 || (Math.abs(d[last][j] - d[last][best]) <= 1e-12 && j < best)) best = j;
    route.push(best);
    left.delete(best);
  }
  route.push(0);

  // 2-opt on the closed loop (office fixed at both ends).
  let improved = true;
  let rounds = 0;
  while (improved && rounds < 200) {
    improved = false;
    rounds += 1;
    for (let i = 1; i < route.length - 2; i++) {
      for (let k = i + 1; k < route.length - 1; k++) {
        const a = route[i - 1];
        const b = route[i];
        const c = route[k];
        const e = route[k + 1];
        const delta = d[a][c] + d[b][e] - d[a][b] - d[c][e];
        if (delta < -1e-9) {
          // Reverse route[i..k].
          for (let lo = i, hi = k; lo < hi; lo++, hi--) [route[lo], route[hi]] = [route[hi], route[lo]];
          improved = true;
        }
      }
    }
  }
  return route.slice(1, -1).map((node) => node - 1);
}

/**
 * Google Maps driving directions, split into legs: Maps takes at most 9 stops between start and
 * end on phones, so a long route becomes several links (each leg starts where the last ended).
 */
export function googleMapsLegs(office: LatLng, orderedStops: LatLng[], perLeg = 9): string[] {
  if (!orderedStops.length) return [];
  const pt = (p: LatLng) => `${p.lat},${p.lng}`;
  const points = [office, ...orderedStops, office];
  const legs: string[] = [];
  const size = perLeg + 1; // waypoints plus the destination
  for (let start = 0; start < points.length - 1; start += size) {
    const end = Math.min(start + size, points.length - 1);
    const origin = points[start];
    const destination = points[end];
    const waypoints = points.slice(start + 1, end);
    const params = new URLSearchParams({ api: "1", origin: pt(origin), destination: pt(destination), travelmode: "driving" });
    if (waypoints.length) params.set("waypoints", waypoints.map(pt).join("|"));
    legs.push(`https://www.google.com/maps/dir/?${params.toString()}`);
  }
  return legs;
}

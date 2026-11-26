/** Display order on the Field dashboard (Raja, 24 Nov 2026). Pure; tested in lib/field-catalog-order.test.ts. */

export type MoveDirection = "up" | "down" | "top" | "bottom";

/**
 * Moves one id within an ordered list. Returns the new order, or null when it can't move
 * (unknown id, or already first/last). Pure; exported for tests.
 */
export function movedOrder<T>(ids: T[], id: T, direction: MoveDirection): T[] | null {
  const from = ids.indexOf(id);
  if (from < 0) return null;
  const last = ids.length - 1;
  const to =
    direction === "up" ? from - 1 : direction === "down" ? from + 1 : direction === "top" ? 0 : last;
  if (to < 0 || to > last || to === from) return null;
  const next = ids.slice();
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/**
 * Units of measurement for a product. "Gram" and "Metre" are the ones the
 * client bills by weight/length: the product rate is stored per gram / per
 * metre, and at sale time the operator enters the weight/length as the
 * quantity, so line value = quantity x rate (no conversion layer).
 */
export const UNIT_OPTIONS = [
  "Pcs",
  "Gram",
  "Kg",
  "Metre",
  "Ml",
  "Litre",
  "Packet",
  "Bag",
] as const;

export type Unit = (typeof UNIT_OPTIONS)[number];

/** Units whose quantity is a measured weight/length rather than a piece count. */
const MEASURED = new Set(["gram", "metre", "meter", "ml", "litre", "kg"]);

export function isMeasuredUnit(unit: string | null | undefined): boolean {
  return MEASURED.has((unit ?? "").trim().toLowerCase());
}

/** Label for the POS quantity field, e.g. "Weight (Gram)" for a gram product. */
export function qtyFieldLabel(unit: string | null | undefined): string {
  const u = (unit ?? "").trim().toLowerCase();
  if (u === "gram" || u === "kg") return `Weight (${unit})`;
  if (u === "metre" || u === "meter") return `Length (${unit})`;
  if (u === "ml" || u === "litre") return `Volume (${unit})`;
  return "Quantity";
}

/** Parse a quantity string for the given unit; measured units keep 2 decimals. */
export function parseQtyInput(raw: string, unit: string | null | undefined): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return isMeasuredUnit(unit) ? Math.round(n * 100) / 100 : Math.round(n);
}

/** Display a quantity with its unit, e.g. "500 Gram" or "3 Pcs". */
export function formatQtyWithUnit(
  qty: number | string,
  unit: string | null | undefined
): string {
  const n = typeof qty === "number" ? qty : parseFloat(qty);
  const safe = Number.isFinite(n) ? n : 0;
  const shown = isMeasuredUnit(unit)
    ? String(Math.round(safe * 100) / 100)
    : String(Math.round(safe));
  return `${shown} ${(unit ?? "Pcs").trim() || "Pcs"}`;
}

/**
 * Unit label without any embedded pack quantity, for exports that have a
 * separate Quantity column (e.g. Tally): "500 GM" → "GM", "16LTR" → "LTR",
 * "50 KG" → "KG", while plain units ("Pcs", "Gram") pass through
 * untouched. Never invents data: unparseable input comes back as-is.
 */
export function unitWithoutQuantity(unit: string | null | undefined): string {
  const raw = (unit ?? "").trim();
  if (!raw) return "pcs";
  const stripped = raw.replace(/^[\d\s.,×xX/\-]+/, "").trim();
  return stripped || raw;
}

/** Long unit words → the 3-letter GST UQC the portal accepts. */
const PER_UNIT_SHORT: Record<string, string> = {
  GRAM: "GMS",
  GRAMS: "GMS",
  GRMS: "GMS",
  KGS: "KGS",
  METRE: "MTR",
  METER: "MTR",
  METRES: "MTR",
  METERS: "MTR",
  LITRE: "LTR",
  LITER: "LTR",
  LITRES: "LTR",
  PACKET: "PAC",
  PACKETS: "PAC",
  PIECES: "PCS",
  PIECE: "PCS",
};

/**
 * Invoice "per" column (Raja, 30 Oct 2026): the GST portal accepts at most
 * 3 characters, so drop any pack quantity ("54 SQF" → "SQF", "500 GM" →
 * "GM") and turn known long unit words into their UQC ("Gram" → "GMS",
 * "Metre" → "MTR", "Litre" → "LTR"). Unknown words are left as-is rather
 * than cut off.
 */
export function invoicePerUnit(unit: string | null | undefined): string {
  const base = unitWithoutQuantity(unit || "PCS").toUpperCase().replace(/\.$/, "").trim();
  if (base.length <= 3) return base;
  return PER_UNIT_SHORT[base] ?? base;
}

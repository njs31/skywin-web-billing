/**
 * Turn a scanned string into the things it might identify.
 *
 * A barcode scanner is a keyboard: it types whatever is under the beam and
 * presses Enter. What it types is one of three things — a manufacturer's
 * barcode, the shop's own SKU, or the `SW000123` code our labels print for a
 * product that has neither — and telling them apart is the whole job here.
 */

/**
 * Largest value that can be a product id.
 *
 * `products.id` is a Postgres `serial`, which is int4. Drizzle sends `id = $1`
 * as a bound parameter typed from the column, so handing it anything larger
 * raises "value out of range for type integer" rather than simply not
 * matching. A 13-digit EAN is larger, which is how scanning an ordinary retail
 * barcode used to fail: the query threw, and the scan appeared to do nothing.
 */
export const MAX_PRODUCT_ID = 2147483647;

export type ScanCode = {
  /** The trimmed text, to match against barcode, SKU and name. */
  text: string;
  /** A product id, when the code can be one at all. */
  id: number | null;
};

export function parseScanCode(raw: string): ScanCode {
  const text = raw.trim();
  if (!text) return { text: "", id: null };

  // "SW000123" is what a label prints for a product with no barcode or SKU.
  // "SW-123" and a bare number are what people type by hand.
  const match = text.match(/^SW-?(\d+)$/i) ?? text.match(/^(\d+)$/);
  const parsed = match ? Number.parseInt(match[1]!, 10) : Number.NaN;
  const id =
    Number.isSafeInteger(parsed) && parsed > 0 && parsed <= MAX_PRODUCT_ID
      ? parsed
      : null;

  return { text, id };
}

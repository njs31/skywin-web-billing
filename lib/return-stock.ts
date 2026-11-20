/**
 * Stock rows of type "return" are not all sales returns.
 *
 * Invoice edits and cancellations write type "return" with the sale id.
 * Debit notes write type "return" with the purchase-return id, as a negative
 * quantity. Those ids come from their own sequences, so they collide with a
 * credit note that happens to have the same number. Reversing "every return
 * row with this id" then deducts stock the credit note never added, the save
 * throws, and production replaces the real message with the Server Components
 * notice.
 */

export function saleCancellationStockNote(invoiceNo: string) {
  return `Cancellation of ${invoiceNo}`;
}

export function saleEditRestoreStockNote(invoiceNo: string) {
  return `Edit of ${invoiceNo} (restore)`;
}

export function isSaleRestoreNote(notes: string | null | undefined) {
  const text = notes?.trim() ?? "";
  if (text.startsWith("Cancellation of ")) return true;
  return text.startsWith("Edit of ") && text.endsWith("(restore)");
}

/** True only for stock this credit note itself added. */
export function isSaleReturnStockMovement(mov: {
  notes: string | null | undefined;
  qtyDelta: string | number;
}) {
  const qty =
    typeof mov.qtyDelta === "number" ? mov.qtyDelta : parseFloat(mov.qtyDelta);
  if (!(qty > 0)) return false;
  if (isSaleRestoreNote(mov.notes)) return false;
  return true;
}

const REDACTED =
  /Failed query:|current transaction is aborted|Server Components render|duplicate key|syntax error at/i;

/**
 * Values returned from a server action are not redacted. Thrown errors are,
 * so the edit form must receive this string instead of `error.message`.
 */
export function clientSafeReturnError(err: unknown): string {
  const messages: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current && depth < 8; depth++) {
    if ((current as { name?: string }).name === "ZodError") {
      return "Could not save this return. Check the quantities and try again.";
    }
    if (current instanceof Error) messages.push(current.message);
    else if (typeof current === "string") messages.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  const friendly = messages.find((message) => message.trim() && !REDACTED.test(message));
  return friendly ?? "Could not save this return. Nothing was changed.";
}

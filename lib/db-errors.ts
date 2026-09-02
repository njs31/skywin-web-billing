/**
 * Did this come from a unique constraint?
 *
 * The driver wraps the Postgres error rather than throwing it: the Error you
 * catch says `Failed query: insert into "suppliers" ...`, and the part that
 * names the problem — SQLSTATE 23505 and the constraint — sits on `cause`.
 *
 * Checking only the top-level message, which is what this replaces, never
 * matched. So adding a supplier that already existed threw the raw database
 * error instead of "already exists", and Next.js masked it in production as
 * "An error occurred in the Server Components render" — a message that tells
 * the shop nothing and sends whoever debugs it looking at rendering.
 */
export function isUniqueViolation(error: unknown): boolean {
  // Bounded, because an error chain can loop back on itself.
  let current: unknown = error;
  for (let depth = 0; current && depth < 8; depth++) {
    if ((current as { code?: unknown }).code === "23505") return true;

    const message =
      current instanceof Error
        ? current.message
        : typeof current === "string"
          ? current
          : "";
    if (/duplicate key|unique constraint/i.test(message)) return true;

    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

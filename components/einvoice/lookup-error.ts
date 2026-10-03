/**
 * Translate a lookup failure into short UI text. Production builds redact
 * thrown server-action messages ("An error occurred in the Server
 * Components render…"), so showing `error.message` verbatim produces the
 * mystery blob — map the known cases instead.
 */
export function friendlyLookupError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/4005|details are not found/i.test(message)) {
    return "No record found linked to this IRN on the portal.";
  }
  if (/2148|not available/i.test(message)) {
    return "No record found linked to this IRN on the portal.";
  }
  if (/Server Components render/i.test(message)) {
    return "Verification failed — try again.";
  }
  return message || "Verification failed — try again.";
}

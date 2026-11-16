/** Sales officers only see farmers assigned to them. Admins and regional managers see every farmer. */
export function fieldOfficerSeesOwnFarmers(role: string | null | undefined) {
  return role === "sales_officer";
}

/** Compare sheet spellings such as "S.ALAGAR . KARTHIK" with "S. Alagar". */
export function officerMatchKey(value: string) {
  return value.toUpperCase().trim().replace(/\s+/g, " ").replace(/\s*\.\s*/g, ".");
}

export type OfficerName = { id: number; name: string };

/**
 * The Employee cell is the field officer, often followed by a manager.
 * The longest officer name that matches the start of the cell wins.
 * The next character must be the end, a dot, or a space, so "S. Karthik"
 * does not take "S. Karthikeyan".
 */
export function matchOfficerId(raw: string, officers: OfficerName[]) {
  const key = officerMatchKey(raw);
  if (!key) return null;
  let best: { id: number; length: number } | null = null;
  for (const officer of officers) {
    const officerKey = officerMatchKey(officer.name);
    if (!officerKey) continue;
    if (key === officerKey) return officer.id;
    const next = key[officerKey.length];
    const boundary = key.startsWith(officerKey) && (next === "." || next === " ");
    if (boundary && (!best || officerKey.length > best.length)) {
      best = { id: officer.id, length: officerKey.length };
    }
  }
  return best?.id ?? null;
}

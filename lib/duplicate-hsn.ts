/** Shared key for comparing HSN codes. Blank codes are not duplicates. */
export function hsnKey(code: string | null | undefined) {
  return (code ?? "").trim().toUpperCase();
}

/** HSN codes that appear on more than one product. */
export function duplicateHsnKeys(codes: (string | null | undefined)[]) {
  const counts = new Map<string, number>();
  for (const code of codes) {
    const key = hsnKey(code);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const [key, count] of counts) {
    if (count > 1) duplicates.add(key);
  }
  return duplicates;
}

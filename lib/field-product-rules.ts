/** Written farmer-facing details. A photo alone does not complete the product. */
export function fieldDetailGaps(input: {
  description?: string | null;
  activeIngredient?: string | null;
  usageCount?: number;
  usage?: Array<{ crop?: string; pest?: string }> | null;
}) {
  const gaps: string[] = [];
  if (!(input.description ?? "").trim()) gaps.push("description");
  const usageCount =
    input.usageCount ??
    (input.usage ?? []).filter((row) => (row.crop ?? "").trim() || (row.pest ?? "").trim()).length;
  if (!(input.activeIngredient ?? "").trim() && usageCount === 0) gaps.push("ingredient or usage");
  return gaps;
}

export function fieldDetailHasPhoto(images?: string[] | null) {
  return (images ?? []).some((src) => src.trim());
}

export function httpUrlError(value: string) {
  const next = value.trim();
  if (!next) return "";
  if (!/^https?:\/\//i.test(next)) return "Use a link that starts with http:// or https://.";
  return "";
}

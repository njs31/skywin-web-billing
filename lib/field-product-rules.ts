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

/** Blank means no limit. A set quantity is a positive number with up to 2 decimal places. */
export function parseOrderQty(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return { value: null as string | null, error: "" };
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(trimmed) || Number(trimmed) <= 0) {
    return { value: null, error: "Use a number greater than zero, with up to 2 decimal places." };
  }
  return { value: trimmed, error: "" };
}

export function orderQtyPairError(min: string, max: string) {
  const low = parseOrderQty(min);
  const high = parseOrderQty(max);
  if (low.error) return `Minimum order quantity: ${low.error}`;
  if (high.error) return `Maximum order quantity: ${high.error}`;
  if (low.value != null && high.value != null && Number(low.value) > Number(high.value)) {
    return "Minimum order quantity cannot be higher than the maximum.";
  }
  return "";
}

export function applicableCrops(
  crops: string | null | undefined,
  usage: Array<{ crop?: string | null }> | null | undefined
) {
  const written = (crops ?? "")
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const fromUsage = (usage ?? []).map((row) => (row.crop ?? "").trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const crop of [...written, ...fromUsage]) {
    const key = crop.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(crop);
  }
  return out;
}

export function usageInstructionLines(
  usage: Array<{
    crop?: string | null;
    pest?: string | null;
    perHectare?: string | null;
    perAcre?: string | null;
  }> | null | undefined
) {
  return (usage ?? [])
    .map((row) => {
      const target = [(row.crop ?? "").trim(), (row.pest ?? "").trim()].filter(Boolean).join(" · ");
      const dose = [
        (row.perAcre ?? "").trim() ? `${(row.perAcre ?? "").trim()} / acre` : "",
        (row.perHectare ?? "").trim() ? `${(row.perHectare ?? "").trim()} / ha` : "",
      ].filter(Boolean).join(", ");
      return [target, dose].filter(Boolean).join(" — ");
    })
    .filter(Boolean);
}

export function formatInr(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatGst(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  const rate = Number(value);
  if (!Number.isFinite(rate)) return "—";
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(rate)}%`;
}

export function formatQty(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  const qty = Number(value);
  if (!Number.isFinite(qty)) return "—";
  return qty.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function qtyInput(value: string | null | undefined) {
  if (value == null || value === "") return "";
  const qty = Number(value);
  return Number.isFinite(qty) ? String(qty) : "";
}

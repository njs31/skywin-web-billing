import { applicableCrops } from "@/lib/field-product-rules";

export const HOME_SUGGESTION_MIN = 4;
export const HOME_SUGGESTION_MAX = 10;
export const HOME_SUGGESTION_TTL_MS = 6 * 60 * 60 * 1000;

export const HOME_SUGGESTION_SOURCES = ["buy_again", "crop", "nearby", "bestsellers"] as const;
export type HomeSuggestionSource = (typeof HOME_SUGGESTION_SOURCES)[number];

export function cropKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

/** Last 6 digits. Shorter values are not a PIN. */
export function pinCode(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 6) return "";
  return digits.slice(-6);
}

export function uniquePins(values: Array<string | null | undefined>) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const pin = pinCode(value);
    if (!pin || seen.has(pin)) continue;
    seen.add(pin);
    out.push(pin);
  }
  return out;
}

type TaggedProduct = {
  id: number;
  crops: string | null;
  usage: Array<{ crop?: string | null }> | null;
};

/**
 * Products tagged for the farmer's crops, in the given order.
 * An empty profile, or a catalogue with no crop tags, returns nothing.
 */
export function cropSuggestionIds(products: TaggedProduct[], farmerCrops: string[]) {
  const wanted = new Set(farmerCrops.map(cropKey).filter(Boolean));
  if (wanted.size === 0) return [];
  const tagged = products.filter((product) => applicableCrops(product.crops, product.usage).length > 0);
  if (tagged.length === 0) return [];
  return tagged
    .filter((product) => applicableCrops(product.crops, product.usage).some((crop) => wanted.has(cropKey(crop))))
    .map((product) => product.id);
}

/** First source with at least 4 products. Each list is capped at 10. */
export function pickSuggestionSource<T extends { source: HomeSuggestionSource; ids: number[] }>(
  sources: T[]
): { source: HomeSuggestionSource; ids: number[] } | null {
  for (const row of sources) {
    const ids: number[] = [];
    const seen = new Set<number>();
    for (const id of row.ids) {
      if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (ids.length === HOME_SUGGESTION_MAX) break;
    }
    if (ids.length >= HOME_SUGGESTION_MIN) return { source: row.source, ids };
  }
  return null;
}

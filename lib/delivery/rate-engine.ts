/**
 * Delivery rate engine for the Field app (spec: "Weight & PIN-code based Delivery Rate
 * Configuration"). Pure: unit-tested in lib/delivery/rate-engine.test.ts.
 *
 * A rate rule = weight band (min..max grams, inclusive) + destination + fee for the whole order.
 * Destination, most specific first: PIN codes → districts → states → regions (a group of
 * states, e.g. "north-east") → default (a rule with no destination, "rest of India").
 * The order's total weight picks the band. Heavier than every band for a destination: the
 * heaviest band's fee per band-weight (e.g. 2.4 kg on a 1 kg band = 3 × fee).
 */

export type RateRule = {
  id: number;
  slab: string;
  minWeightGrams: number;
  maxWeightGrams: number;
  zoneName: string;
  transitDays: string;
  shippingFee: number;
  pincodes: string | null;
  districts: string | null;
  states: string | null;
  isActive: boolean;
};

export type Place = { pin: string; district: string; state: string };

export type RatePick = {
  rule: RateRule;
  amount: number;
  matchedBy: "pin" | "district" | "state" | "region" | "default";
  multiplier: number;
};

/** Named groups of states that a rule can target in its States field. */
export const REGIONS: Record<string, string[]> = {
  "north-east": ["arunachal pradesh", "assam", "manipur", "meghalaya", "mizoram", "nagaland", "tripura"],
  "south india": ["tamil nadu", "kerala", "karnataka", "andhra pradesh", "telangana", "puducherry"],
  "north india": ["delhi", "haryana", "punjab", "himachal pradesh", "jammu and kashmir", "ladakh", "uttarakhand", "uttar pradesh", "chandigarh", "rajasthan"],
};

/** Delhivery and India Post send state codes; rules use names. */
const STATE_CODES: Record<string, string> = {
  AN: "andaman and nicobar islands", AP: "andhra pradesh", AR: "arunachal pradesh", AS: "assam", BR: "bihar",
  CH: "chandigarh", CG: "chhattisgarh", CT: "chhattisgarh", DN: "dadra and nagar haveli and daman and diu",
  DD: "dadra and nagar haveli and daman and diu", DL: "delhi", GA: "goa", GJ: "gujarat", HR: "haryana",
  HP: "himachal pradesh", JK: "jammu and kashmir", JH: "jharkhand", KA: "karnataka", KL: "kerala", LA: "ladakh",
  LD: "lakshadweep", MP: "madhya pradesh", MH: "maharashtra", MN: "manipur", ML: "meghalaya", MZ: "mizoram",
  NL: "nagaland", OD: "odisha", OR: "odisha", PY: "puducherry", PB: "punjab", RJ: "rajasthan", SK: "sikkim",
  TN: "tamil nadu", TS: "telangana", TG: "telangana", TR: "tripura", UP: "uttar pradesh", UK: "uttarakhand",
  UT: "uttarakhand", WB: "west bengal",
};

/** Spellings that mean the same place. Keys and values are normalised. */
const ALIASES: Record<string, string> = {
  "thoothukudi": "tuticorin",
  "bengaluru": "bangalore",
  "bengaluru urban": "bangalore urban",
  "bengaluru rural": "bangalore rural",
  "kanchipuram": "kancheepuram",
  "tiruvallur": "thiruvallur",
  "pondicherry": "puducherry",
  "chattisgarh": "chhattisgarh",
  "orissa": "odisha",
  "new delhi": "delhi",
  "northeast": "north-east",
  "north east": "north-east",
  "trichy": "tiruchirappalli",
  "tiruchirapalli": "tiruchirappalli",
  "nilgiris": "the nilgiris",
};

export function normPlace(raw: string | null | undefined) {
  const s = String(raw ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 -]/g, " ").replace(/\s+/g, " ").trim();
  return ALIASES[s] ?? s;
}

export function stateName(raw: string | null | undefined) {
  const code = String(raw ?? "").trim().toUpperCase();
  return STATE_CODES[code] ?? normPlace(raw);
}

function list(raw: string | null | undefined) {
  return String(raw ?? "")
    .split(",")
    .map((part) => normPlace(part))
    .filter(Boolean);
}

function pins(raw: string | null | undefined) {
  return String(raw ?? "")
    .split(/[^0-9]+/)
    .filter((p) => p.length === 6);
}

/** How a rule matches this place, or null. */
function matchLevel(rule: RateRule, place: Place): RatePick["matchedBy"] | null {
  const rulePins = pins(rule.pincodes);
  const ruleDistricts = list(rule.districts);
  const ruleStates = list(rule.states);
  if (!rulePins.length && !ruleDistricts.length && !ruleStates.length) return "default";
  if (place.pin && rulePins.includes(place.pin)) return "pin";
  const district = normPlace(place.district);
  if (district && ruleDistricts.includes(district)) return "district";
  const state = stateName(place.state);
  if (state && ruleStates.includes(state)) return "state";
  if (state && ruleStates.some((name) => REGIONS[name]?.includes(state))) return "region";
  return null;
}

const LEVELS: RatePick["matchedBy"][] = ["pin", "district", "state", "region", "default"];

/**
 * The fee for an order of `grams` to `place`. A band that covers the weight wins over a more
 * specific destination without one; with no covering band, the most specific destination's
 * heaviest band is scaled. Null when no active rule matches at all.
 */
export function pickRate(rules: RateRule[], place: Place, grams: number): RatePick | null {
  const weight = Math.max(1, Math.round(grams));
  const active = rules.filter((r) => r.isActive);
  const matched = active
    .map((rule) => ({ rule, level: matchLevel(rule, place) }))
    .filter((m): m is { rule: RateRule; level: RatePick["matchedBy"] } => m.level !== null);
  if (!matched.length) return null;

  const covers = (r: RateRule) => weight >= r.minWeightGrams && weight <= r.maxWeightGrams;
  for (const level of LEVELS) {
    const hit = matched.find((m) => m.level === level && covers(m.rule));
    if (hit) return { rule: hit.rule, amount: Math.ceil(hit.rule.shippingFee), matchedBy: level, multiplier: 1 };
  }

  // No band covers this weight: use the most specific destination's nearest band.
  for (const level of LEVELS) {
    const forLevel = matched.filter((m) => m.level === level).map((m) => m.rule);
    if (!forLevel.length) continue;
    const heaviest = forLevel.reduce((a, b) => (b.maxWeightGrams > a.maxWeightGrams ? b : a));
    if (weight > heaviest.maxWeightGrams) {
      const multiplier = Math.ceil(weight / Math.max(1, heaviest.maxWeightGrams));
      return { rule: heaviest, amount: Math.ceil(heaviest.shippingFee * multiplier), matchedBy: level, multiplier };
    }
    const lightest = forLevel.reduce((a, b) => (b.minWeightGrams < a.minWeightGrams ? b : a));
    return { rule: lightest, amount: Math.ceil(lightest.shippingFee), matchedBy: level, multiplier: 1 };
  }
  return null;
}

/**
 * Splits a GST-inclusive shipping amount across the order's GST rates in proportion to the
 * value of the goods at each rate (spec: shipping follows the product's GST). Rupees, 2 dp;
 * the parts always add up to the amount.
 */
export function splitShippingByGst(amount: number, lines: Array<{ gstRate: number; value: number }>) {
  const total = Math.round(amount * 100);
  if (total <= 0) return [];
  const byRate = new Map<number, number>();
  for (const line of lines) {
    const rate = Number(line.gstRate) || 0;
    byRate.set(rate, (byRate.get(rate) ?? 0) + Math.max(0, line.value));
  }
  const groups = [...byRate.entries()].sort((a, b) => a[0] - b[0]);
  const goods = groups.reduce((sum, [, v]) => sum + v, 0);
  if (!groups.length || goods <= 0) return [{ gstRate: groups[0]?.[0] ?? 18, amount: total / 100 }];
  let left = total;
  return groups.map(([gstRate, value], i) => {
    const paise = i === groups.length - 1 ? left : Math.round((total * value) / goods);
    left -= paise;
    return { gstRate, amount: paise / 100 };
  }).filter((part) => part.amount > 0);
}

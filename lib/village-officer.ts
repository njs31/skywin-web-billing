import { officerMatchKey, type OfficerName } from "./field-officer-names";
import { VILLAGE_PINS, type VillagePin } from "./village-pins";

/**
 * Sheet spellings that are the same officer as a saved user, written differently.
 * The value is the compact name (initials removed, letters only).
 */
const FA_ALIASES: Record<string, string> = {
  JEEVANANTHAM: "JEEVANANDHAM",
  SURIYAPRAKASH: "SURYAPRAKASH",
  MAHENDHIRAN: "MAHENDRAN",
  SUDHAKAR: "SUDHAGAR",
};

export type VillageOfficerMatch = {
  pin: string;
  exact: boolean;
  faName: string;
  soName: string;
  userId: number | null;
  userName: string | null;
};

function digitsPin(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 6 ? digits.slice(0, 6) : digits;
}

function normPhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsPhrase(haystack: string, needle: string) {
  const phrase = normPhrase(needle);
  if (!phrase) return false;
  return ` ${normPhrase(haystack)} `.includes(` ${phrase} `);
}

/** Drop single-letter initials so "P Arul Jothi" compares as ARULJOTHI. */
export function compactOfficerName(name: string) {
  const parts = officerMatchKey(name)
    .split(/[^A-Z0-9]+/)
    .filter((part) => part.length > 1);
  return parts.join("");
}

function usersNamed(key: string, officers: OfficerName[]) {
  const exact = officers.filter((officer) => officerMatchKey(officer.name) === key);
  if (exact.length) return exact;
  const compact = officers.filter((officer) => compactOfficerName(officer.name) === key);
  if (compact.length) return compact;
  return officers.filter((officer) => {
    const parts = officerMatchKey(officer.name).split(/[^A-Z0-9]+/).filter(Boolean);
    return parts[parts.length - 1] === key;
  });
}

/** One sales-officer user for a sheet field-officer name, or null when several fit. */
export function matchFaUser(faName: string, officers: OfficerName[]) {
  const key = compactOfficerName(faName) || officerMatchKey(faName).replace(/[^A-Z0-9]/g, "");
  if (!key) return null;
  const keys = [key, FA_ALIASES[key]].filter((item): item is string => !!item);
  for (const candidate of keys) {
    const hits = usersNamed(candidate, officers);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  return null;
}

function rowsForPin(pin: string) {
  const exact = VILLAGE_PINS.filter((row) => row.pin === pin);
  if (exact.length) return { rows: exact, exact: true };
  const target = Number(pin);
  let best = Number.POSITIVE_INFINITY;
  const pins = new Set<string>();
  for (const row of VILLAGE_PINS) {
    const distance = Math.abs(Number(row.pin) - target);
    if (distance < best) {
      best = distance;
      pins.clear();
      pins.add(row.pin);
    } else if (distance === best) {
      pins.add(row.pin);
    }
  }
  return { rows: VILLAGE_PINS.filter((row) => pins.has(row.pin)), exact: false };
}

function narrowByAddress(rows: VillagePin[], address: string) {
  const hits = rows.filter((row) => containsPhrase(address, row.village));
  if (!hits.length) return rows;
  const longest = Math.max(...hits.map((row) => normPhrase(row.village).length));
  return hits.filter((row) => normPhrase(row.village).length === longest);
}

function chooseFa(rows: VillagePin[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.fa, (counts.get(row.fa) ?? 0) + 1);
  const [fa] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return rows.find((row) => row.fa === fa) ?? rows[0];
}

/**
 * Exact PIN when the sheet has it, otherwise the numerically closest PIN.
 * A village named in the address wins over other officers who share that PIN.
 * A shared PIN with no village uses the officer who covers the most villages there.
 */
export function matchVillageOfficer(
  pin: string,
  address: string,
  officers: OfficerName[]
): VillageOfficerMatch | null {
  const clean = digitsPin(pin);
  if (!/^\d{6}$/.test(clean) || VILLAGE_PINS.length === 0) return null;
  const found = rowsForPin(clean);
  const pool = narrowByAddress(found.rows, address);
  if (!pool.length) return null;
  const row = chooseFa(pool);
  const user = matchFaUser(row.fa, officers);
  return {
    pin: row.pin,
    exact: found.exact,
    faName: row.fa,
    soName: row.so,
    userId: user?.id ?? null,
    userName: user?.name ?? null,
  };
}

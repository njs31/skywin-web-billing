import { db } from "@/db";
import { shippingRates, shippingSettings } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  SHIPPING_CHECKPOINTS,
  type ShippingCheckpoint,
  type ShippingProviderMode,
} from "./shipping-constants";

export { SHIPPING_CHECKPOINTS, type ShippingCheckpoint, type ShippingProviderMode };

/**
 * Get active shipping provider from settings (defaults to 'manual')
 */
export async function getShippingProvider(): Promise<ShippingProviderMode> {
  try {
    const [row] = await db
      .select({ provider: shippingSettings.provider })
      .from(shippingSettings)
      .where(eq(shippingSettings.id, 1))
      .limit(1);

    if (row?.provider === "delhivery" || row?.provider === "manual") {
      return row.provider;
    }
    return "manual";
  } catch (err) {
    console.error("[getShippingProvider] error:", err);
    return "manual";
  }
}

/**
 * Switch active shipping provider ('manual' vs 'delhivery')
 */
export async function setShippingProvider(
  provider: ShippingProviderMode,
  updatedBy: string = "dashboard"
): Promise<{ success: boolean; provider: ShippingProviderMode }> {
  const mode: ShippingProviderMode = provider === "delhivery" ? "delhivery" : "manual";
  try {
    await db
      .insert(shippingSettings)
      .values({
        id: 1,
        provider: mode,
        updatedAt: new Date(),
        updatedBy,
      })
      .onConflictDoUpdate({
        target: shippingSettings.id,
        set: {
          provider: mode,
          updatedAt: new Date(),
          updatedBy,
        },
      });

    // Also update settings table for backward compatibility
    await db.execute(sql`
      INSERT INTO settings (key, value)
      VALUES ('shipping_provider', ${mode})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    `);

    return { success: true, provider: mode };
  } catch (err) {
    console.error("[setShippingProvider] error:", err);
    throw new Error(err instanceof Error ? err.message : "Failed to update shipping provider");
  }
}

/**
 * Quick mapping of Indian PIN 2-3 digit prefixes to states and key districts.
 */
function resolveLocationFromPin(pin: string): { district: string; state: string } {
  const code = pin.replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) return { district: "", state: "" };

  const p3 = code.slice(0, 3);
  const p2 = code.slice(0, 2);

  // Delhi
  if (p2 === "11") return { district: "delhi", state: "delhi" };

  // Haryana / Punjab / Chandigarh
  if (p2 === "12" || p2 === "13") return { district: "haryana", state: "haryana" };
  if (p2 === "14" || p2 === "15") return { district: "punjab", state: "punjab" };
  if (p3 === "160") return { district: "chandigarh", state: "chandigarh" };

  // Himachal / J&K / Uttarakhand
  if (p2 === "17") return { district: "himachal pradesh", state: "himachal pradesh" };
  if (p2 === "18" || p2 === "19") return { district: "jammu and kashmir", state: "jammu and kashmir" };
  if (p2 === "24" || p2 === "26") return { district: "uttarakhand", state: "uttarakhand" };

  // Uttar Pradesh
  if (["20", "21", "22", "23", "25", "27", "28"].includes(p2)) return { district: "uttar pradesh", state: "uttar pradesh" };

  // Rajasthan
  if (["30", "31", "32", "33", "34"].includes(p2)) return { district: "rajasthan", state: "rajasthan" };

  // Gujarat
  if (["36", "37", "38", "39"].includes(p2)) return { district: "gujarat", state: "gujarat" };

  // Maharashtra
  if (p3 === "400") return { district: "mumbai", state: "maharashtra" };
  if (p3 === "401") return { district: "thane", state: "maharashtra" };
  if (p3 === "411") return { district: "pune", state: "maharashtra" };
  if (p3 === "415") return { district: "satara", state: "maharashtra" };
  if (p3 === "416") return { district: "kolhapur", state: "maharashtra" };
  if (p3 === "422") return { district: "nashik", state: "maharashtra" };
  if (p3 === "431") return { district: "aurangabad", state: "maharashtra" };
  if (p3 === "440" || p3 === "441") return { district: "nagpur", state: "maharashtra" };
  if (["40", "41", "42", "43", "44"].includes(p2)) return { district: "maharashtra", state: "maharashtra" };

  // Goa
  if (p3 === "403") return { district: "panjim", state: "goa" };

  // MP / Chhattisgarh
  if (["45", "46", "47", "48"].includes(p2)) return { district: "madhya pradesh", state: "madhya pradesh" };
  if (p2 === "49") return { district: "chattisgarh", state: "chattisgarh" };

  // Andhra Pradesh & Telangana
  if (p3 === "500" || p3 === "501") return { district: "hyderabad", state: "andhra pradesh" };
  if (p3 === "515") return { district: "ananthapur", state: "andhra pradesh" };
  if (p3 === "517") return { district: "chittoor", state: "andhra pradesh" };
  if (p3 === "518") return { district: "kurnool", state: "andhra pradesh" };
  if (p3 === "523") return { district: "prakasam", state: "andhra pradesh" };
  if (p3 === "524") return { district: "nellore", state: "andhra pradesh" };
  if (p3 === "520" || p3 === "521") return { district: "krishna", state: "andhra pradesh" };
  if (p3 === "522") return { district: "guntur", state: "andhra pradesh" };
  if (p3 === "530" || p3 === "531") return { district: "visakhapatnam", state: "andhra pradesh" };
  if (["50", "51", "52", "53"].includes(p2)) return { district: "andhra pradesh", state: "andhra pradesh" };

  // Karnataka
  if (p3 === "560") return { district: "bangalore", state: "karnataka" };
  if (p3 === "561") return { district: "bangalore rural", state: "karnataka" };
  if (p3 === "562") return { district: "chikkaballapur", state: "karnataka" };
  if (p3 === "563") return { district: "kolar", state: "karnataka" };
  if (p3 === "572") return { district: "tumkur", state: "karnataka" };
  if (p3 === "570" || p3 === "571") return { district: "mysore", state: "karnataka" };
  if (p3 === "575") return { district: "mangalore", state: "karnataka" };
  if (["56", "57", "58", "59"].includes(p2)) return { district: "karnataka", state: "karnataka" };

  // Chennai / Tamil Nadu
  if (p3 === "600") return { district: "chennai", state: "tamil nadu" };
  if (p3 === "601" || p3 === "602" || p3 === "603") return { district: "kanchipuram", state: "tamil nadu" };
  if (p3 === "604" || p3 === "605") return { district: "villupuram", state: "tamil nadu" };
  if (p3 === "606") return { district: "tiruvannamalai", state: "tamil nadu" };
  if (p3 === "607" || p3 === "608") return { district: "cuddalore", state: "tamil nadu" };
  if (p3 === "609") return { district: "nagapattinam", state: "tamil nadu" };
  if (p3 === "610" || p3 === "611") return { district: "thiruvarur", state: "tamil nadu" };
  if (p3 === "612" || p3 === "613" || p3 === "614") return { district: "thanjavur", state: "tamil nadu" };
  if (p3 === "620" || p3 === "621") return { district: "tiruchirappalli", state: "tamil nadu" };
  if (p3 === "622") return { district: "pudukkottai", state: "tamil nadu" };
  if (p3 === "624") return { district: "dindigul", state: "tamil nadu" };
  if (p3 === "625") return { district: "madurai", state: "tamil nadu" };
  if (p3 === "626") return { district: "virudhunagar", state: "tamil nadu" };
  if (p3 === "627") return { district: "tirunelveli", state: "tamil nadu" };
  if (p3 === "628") return { district: "tuticorin", state: "tamil nadu" };
  if (p3 === "629") return { district: "kanyakumari", state: "tamil nadu" };
  if (p3 === "630") return { district: "sivaganga", state: "tamil nadu" };
  if (p3 === "632" || p3 === "635") return { district: "vellore", state: "tamil nadu" };
  if (p3 === "636") return { district: "salem", state: "tamil nadu" };
  if (p3 === "637") return { district: "namakkal", state: "tamil nadu" };
  if (p3 === "638") return { district: "erode", state: "tamil nadu" };
  if (p3 === "641" || p3 === "642") return { district: "coimbatore", state: "tamil nadu" };
  if (p3 === "643") return { district: "nilgiris", state: "tamil nadu" };
  if (["60", "61", "62", "63", "64"].includes(p2)) return { district: "tamil nadu", state: "tamil nadu" };

  // Kerala
  if (["67", "68", "69"].includes(p2)) return { district: "kerala", state: "kerala" };

  // West Bengal
  if (p3 === "700") return { district: "kolkata", state: "west bengal" };
  if (["70", "71", "72", "73", "74"].includes(p2)) return { district: "west bengal", state: "west bengal" };

  // Odisha / Bihar / Jharkhand
  if (p2 === "75" || p2 === "76" || p2 === "77") return { district: "odisha", state: "odisha" };
  if (p2 === "80" || p2 === "81" || p2 === "82" || p2 === "84" || p2 === "85") return { district: "bihar", state: "bihar" };
  if (p2 === "83") return { district: "jharkhand", state: "jharkhand" };

  return { district: "", state: "" };
}

export type ManualQuoteResult = {
  pin: string;
  amount: number;
  weightGrams: number;
  transitDays: string;
  zoneName: string;
  slab: string;
  provider: "manual";
  courier: string;
};

/**
 * Calculates manual shipping rate for a destination PIN and weight in grams,
 * based on the active rate rules in database.
 */
export async function calculateManualShippingRate(
  destPin: string,
  weightGrams: number
): Promise<ManualQuoteResult> {
  const pin = destPin.replace(/\D/g, "").slice(0, 6);
  if (pin.length !== 6) {
    throw new Error("Valid 6-digit delivery PIN is required.");
  }

  const grams = Math.max(100, Math.round(weightGrams));
  const { district, state } = resolveLocationFromPin(pin);

  // Fetch all active shipping rates
  const allRates = await db
    .select()
    .from(shippingRates)
    .where(eq(shippingRates.isActive, true))
    .orderBy(shippingRates.minWeightGrams);

  if (allRates.length === 0) {
    // Fallback if table is not seeded
    return {
      pin,
      amount: 67,
      weightGrams: grams,
      transitDays: "3 - 5 Days",
      zoneName: "Standard Delivery",
      slab: "Default",
      provider: "manual",
      courier: "SkyWin Delivery",
    };
  }

  // 1. Determine weight slab:
  // e.g. <= 500g -> "250gm-500gm"
  // <= 1000g -> "500 to 1kg"
  // > 1000g -> multiplier on 1kg slab or specific higher slab
  let targetSlab = "250gm-500gm";
  let weightMultiplier = 1;

  if (grams <= 500) {
    targetSlab = "250gm-500gm";
  } else if (grams <= 1000) {
    targetSlab = "500 to 1kg";
  } else {
    // For weight above 1kg, scale with 1kg slab as base
    targetSlab = "500 to 1kg";
    weightMultiplier = Math.ceil(grams / 1000);
  }

  // Filter rules for this slab
  let slabRates = allRates.filter((r) => r.slab === targetSlab);
  if (slabRates.length === 0) {
    slabRates = allRates;
  }

  // 2. Match Zone by Destination:
  // Priority 1: Exact PIN match in `pincodes`
  let matched = slabRates.find((r) => {
    if (!r.pincodes) return false;
    const list = r.pincodes.split(",").map((p) => p.trim());
    return list.includes(pin);
  });

  // Priority 2: District match in `districts`
  if (!matched && district) {
    matched = slabRates.find((r) => {
      if (!r.districts) return false;
      const list = r.districts.split(",").map((d) => d.trim().toLowerCase());
      return list.includes(district.toLowerCase());
    });
  }

  // Priority 3: State match in `states`
  if (!matched && state) {
    matched = slabRates.find((r) => {
      if (!r.states) return false;
      const list = r.states.split(",").map((s) => s.trim().toLowerCase());
      return list.includes(state.toLowerCase());
    });
  }

  // Priority 4: Default zone ("North, Central & Rest of India" or first available)
  if (!matched) {
    matched =
      slabRates.find((r) => r.zoneName.includes("Rest of India") || r.zoneName.includes("North")) ||
      slabRates[0];
  }

  const baseFee = Number(matched.shippingFee) || 67;
  const totalAmount = Math.ceil(baseFee * weightMultiplier);

  return {
    pin,
    amount: totalAmount,
    weightGrams: grams,
    transitDays: matched.transitDays || "3 - 5 Days",
    zoneName: matched.zoneName,
    slab: matched.slab,
    provider: "manual",
    courier: "SkyWin Delivery",
  };
}

import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { BUSINESS } from "./business";

export const DEFAULT_SETTINGS = {
  businessName: BUSINESS.name,
  tagline: BUSINESS.tagline,
  address: BUSINESS.address,
  phone: BUSINESS.phone,
  email: BUSINESS.email,
  website: BUSINESS.website,
  gstin: BUSINESS.gstin,
  state: BUSINESS.state,
  stateCode: BUSINESS.stateCode,
  defaultOperator: "Counter",
  invoicePrefix: "INV",
  allowNegativeStock: "false",
  defaultGstRetail: "18",
  wholesaleMarkup: "5",
  inventoryAdminPinRequired: "false",
  inventoryAdminPin: "1234",
  qwicksApiKey: "skywin_qwicks_api_key_7596",
  widgetApiKey: "skywin_widget_8f3c2a91e6b04d7a",
  labelApiKey: "skywin_label_3d9f1c47ba805e26",
  qwicksMerchantId: "SkywinKmu",
  qwicksHost: "qwicks.app",
  seedLicense: "4300/TNJ/2026",
  fertLicense: "TN/2026-25/TNJ/KBK/RL0025",
  bankName: "CITY UNION BANK LTD",
  bankBranch: "GANDHI NAGAR(KUM)",
  bankAccountNo: "512020010037167",
  bankIfsc: "CIUB0000171",
  termsOfDelivery:
    "இங்கு விற்கப்படும் விதைகள் அனைத்தும் முளைப்புதிறனுக்கும் மட்டுமே பொறுப்பு. கால மாறுதல்களால் ஏற்படும் இழப்புகளுக்கு நாங்கள் பொறுப்பல்ல.",
} as const;

export type AppSettings = Record<keyof typeof DEFAULT_SETTINGS, string>;

// Cached under the "settings" tag; updateSettings revalidates it. Avoids a
// DB round-trip on every POS checkout and page render.
export const getSettings = unstable_cache(
  async (): Promise<AppSettings> => {
    const rows = await db.select().from(settings);
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return { ...DEFAULT_SETTINGS, ...map } as AppSettings;
  },
  ["app-settings"],
  { tags: ["settings"] }
);

export async function getSetting(key: keyof AppSettings): Promise<string> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return row?.value ?? DEFAULT_SETTINGS[key];
}

export async function updateSettings(data: Partial<AppSettings>) {
  const { revalidatePath, revalidateTag } = await import("next/cache");
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    await db
      .insert(settings)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: String(value) },
      });
  }
  revalidateTag("settings", "max");
  revalidatePath("/settings");
  revalidatePath("/widget");
  revalidatePath("/products");
  revalidatePath("/stock");
}

export async function seedDefaultSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db
      .insert(settings)
      .values({ key, value: String(value) })
      .onConflictDoNothing();
  }
}

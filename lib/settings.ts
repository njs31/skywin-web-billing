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
} as const;

export type AppSettings = Record<keyof typeof DEFAULT_SETTINGS, string>;

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(settings);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...map } as AppSettings;
}

export async function getSetting(key: keyof AppSettings): Promise<string> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return row?.value ?? DEFAULT_SETTINGS[key];
}

export async function updateSettings(data: Partial<AppSettings>) {
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
}

export async function seedDefaultSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db
      .insert(settings)
      .values({ key, value: String(value) })
      .onConflictDoNothing();
  }
}

import { cookies } from "next/headers";
import type { FieldLang } from "@/lib/field-i18n/types";

export const FIELD_LANG_COOKIE = "field_lang";

/** The dashboard language the admin picked (English by default). Server components only. */
export async function getFieldLang(): Promise<FieldLang> {
  const value = (await cookies()).get(FIELD_LANG_COOKIE)?.value;
  return value === "ta" ? "ta" : "en";
}

import { en, type FieldText } from "./en";
import { ta } from "./ta";
import type { FieldLang } from "./types";

export { fmt, plural, type FieldLang } from "./types";
export type { FieldText } from "./en";

/** All dashboard text in one language. */
export function fieldText(lang: FieldLang): FieldText {
  return lang === "ta" ? ta : en;
}

/** Locale for dates and numbers. Tamil uses ta-IN month names; numbers stay Indian style. */
export function fieldLocale(lang: FieldLang) {
  return lang === "ta" ? "ta-IN" : "en-IN";
}

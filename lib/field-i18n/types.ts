export type FieldLang = "en" | "ta";

/** Fills {name} placeholders: fmt("{n} orders", { n: 3 }) → "3 orders". */
export function fmt(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (key in vars ? String(vars[key]) : `{${key}}`));
}

/** Picks the singular or plural form by count. */
export function plural(n: number, one: string, many: string) {
  return fmt(n === 1 ? one : many, { n: n.toLocaleString("en-IN") });
}

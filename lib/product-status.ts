export type ProductListStatus = "active" | "inactive";

/** Active is the default list. Only an explicit "inactive" opens the other one. */
export function parseProductListStatus(
  value: string | undefined
): ProductListStatus {
  return value === "inactive" ? "inactive" : "active";
}

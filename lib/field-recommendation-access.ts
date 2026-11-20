/**
 * Who may use field recommendations.
 * - A field officer (role sales_officer) works only with farmers assigned to him.
 * - An administrator keeps full access, as on every other field page.
 * Everyone else (regional managers, sales officers' managers, store staff) cannot open or change them.
 */
export function canUseFieldRecommendations(role: string | null | undefined) {
  return role === "sales_officer" || role === "admin";
}

/** Admins see and manage every farmer's recommendations; field officers only their own farmers'. */
export function recommendationsForAllFarmers(role: string | null | undefined) {
  return role === "admin";
}

/** Whether this user may write a recommendation for a farmer with this assigned officer. */
export function mayRecommendFor(
  actor: { id: number; role: string },
  farmer: { type: string | null; assignedOfficerId: number | null } | null | undefined
) {
  if (!farmer || farmer.type !== "farmer") return false;
  if (!canUseFieldRecommendations(actor.role)) return false;
  if (recommendationsForAllFarmers(actor.role)) return true;
  return farmer.assignedOfficerId === actor.id;
}

/** Message safe to show the user. Anything else is logged and replaced with a generic message. */
export class RecommendationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

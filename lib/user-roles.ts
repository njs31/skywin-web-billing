export const USER_ROLES = [
  "admin",
  "regional_manager",
  "sales_officer",
  "dealer",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const SEED_ADMIN_PHONE = "9999999999";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  regional_manager: "Regional Manager",
  sales_officer: "Sales Officer",
  dealer: "Dealer",
};

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export function roleLabel(role: string): string {
  return isUserRole(role) ? ROLE_LABELS[role] : role.replaceAll("_", " ");
}

/**
 * Admin may change anyone's role except the seed administrator.
 * Dealers must be linked to a customer. The last remaining admin cannot
 * be demoted (the seed account counts as an admin).
 */
export function validateRoleChange(input: {
  targetPhone: string;
  currentRole: UserRole;
  newRole: UserRole;
  customerId?: number | null;
  adminCount: number;
}): string | null {
  if (input.targetPhone === SEED_ADMIN_PHONE) {
    return "The primary administrator account cannot be changed.";
  }
  if (!isUserRole(input.newRole)) {
    return "Unknown role.";
  }
  if (input.newRole === "dealer" && !(input.customerId && input.customerId > 0)) {
    return "Dealers must be mapped to a customer record.";
  }
  if (
    input.currentRole === "admin" &&
    input.newRole !== "admin" &&
    input.adminCount <= 1
  ) {
    return "Cannot demote the last administrator.";
  }
  return null;
}

export const USER_ROLES = [
  "admin",
  "regional_manager",
  "sales_officer",
  "dealer",
  "cashier",
  "store_manager",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const SEED_ADMIN_PHONE = "9999999999";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  regional_manager: "Regional Manager",
  sales_officer: "Sales Officer",
  dealer: "Dealer",
  cashier: "Cashier",
  store_manager: "Store Manager",
};

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export const FIELD_OFFICER_ROLES = [
  "admin",
  "regional_manager",
  "sales_officer",
  "store_manager",
  "cashier",
] as const satisfies readonly UserRole[];

export function canSignInAsFieldOfficer(role: string | undefined | null) {
  return !!role && (FIELD_OFFICER_ROLES as readonly string[]).includes(role);
}

export function canManageField(role: string | undefined | null) {
  return role === "admin" || role === "regional_manager";
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

export const ACCESS_FORMS = [
  "dashboard",
  "pos",
  "invoices",
  "quotations",
  "sales_return",
  "einvoice",
  "eway",
  "purchase_book",
  "purchase_entry",
  "purchase_orders",
  "suppliers",
  "products",
  "stock_status",
  "stock_import",
  "near_expiry",
  "receipts",
  "payments",
  "credit",
  "outstanding",
  "reports",
  "logs",
] as const;

export type AccessForm = (typeof ACCESS_FORMS)[number];
export type AccessAction = "view" | "create" | "edit";

type Grants = Partial<Record<AccessAction, true>>;

const ALL: Grants = { view: true, create: true, edit: true };

/** Skywin Access Control sheet: Cashier and Store Manager. */
const MATRIX: Record<"cashier" | "store_manager", Record<AccessForm, Grants>> = {
  cashier: {
    dashboard: { view: true },
    pos: { create: true },
    invoices: { view: true },
    quotations: { create: true, view: true },
    sales_return: { create: true },
    einvoice: { create: true },
    eway: { create: true },
    purchase_book: { view: true },
    purchase_entry: {},
    purchase_orders: {},
    suppliers: { create: true },
    products: { view: true },
    stock_status: { view: true },
    stock_import: {},
    near_expiry: { view: true },
    receipts: { create: true, view: true },
    payments: { create: true, view: true },
    credit: { view: true },
    outstanding: { view: true },
    reports: { view: true },
    logs: {},
  },
  store_manager: {
    dashboard: { view: true },
    pos: { create: true },
    invoices: { edit: true, view: true },
    quotations: ALL,
    sales_return: ALL,
    einvoice: { create: true },
    eway: { create: true },
    purchase_book: ALL,
    purchase_entry: ALL,
    purchase_orders: ALL,
    suppliers: ALL,
    products: ALL,
    stock_status: ALL,
    stock_import: ALL,
    near_expiry: ALL,
    receipts: ALL,
    payments: ALL,
    credit: ALL,
    outstanding: ALL,
    reports: { view: true },
    logs: {},
  },
};

export function isMatrixRole(role: string): role is "cashier" | "store_manager" {
  return role === "cashier" || role === "store_manager";
}

/** Null for roles that keep their older rules. */
export function matrixRoleCan(
  role: string,
  form: AccessForm,
  action: AccessAction
): boolean | null {
  if (!isMatrixRole(role)) return null;
  return MATRIX[role][form][action] === true;
}

/** True for admin, regional manager, sales officer, and dealer. Matrix roles use the sheet. */
export function matrixAllows(
  role: string | null | undefined,
  form: AccessForm,
  action: AccessAction
): boolean {
  if (!role || !isMatrixRole(role)) return true;
  return MATRIX[role][form][action] === true;
}

export function canEditInvoices(role: string | null | undefined) {
  if (role === "admin") return true;
  return matrixRoleCan(role ?? "", "invoices", "edit") === true;
}

type PathGate =
  | { form: AccessForm; kind: "any" | AccessAction }
  | "deny";

function holds(role: "cashier" | "store_manager", gate: PathGate) {
  if (gate === "deny") return false;
  const grants = MATRIX[role][gate.form];
  if (gate.kind === "any") return !!(grants.view || grants.create || grants.edit);
  return grants[gate.kind] === true;
}

function gateForPath(pathname: string): PathGate {
  const path = pathname.split("?")[0].replace(/\/$/, "") || "/";

  if (path === "/") return { form: "dashboard", kind: "view" };
  if (path === "/pos" || path.startsWith("/pos/")) return { form: "pos", kind: "create" };
  if (path === "/logs" || path.startsWith("/logs/")) return { form: "logs", kind: "view" };
  if (
    path === "/users" ||
    path.startsWith("/users/") ||
    path === "/settings" ||
    path.startsWith("/settings/") ||
    path === "/widget" ||
    path.startsWith("/widget/") ||
    path === "/field" ||
    path.startsWith("/field/") ||
    path === "/field-orders" ||
    path.startsWith("/field-orders/") ||
    path === "/customers" ||
    path.startsWith("/customers/")
  ) {
    return "deny";
  }
  if (path === "/einvoice" || path.startsWith("/einvoice/")) {
    return { form: "einvoice", kind: "create" };
  }
  if (path === "/eway-bill" || path.startsWith("/eway-bill/")) {
    return { form: "eway", kind: "create" };
  }
  if (path === "/quotations/new") return { form: "quotations", kind: "create" };
  if (path.startsWith("/quotations/") && path.endsWith("/edit")) {
    return { form: "quotations", kind: "edit" };
  }
  if (path === "/quotations" || path.startsWith("/quotations/")) {
    return { form: "quotations", kind: "view" };
  }
  if (path.startsWith("/returns/purchase")) {
    if (path.endsWith("/new")) return { form: "purchase_entry", kind: "create" };
    if (path.endsWith("/edit")) return { form: "purchase_entry", kind: "edit" };
    return { form: "purchase_entry", kind: "any" };
  }
  if (/^\/returns\/[^/]+\/edit$/.test(path)) return { form: "sales_return", kind: "edit" };
  if (path === "/returns" || path.startsWith("/returns/")) {
    return { form: "sales_return", kind: "any" };
  }
  if (/^\/invoices\/[^/]+\/edit$/.test(path)) return { form: "invoices", kind: "edit" };
  if (path === "/invoices" || path.startsWith("/invoices/")) {
    return { form: "invoices", kind: "view" };
  }
  if (path === "/purchases/new") return { form: "purchase_entry", kind: "create" };
  if (/^\/purchases\/[^/]+\/edit$/.test(path)) return { form: "purchase_entry", kind: "edit" };
  if (path === "/purchases" || path.startsWith("/purchases/")) {
    return { form: "purchase_book", kind: "view" };
  }
  if (path === "/purchase-orders/new") return { form: "purchase_orders", kind: "create" };
  if (path.startsWith("/purchase-orders/") && path.endsWith("/edit")) {
    return { form: "purchase_orders", kind: "edit" };
  }
  if (path === "/purchase-orders" || path.startsWith("/purchase-orders/")) {
    return { form: "purchase_orders", kind: "view" };
  }
  if (path === "/suppliers") return { form: "suppliers", kind: "any" };
  if (path.startsWith("/suppliers/")) return { form: "suppliers", kind: "edit" };
  if (path === "/products/new") return { form: "products", kind: "create" };
  if (/^\/products\/[^/]+\/edit$/.test(path)) return { form: "products", kind: "edit" };
  if (path === "/products" || path.startsWith("/products/")) {
    return { form: "products", kind: "view" };
  }
  if (path === "/stock/import" || path.startsWith("/stock/import/")) {
    return { form: "stock_import", kind: "any" };
  }
  if (path === "/stock/expiry" || path.startsWith("/stock/expiry/")) {
    return { form: "near_expiry", kind: "any" };
  }
  if (path === "/stock/adjust" || path.startsWith("/stock/adjust/")) {
    return { form: "stock_status", kind: "create" };
  }
  if (path === "/stock" || path.startsWith("/stock/")) {
    return { form: "stock_status", kind: "view" };
  }
  if (/^\/accounts\/receipts\/[^/]+\/edit$/.test(path)) {
    return { form: "receipts", kind: "edit" };
  }
  if (path === "/accounts/receipts" || path.startsWith("/accounts/receipts/")) {
    return { form: "receipts", kind: "any" };
  }
  if (path.startsWith("/accounts/payments/") && path.endsWith("/edit")) {
    return { form: "payments", kind: "edit" };
  }
  if (path === "/accounts/payments" || path.startsWith("/accounts/payments/")) {
    return { form: "payments", kind: "any" };
  }
  if (path === "/accounts/credit" || path.startsWith("/accounts/credit/")) {
    return { form: "credit", kind: "any" };
  }
  if (path === "/accounts/outstanding" || path.startsWith("/accounts/outstanding/")) {
    return { form: "outstanding", kind: "any" };
  }
  if (path === "/reports" || path.startsWith("/reports/")) {
    return { form: "reports", kind: "view" };
  }
  return "deny";
}

/** Null when this role is not Cashier or Store Manager. */
export function matrixCanAccessPath(role: string, pathname: string): boolean | null {
  if (!isMatrixRole(role)) return null;
  return holds(role, gateForPath(pathname));
}

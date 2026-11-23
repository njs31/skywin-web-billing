/**
 * Excel exports for the Field dashboard's Farmers and Officers pages (rows only; the browser
 * builds the .xlsx in components/field/excel.ts). Products are in field-product-excel.ts and
 * Orders are exported from the rows already on the Orders page.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, farms, reportingLines, sales, users } from "@/db/schema";
import { farmerConditions, type FieldFarmerApproval } from "@/lib/queries/field-farmers";
import { FIELD_OFFICER_ROLES, roleLabel } from "@/lib/user-roles";
import { fieldSaleWhere } from "@/lib/queries/field-orders";

export { FARMER_EXPORT_COLUMNS, OFFICER_EXPORT_COLUMNS } from "@/lib/field-export-columns";

const day = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : "";

/** Farmers matching the page's search and approval filter (all farmers when none). */
export async function exportFieldFarmerRows(filter?: { q?: string; approval?: FieldFarmerApproval | "all" }) {
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      altPhone: customers.altPhone,
      village: customers.village,
      taluk: customers.taluk,
      district: customers.district,
      pinCode: customers.pinCode,
      address: customers.address,
      membershipNo: customers.membershipNo,
      crop: customers.crop,
      acre: customers.acre,
      approval: customers.approval,
      language: customers.language,
      rewardPoints: customers.rewardPoints,
      source: customers.source,
      createdAt: customers.createdAt,
      fieldOfficerName: customers.fieldOfficerName,
      officerName: users.name,
      officerPhone: users.phone,
      farmCount: sql<number>`(select count(*)::int from ${farms} where ${farms.customerId} = ${customers.id})`,
      farmDetails: sql<string | null>`(
        select string_agg(
          concat_ws(' · ', nullif(btrim(${farms.name}), ''), nullif(btrim(${farms.crop}), ''), ${farms.acres}::text || ' ac'),
          '; ' order by ${farms.id}
        )
        from ${farms} where ${farms.customerId} = ${customers.id}
      )`,
    })
    .from(customers)
    .leftJoin(users, eq(users.id, customers.assignedOfficerId))
    .where(and(...farmerConditions(filter)))
    .orderBy(asc(customers.name), asc(customers.id));

  return rows.map((r) => ({
    "Farmer ID": r.id,
    Name: r.name,
    Phone: r.phone ?? "",
    "Other phone": r.altPhone ?? "",
    Village: r.village ?? "",
    Taluk: r.taluk ?? "",
    District: r.district ?? "",
    "PIN code": r.pinCode ?? "",
    Address: r.address ?? "",
    "Membership no": r.membershipNo ?? "",
    Crop: r.crop ?? "",
    Acres: r.acre ?? "",
    Farms: Number(r.farmCount) || 0,
    "Farm details": r.farmDetails ?? "",
    "Field officer": r.officerName || r.fieldOfficerName || "",
    "Officer phone": r.officerPhone ?? "",
    Approval: r.approval ? r.approval[0].toUpperCase() + r.approval.slice(1) : "",
    Language: r.language === "ta" ? "Tamil" : "English",
    "Reward points": r.rewardPoints ?? 0,
    "Joined through": r.source === "registered" ? "Field app" : r.source === "review" ? "Review" : "Imported",
    "Added on": day(r.createdAt),
  }));
}

/** Every field officer and manager, with their farmers and the Field app orders of those farmers. */
export async function exportFieldOfficerRows() {
  const officers = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      role: users.role,
      access: users.fieldAppAccess,
      createdAt: users.createdAt,
      farmers: sql<number>`(select count(*)::int from ${customers} where ${customers.assignedOfficerId} = ${users.id})`,
    })
    .from(users)
    .where(inArray(users.role, [...FIELD_OFFICER_ROLES]))
    .orderBy(asc(users.name), asc(users.id));

  const ids = officers.map((o) => o.id);
  const [lines, orderStats] = ids.length
    ? await Promise.all([
        db
          .select({ officerId: reportingLines.officerId, managerName: users.name })
          .from(reportingLines)
          .innerJoin(users, eq(users.id, reportingLines.managerId))
          .where(inArray(reportingLines.officerId, ids)),
        db
          .select({
            officerId: customers.assignedOfficerId,
            count: sql<number>`count(*)::int`,
            value: sql<string>`coalesce(sum(${sales.grandTotal}::numeric), 0)`,
          })
          .from(sales)
          .innerJoin(customers, eq(customers.id, sales.customerId))
          .where(and(fieldSaleWhere(), inArray(customers.assignedOfficerId, ids), sql`coalesce(${sales.status}, 'active') <> 'cancelled'`))
          .groupBy(customers.assignedOfficerId),
      ])
    : [[], []];

  const managers = new Map<number, string[]>();
  for (const l of lines) managers.set(l.officerId, [...(managers.get(l.officerId) ?? []), l.managerName]);
  const stats = new Map(orderStats.map((s) => [s.officerId, s]));

  return officers.map((o) => ({
    "Officer ID": o.id,
    Name: o.name,
    Phone: o.phone,
    Role: roleLabel(o.role),
    "App access": o.access ? "Yes" : "No",
    "Reports to": (managers.get(o.id) ?? []).join(", "),
    "Farmers assigned": Number(o.farmers) || 0,
    "Field orders": Number(stats.get(o.id)?.count ?? 0),
    "Field order value": Math.round(Number(stats.get(o.id)?.value ?? 0) * 100) / 100,
    "Added on": day(o.createdAt),
  }));
}

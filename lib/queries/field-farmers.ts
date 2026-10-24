import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, farms, users } from "@/db/schema";

export type FieldFarmerApproval = "pending" | "approved" | "rejected";

export type FieldFarmInput = {
  id?: number;
  name: string;
  crop?: string;
  acres?: number;
  gps?: string;
  address?: string;
  pin?: string;
  validated?: boolean;
};

export const FIELD_PAYMENT_MODES = ["upi", "cash", "credit", "card", "cheque", "neft"] as const;
export type FieldPaymentMode = (typeof FIELD_PAYMENT_MODES)[number];

export function normalizePaymentMode(value: unknown): FieldPaymentMode | undefined {
  const v = String(value ?? "").trim().toLowerCase();
  return (FIELD_PAYMENT_MODES as readonly string[]).includes(v) ? (v as FieldPaymentMode) : undefined;
}

export type FieldFarmerInput = {
  name: string;
  phone?: string;
  altPhone?: string;
  village?: string;
  address?: string;
  pinCode?: string;
  language?: "en" | "ta";
  approval?: FieldFarmerApproval;
  rewardPoints?: number;
  source?: "imported" | "registered";
  assignedOfficerId?: number | null;
  fieldOfficerName?: string | null;
  photoUrl?: string | null;
  paymentMode?: FieldPaymentMode;
  assignedOfficerPhone?: string;
  crop?: string;
  acre?: string;
  farms?: FieldFarmInput[];
};

function digitsPhone(phone?: string | null) {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

function titleCaseApproval(value: string | null | undefined): "Approved" | "Pending" | "Rejected" {
  const v = (value ?? "pending").toLowerCase();
  if (v === "approved") return "Approved";
  if (v === "rejected") return "Rejected";
  return "Pending";
}

function farmerConditions(filter?: {
  q?: string;
  approval?: FieldFarmerApproval | "all";
}) {
  const conditions = [eq(customers.type, "farmer")];
  if (filter?.approval && filter.approval !== "all") {
    conditions.push(eq(customers.approval, filter.approval));
  }
  if (filter?.q?.trim()) {
    const raw = filter.q.trim().replace(/[%_]/g, "");
    if (raw) {
      const pattern = `%${raw}%`;
      const digits = raw.replace(/\D/g, "");
      const parts = [
        ilike(customers.name, pattern),
        ilike(customers.phone, pattern),
        ilike(customers.village, pattern),
        ilike(customers.taluk, pattern),
        ilike(customers.fieldOfficerName, pattern),
        ilike(customers.approval, pattern),
        ilike(customers.crop, pattern),
        ilike(customers.acre, pattern),
        sql`exists (
          select 1 from ${users} officer
          where officer.id = ${customers.assignedOfficerId}
            and officer.name ilike ${pattern}
        )`,
        sql`exists (
          select 1 from ${farms} field
          where field.customer_id = ${customers.id}
            and (
              field.crop ilike ${pattern}
              or field.name ilike ${pattern}
              or field.acres::text ilike ${pattern}
            )
        )`
      );
      if (digits.length >= 3) {
        parts.push(
          sql`regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g') ilike ${"%" + digits + "%"}`
        );
      }
      const search = or(...parts);
      if (search) conditions.push(search);
    }
  }
  return conditions;
}

export async function countFieldFarmers(filter?: {
  q?: string;
  approval?: FieldFarmerApproval | "all";
}) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(and(...farmerConditions(filter)));
  return Number(row?.count ?? 0);
}

export async function listFieldFarmers(filter?: {
  q?: string;
  approval?: FieldFarmerApproval | "all";
  limit?: number;
  offset?: number;
}) {
  const conditions = farmerConditions(filter);
  const limit = Math.min(Math.max(filter?.limit ?? 50000, 1), 50000);
  const offset = Math.max(filter?.offset ?? 0, 0);

  const rows = await db
    .select({
      farmer: customers,
      officerName: users.name,
    })
    .from(customers)
    .leftJoin(users, eq(users.id, customers.assignedOfficerId))
    .where(and(...conditions))
    .orderBy(asc(customers.name), asc(customers.id))
    .limit(limit)
    .offset(offset);

  const ids = rows.map((row) => row.farmer.id);
  const farmRows =
    ids.length === 0
      ? []
      : await db.select().from(farms).where(inArray(farms.customerId, ids)).orderBy(asc(farms.id));

  const farmsByCustomer = new Map<number, typeof farmRows>();
  for (const farm of farmRows) {
    const list = farmsByCustomer.get(farm.customerId) ?? [];
    list.push(farm);
    farmsByCustomer.set(farm.customerId, list);
  }

  return rows.map((row) => serializeFarmer(row.farmer, farmRowsBy(farmsByCustomer, row.farmer.id), row.officerName));
}

function farmRowsBy(map: Map<number, typeof farms.$inferSelect[]>, id: number) {
  return map.get(id) ?? [];
}

export async function getFieldFarmer(id: number) {
  const [row] = await db
    .select({
      farmer: customers,
      officerName: users.name,
    })
    .from(customers)
    .leftJoin(users, eq(users.id, customers.assignedOfficerId))
    .where(and(eq(customers.id, id), eq(customers.type, "farmer")))
    .limit(1);
  if (!row) return null;
  const farmRows = await db
    .select()
    .from(farms)
    .where(eq(farms.customerId, id))
    .orderBy(asc(farms.id));
  return serializeFarmer(row.farmer, farmRows, row.officerName);
}

export async function upsertFieldFarmer(input: FieldFarmerInput, existingId?: number) {
  const phone = digitsPhone(input.phone);
  const approval = (input.approval ?? "pending").toLowerCase() as FieldFarmerApproval;

  let assignedOfficerId = input.assignedOfficerId;
  if (assignedOfficerId === undefined && input.assignedOfficerPhone) {
    const officerPhone = digitsPhone(input.assignedOfficerPhone);
    const [officer] = officerPhone
      ? await db
          .select({ id: users.id })
          .from(users)
          .where(sql`right(regexp_replace(${users.phone}, '\\D', '', 'g'), 10) = ${officerPhone}`)
          .limit(1)
      : [];
    if (officer) assignedOfficerId = officer.id;
  }

  const firstFarm = input.farms?.[0];
  const base = {
    name: input.name.trim(),
    phone: phone || null,
    altPhone: input.altPhone?.trim() || null,
    village: input.village?.trim() || null,
    address: input.address?.trim() || null,
    pinCode: input.pinCode?.trim() || null,
    language: input.language ?? "en",
    approval,
    type: "farmer" as const,
    ...(input.crop !== undefined || firstFarm
      ? {
          crop: input.crop?.trim() || input.farms?.map((f) => f.crop).filter(Boolean).join(", ") || null,
          acre:
            input.acre?.trim() ||
            (input.farms ? String(input.farms.reduce((sum, f) => sum + (f.acres ?? 0), 0)) : null),
        }
      : {}),
  };
  // Omitted fields keep their stored value on update.
  const optional = {
    ...(input.rewardPoints !== undefined ? { rewardPoints: input.rewardPoints } : {}),
    ...(input.source !== undefined ? { source: input.source } : {}),
    ...(assignedOfficerId !== undefined ? { assignedOfficerId } : {}),
    ...(input.fieldOfficerName !== undefined
      ? { fieldOfficerName: input.fieldOfficerName?.trim() || null }
      : {}),
    ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {}),
    ...(input.paymentMode !== undefined ? { paymentMode: input.paymentMode } : {}),
  };

  let farmer;
  let targetId = existingId;
  if (!targetId && phone) {
    const [found] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(sql`regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g') = ${phone}`)
      .limit(1);
    targetId = found?.id;
  }
  if (targetId) {
    [farmer] = await db
      .update(customers)
      .set({ ...base, ...optional })
      .where(eq(customers.id, targetId))
      .returning();
  }

  if (!farmer) {
    [farmer] = await db
      .insert(customers)
      .values({
        ...base,
        rewardPoints: 0,
        source: "registered",
        paymentMode: "upi",
        ...optional,
      })
      .returning();
  }

  if (input.farms) {
    await replaceFarms(farmer.id, input.farms);
  }

  return getFieldFarmer(farmer.id);
}

async function replaceFarms(customerId: number, next: FieldFarmInput[]) {
  const existing = await db.select().from(farms).where(eq(farms.customerId, customerId));
  const keep = new Set(next.map((farm) => farm.id).filter((id): id is number => Number.isFinite(id)));
  for (const farm of existing) {
    if (!keep.has(farm.id)) {
      await db.delete(farms).where(eq(farms.id, farm.id));
    }
  }
  for (const farm of next) {
    const values = {
      customerId,
      name: farm.name.trim() || "Main field",
      crop: farm.crop?.trim() || null,
      acres: (farm.acres ?? 0).toFixed(2),
      gps: farm.gps?.trim() || null,
      address: farm.address?.trim() || null,
      pin: farm.pin?.trim() || null,
      validated: farm.validated ?? false,
    };
    if (farm.id) {
      await db.update(farms).set(values).where(eq(farms.id, farm.id));
    } else {
      await db.insert(farms).values(values);
    }
  }
}

export async function setFarmerApproval(id: number, approval: FieldFarmerApproval) {
  await db.update(customers).set({ approval }).where(eq(customers.id, id));
  return getFieldFarmer(id);
}

export async function countPendingFarmers() {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(and(eq(customers.type, "farmer"), eq(customers.approval, "pending")));
  return Number(row?.count ?? 0);
}

export function serializeFarmer(
  farmer: typeof customers.$inferSelect,
  farmRows: (typeof farms.$inferSelect)[],
  officerName?: string | null
) {
  return {
    id: farmer.id,
    name: farmer.name,
    initials: farmer.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join(""),
    village: farmer.village ?? "",
    address: farmer.address ?? "",
    pin: farmer.pinCode ?? "",
    phone: farmer.phone ?? "",
    altPhone: farmer.altPhone ?? "",
    language: (farmer.language === "ta" ? "ta" : "en") as "en" | "ta",
    approval: titleCaseApproval(farmer.approval),
    rewardPoints: farmer.rewardPoints ?? 0,
    source: farmer.source === "registered" ? "registered" : "imported",
    territory: farmer.taluk ?? "",
    assignedOfficerId: farmer.assignedOfficerId,
    fieldOfficerName: farmer.fieldOfficerName ?? "",
    assignedOfficer: officerName || farmer.fieldOfficerName || "",
    photo: farmer.photoUrl ?? undefined,
    paymentMode: (normalizePaymentMode(farmer.paymentMode) ?? "upi") as FieldPaymentMode,
    farms: farmRows.map((farm) => ({
      id: String(farm.id),
      dbId: farm.id,
      name: farm.name,
      crop: farm.crop ?? "",
      acres: Number(farm.acres) || 0,
      gps: farm.gps ?? "",
      address: farm.address ?? "",
      pin: farm.pin ?? "",
      validated: farm.validated,
    })),
  };
}

import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, farms, users } from "@/db/schema";
import { FIELD_OFFICER_ROLES } from "@/lib/user-roles";
import {
  digitsPhone,
  farmerFieldErrorList,
  farmerFieldErrors,
  loginPhoneChanged,
  normalizePaymentMode,
  FIELD_PAYMENT_MODES,
  type FieldPaymentMode,
} from "@/lib/field-farmer-rules";

export { digitsPhone, normalizePaymentMode, FIELD_PAYMENT_MODES };
export type { FieldPaymentMode };

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

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

export type FieldFarmerInput = {
  name: string;
  phone?: string;
  altPhone?: string;
  village?: string;
  address?: string;
  pinCode?: string;
  language?: "en" | "ta";
  territory?: string;
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
        )`,
      ];
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
    ...(input.territory !== undefined ? { taluk: input.territory.trim() || null } : {}),
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
    const { approval: nextApproval, ...profile } = base;
    [farmer] = await db
      .update(customers)
      .set({
        ...profile,
        ...optional,
        ...(input.approval !== undefined ? { approval: nextApproval } : {}),
      })
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
    await replaceFarms(db, farmer.id, input.farms);
  }

  return getFieldFarmer(farmer.id);
}

function assertFarmerFields(input: FieldFarmerInput, requirePhone: boolean) {
  const errors = farmerFieldErrorList(farmerFieldErrors({ ...input, requirePhone }));
  if (errors.length) throw new Error(errors.join(" "));
}

async function assertOfficer(officerId: number | null | undefined) {
  if (!officerId) return;
  const [officer] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.id, officerId), inArray(users.role, [...FIELD_OFFICER_ROLES])))
    .limit(1);
  if (!officer) throw new Error("Choose a field officer from the list.");
  return officer;
}

function profileColumns(input: FieldFarmerInput) {
  return {
    name: input.name.trim(),
    altPhone: input.altPhone?.trim() || null,
    village: input.village?.trim() || null,
    address: input.address?.trim() || null,
    pinCode: input.pinCode?.trim() || null,
    language: input.language === "en" ? "en" : "ta",
    ...(input.territory !== undefined ? { taluk: input.territory.trim() || null } : {}),
    ...(input.crop !== undefined || input.farms
      ? {
          crop:
            input.crop?.trim() ||
            input.farms?.map((farm) => farm.crop).filter(Boolean).join(", ") ||
            null,
          acre:
            input.acre?.trim() ||
            (input.farms
              ? String(input.farms.reduce((sum, farm) => sum + (Number(farm.acres) || 0), 0))
              : null),
        }
      : {}),
    ...(input.rewardPoints !== undefined ? { rewardPoints: Math.round(input.rewardPoints) } : {}),
    ...(input.assignedOfficerId !== undefined ? { assignedOfficerId: input.assignedOfficerId } : {}),
    ...(input.fieldOfficerName !== undefined
      ? { fieldOfficerName: input.fieldOfficerName?.trim() || null }
      : {}),
    ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl?.trim() || null } : {}),
    ...(input.paymentMode !== undefined ? { paymentMode: input.paymentMode } : {}),
  };
}

/** Insert a farmer. A phone that already belongs to someone is rejected. */
export async function createFieldFarmer(input: FieldFarmerInput) {
  assertFarmerFields(input, true);
  const phone = digitsPhone(input.phone);
  const [existing] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(sql`regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g') = ${phone}`)
    .limit(1);
  if (existing) throw new Error(`${existing.name} already uses this phone.`);
  const officer = await assertOfficer(input.assignedOfficerId);
  const [farmer] = await db
    .insert(customers)
    .values({
      ...profileColumns(input),
      phone,
      type: "farmer",
      approval: "approved",
      rewardPoints: input.rewardPoints ?? 0,
      source: "registered",
      paymentMode: input.paymentMode ?? "upi",
      fieldOfficerName: officer?.name ?? input.fieldOfficerName?.trim() ?? null,
    })
    .returning();
  if (input.farms?.length) await replaceFarms(db, farmer.id, input.farms);
  return getFieldFarmer(farmer.id);
}

/**
 * Update one farmer by id. The login phone is left unchanged.
 * Approval is left unchanged. Related sales keep their own customer id.
 */
export async function updateFieldFarmer(id: number, input: FieldFarmerInput) {
  assertFarmerFields(input, false);
  const current = await getFieldFarmer(id);
  if (!current) throw new Error("Farmer not found");
  if (loginPhoneChanged(current.phone, input.phone)) {
    throw new Error("The login phone cannot be changed here. It is how this farmer signs in.");
  }
  const officer = await assertOfficer(input.assignedOfficerId);
  const columns = {
    ...profileColumns(input),
    ...(officer ? { fieldOfficerName: officer.name } : {}),
  };

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(customers)
      .set(columns)
      .where(and(eq(customers.id, id), eq(customers.type, "farmer")))
      .returning({ id: customers.id });
    if (!updated) throw new Error("Farmer not found");
    if (input.farms) await replaceFarms(tx, id, input.farms);
  });

  return getFieldFarmer(id);
}

async function replaceFarms(client: DbOrTx, customerId: number, next: FieldFarmInput[]) {
  const existing = await client.select().from(farms).where(eq(farms.customerId, customerId));
  const keep = new Set(next.map((farm) => farm.id).filter((id): id is number => Number.isFinite(id)));
  for (const farm of existing) {
    if (!keep.has(farm.id)) {
      await client.delete(farms).where(eq(farms.id, farm.id));
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
      await client.update(farms).set(values).where(and(eq(farms.id, farm.id), eq(farms.customerId, customerId)));
    } else {
      await client.insert(farms).values(values);
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

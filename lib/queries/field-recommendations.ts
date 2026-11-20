import { and, asc, desc, eq, getTableColumns, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, fieldRecommendations, products, users } from "@/db/schema";
import { listedProductIds } from "@/lib/field-listed";
import { cleanRecommendation, type RecommendationDraft } from "@/lib/field-recommendation-rules";
import { canSignInAsFieldOfficer } from "@/lib/user-roles";
import {
  RecommendationError,
  canUseFieldRecommendations,
  mayRecommendFor,
  recommendationsForAllFarmers,
} from "@/lib/field-recommendation-access";

export type RecommendationProduct = {
  id: number;
  name: string;
  sku: string;
  price: number;
  stock: number;
};

export type FieldRecommendation = {
  id: number;
  farmerId: number;
  farmerName: string;
  crop: string;
  stage: string;
  problem: string;
  note: string;
  productIds: number[];
  products: RecommendationProduct[];
  authorUserId: number | null;
  authorName: string;
  authorRole: string;
  authorKind: "admin" | "officer";
  own: boolean;
  updatedAt: string;
};

export type RecommendationActor = {
  id: number;
  name: string;
  role: string;
};

function digits(phone: string) {
  return phone.replace(/\D/g, "").slice(-10);
}

function idList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids: number[] = [];
  for (const item of value) {
    const id = Number(item);
    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export async function fieldOfficerByPhone(phone: string): Promise<RecommendationActor | null> {
  const mobile = digits(phone);
  if (mobile.length !== 10) return null;
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      access: users.fieldAppAccess,
    })
    .from(users)
    .where(sql`right(regexp_replace(${users.phone}, '\\D', '', 'g'), 10) = ${mobile}`)
    .limit(1);
  if (!user?.access || !canSignInAsFieldOfficer(user.role)) return null;
  return { id: user.id, name: user.name.trim() || "Field officer", role: user.role };
}

async function catalogue(ids: number[]): Promise<Map<number, RecommendationProduct>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      price: products.saleRate,
      stock: products.stockQty,
    })
    .from(products)
    .where(inArray(products.id, unique));
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        sku: row.sku ?? "",
        price: Number(row.price) || 0,
        stock: Math.max(0, Number(row.stock) || 0),
      },
    ])
  );
}

async function assertListedProducts(ids: number[]) {
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        inArray(products.id, ids),
        eq(products.isActive, true),
        inArray(products.id, listedProductIds())
      )
    );
  if (rows.length !== ids.length) {
    throw new RecommendationError("Choose products from the field catalogue.");
  }
}

export type RecommendationFarmer = { id: number; name: string; phone: string; village: string };

type FarmerRef = { id: number; name: string; type: string | null; assignedOfficerId: number | null };

async function farmerRef(farmerId: number): Promise<FarmerRef | null> {
  if (!Number.isInteger(farmerId) || farmerId <= 0) return null;
  const [row] = await db
    .select({ id: customers.id, name: customers.name, type: customers.type, assignedOfficerId: customers.assignedOfficerId })
    .from(customers)
    .where(eq(customers.id, farmerId))
    .limit(1);
  return row ?? null;
}

/** The farmer, if this user may write recommendations for them. Throws otherwise. */
async function assertMayRecommendFor(actor: RecommendationActor, farmerId: number): Promise<FarmerRef> {
  const farmer = await farmerRef(farmerId);
  if (!farmer || farmer.type !== "farmer") throw new RecommendationError("Choose one of your farmers.");
  if (!mayRecommendFor(actor, farmer)) {
    throw new RecommendationError("You can add recommendations only for farmers assigned to you.", 403);
  }
  return farmer;
}

function present(
  row: typeof fieldRecommendations.$inferSelect,
  productsById: Map<number, RecommendationProduct>,
  viewerId: number | null,
  farmerNames: Map<number, string>
): FieldRecommendation {
  const productIds = idList(row.productIds);
  return {
    id: row.id,
    farmerId: row.farmerId,
    farmerName: farmerNames.get(row.farmerId) ?? "",
    crop: row.crop,
    stage: row.stage,
    problem: row.problem,
    note: row.note,
    productIds,
    products: productIds.flatMap((id) => {
      const product = productsById.get(id);
      return product ? [product] : [];
    }),
    authorUserId: row.authorUserId,
    authorName: row.authorName,
    authorRole: row.authorRole,
    authorKind: row.authorRole === "admin" ? "admin" : "officer",
    own: viewerId != null && row.authorUserId === viewerId,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

async function presentRows(rows: (typeof fieldRecommendations.$inferSelect)[], viewerId: number | null) {
  const productsById = await catalogue(rows.flatMap((row) => idList(row.productIds)));
  const farmerIds = [...new Set(rows.map((row) => row.farmerId))];
  const farmerNames = new Map<number, string>();
  if (farmerIds.length) {
    const names = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(inArray(customers.id, farmerIds));
    for (const row of names) farmerNames.set(row.id, row.name);
  }
  return rows.map((row) => present(row, productsById, viewerId, farmerNames));
}

/** Field site list: an admin sees every recommendation, a field officer those for his farmers. */
export async function listRecommendationsForUser(actor: RecommendationActor): Promise<FieldRecommendation[]> {
  if (!canUseFieldRecommendations(actor.role)) return [];
  const columns = getTableColumns(fieldRecommendations);
  const rows = recommendationsForAllFarmers(actor.role)
    ? await db.select().from(fieldRecommendations).orderBy(desc(fieldRecommendations.updatedAt)).limit(1000)
    : await db
        .select(columns)
        .from(fieldRecommendations)
        .innerJoin(customers, eq(customers.id, fieldRecommendations.farmerId))
        .where(eq(customers.assignedOfficerId, actor.id))
        .orderBy(desc(fieldRecommendations.updatedAt))
        .limit(1000);
  return presentRows(rows, actor.id);
}

/** Recommendations for one farmer (the app). The caller has already checked who may read them. */
export async function listRecommendationsForFarmer(farmerId: number, viewerId: number | null) {
  const rows = await db
    .select()
    .from(fieldRecommendations)
    .where(eq(fieldRecommendations.farmerId, farmerId))
    .orderBy(desc(fieldRecommendations.updatedAt))
    .limit(200);
  return presentRows(rows, viewerId);
}

/** App reads without a farmer (older app builds): a field officer gets his farmers' rows, others every row. */
export async function listRecommendationsForAppOfficer(viewer: RecommendationActor) {
  if (viewer.role !== "sales_officer") {
    const rows = await db.select().from(fieldRecommendations).orderBy(desc(fieldRecommendations.updatedAt)).limit(1000);
    return presentRows(rows, viewer.id);
  }
  return listRecommendationsForUser(viewer);
}

/** Farmer accounts (customers of type farmer) whose phone matches the app's signed-in phone. */
export async function farmerIdsByPhone(phone: string): Promise<number[]> {
  const mobile = digits(phone);
  if (mobile.length !== 10) return [];
  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.type, "farmer"),
        sql`right(regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g'), 10) = ${mobile}`
      )
    )
    .limit(20);
  return rows.map((row) => row.id);
}

/** Whether an app officer may read this farmer's recommendations (field officers: own farmers only). */
export async function appOfficerMayRead(viewer: RecommendationActor, farmerId: number) {
  const farmer = await farmerRef(farmerId);
  if (!farmer || farmer.type !== "farmer") return false;
  if (viewer.role === "sales_officer") return farmer.assignedOfficerId === viewer.id;
  return true;
}

/** Farmer picker on the field site: a field officer's own farmers; every farmer for an admin. */
export async function searchRecommendationFarmers(actor: RecommendationActor, query: string): Promise<RecommendationFarmer[]> {
  if (!canUseFieldRecommendations(actor.role)) return [];
  const q = query.trim();
  const filters = [eq(customers.type, "farmer")];
  if (!recommendationsForAllFarmers(actor.role)) filters.push(eq(customers.assignedOfficerId, actor.id));
  if (q) {
    const match = or(ilike(customers.name, `%${q}%`), ilike(customers.phone, `%${q}%`), ilike(customers.village, `%${q}%`));
    if (match) filters.push(match);
  } else if (recommendationsForAllFarmers(actor.role)) {
    return [];
  }
  const rows = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phone, village: customers.village })
    .from(customers)
    .where(and(...filters))
    .orderBy(asc(customers.name))
    .limit(20);
  return rows.map((row) => ({ id: row.id, name: row.name, phone: row.phone ?? "", village: row.village ?? "" }));
}

export async function searchRecommendationProducts(query: string): Promise<RecommendationProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      price: products.saleRate,
      stock: products.stockQty,
    })
    .from(products)
    .where(
      and(
        eq(products.isActive, true),
        inArray(products.id, listedProductIds()),
        or(ilike(products.name, `%${q}%`), ilike(products.sku, `%${q}%`))
      )
    )
    .orderBy(asc(products.name))
    .limit(12);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku ?? "",
    price: Number(row.price) || 0,
    stock: Math.max(0, Number(row.stock) || 0),
  }));
}

export async function saveFieldRecommendation(
  input: RecommendationDraft & { id?: number; farmerId: number },
  actor: RecommendationActor
): Promise<FieldRecommendation> {
  if (!canUseFieldRecommendations(actor.role)) {
    throw new RecommendationError("Only a field officer can save a recommendation.", 403);
  }
  let draft: RecommendationDraft;
  try {
    draft = cleanRecommendation(input);
  } catch (err) {
    throw new RecommendationError(err instanceof Error ? err.message : "Check the recommendation.");
  }
  const farmerId = Number(input.farmerId);
  await assertMayRecommendFor(actor, farmerId);
  await assertListedProducts(draft.productIds);
  const id = Number(input.id);
  let savedId = 0;
  if (Number.isInteger(id) && id > 0) {
    const [existing] = await db
      .select()
      .from(fieldRecommendations)
      .where(eq(fieldRecommendations.id, id))
      .limit(1);
    if (!existing) throw new RecommendationError("Recommendation not found.", 404);
    // The farmer it was written for must still be one this user may recommend for.
    await assertMayRecommendFor(actor, existing.farmerId);
    if (!recommendationsForAllFarmers(actor.role) && existing.authorUserId !== actor.id) {
      throw new RecommendationError("You can edit only recommendations you added.", 403);
    }
    await db
      .update(fieldRecommendations)
      .set({
        farmerId,
        crop: draft.crop,
        stage: draft.stage,
        problem: draft.problem,
        note: draft.note,
        productIds: draft.productIds,
        updatedAt: new Date(),
      })
      .where(eq(fieldRecommendations.id, id));
    savedId = id;
  } else {
    const [created] = await db
      .insert(fieldRecommendations)
      .values({
        farmerId,
        crop: draft.crop,
        stage: draft.stage,
        problem: draft.problem,
        note: draft.note,
        productIds: draft.productIds,
        authorUserId: actor.id,
        authorName: actor.name.trim() || "Field officer",
        authorRole: actor.role,
      })
      .returning({ id: fieldRecommendations.id });
    savedId = created.id;
  }
  const rows = await db.select().from(fieldRecommendations).where(eq(fieldRecommendations.id, savedId)).limit(1);
  const [saved] = await presentRows(rows, actor.id);
  return saved;
}

export async function deleteFieldRecommendation(id: number, actor: RecommendationActor) {
  if (!canUseFieldRecommendations(actor.role)) {
    throw new RecommendationError("Only a field officer can remove a recommendation.", 403);
  }
  const [existing] = await db
    .select({ id: fieldRecommendations.id, farmerId: fieldRecommendations.farmerId, authorUserId: fieldRecommendations.authorUserId })
    .from(fieldRecommendations)
    .where(eq(fieldRecommendations.id, id))
    .limit(1);
  if (!existing) throw new RecommendationError("Recommendation not found.", 404);
  await assertMayRecommendFor(actor, existing.farmerId);
  if (!recommendationsForAllFarmers(actor.role) && existing.authorUserId !== actor.id) {
    throw new RecommendationError("You can remove only recommendations you added.", 403);
  }
  await db.delete(fieldRecommendations).where(eq(fieldRecommendations.id, id));
}

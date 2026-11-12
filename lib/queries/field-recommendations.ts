import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { fieldRecommendations, products, users } from "@/db/schema";
import { listedProductIds } from "@/lib/field-listed";
import { cleanRecommendation, type RecommendationDraft } from "@/lib/field-recommendation-rules";
import { canSignInAsFieldOfficer } from "@/lib/user-roles";

export type RecommendationProduct = {
  id: number;
  name: string;
  sku: string;
  price: number;
  stock: number;
};

export type FieldRecommendation = {
  id: number;
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
    throw new Error("Choose products from the field catalogue.");
  }
}

function present(
  row: typeof fieldRecommendations.$inferSelect,
  productsById: Map<number, RecommendationProduct>,
  viewerId: number | null
): FieldRecommendation {
  const productIds = idList(row.productIds);
  return {
    id: row.id,
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

export async function listFieldRecommendations(viewerPhone?: string): Promise<FieldRecommendation[]> {
  const viewer = viewerPhone ? await fieldOfficerByPhone(viewerPhone) : null;
  const rows = await db.select().from(fieldRecommendations).orderBy(desc(fieldRecommendations.updatedAt));
  const productsById = await catalogue(rows.flatMap((row) => idList(row.productIds)));
  return rows.map((row) => present(row, productsById, viewer?.id ?? null));
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
  input: RecommendationDraft & { id?: number },
  actor: RecommendationActor,
  options?: { allowAny?: boolean }
): Promise<FieldRecommendation> {
  const draft = cleanRecommendation(input);
  await assertListedProducts(draft.productIds);
  const id = Number(input.id);
  let savedId = 0;
  if (Number.isInteger(id) && id > 0) {
    const [existing] = await db
      .select()
      .from(fieldRecommendations)
      .where(eq(fieldRecommendations.id, id))
      .limit(1);
    if (!existing) throw new Error("Recommendation not found.");
    if (!options?.allowAny && existing.authorUserId !== actor.id) {
      throw new Error("You can edit only recommendations you added.");
    }
    await db
      .update(fieldRecommendations)
      .set({
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
  const [row] = await db.select().from(fieldRecommendations).where(eq(fieldRecommendations.id, savedId)).limit(1);
  const productsById = await catalogue(idList(row.productIds));
  return present(row, productsById, actor.id);
}

export async function deleteFieldRecommendation(
  id: number,
  actor: RecommendationActor,
  options?: { allowAny?: boolean }
) {
  const [existing] = await db
    .select({ id: fieldRecommendations.id, authorUserId: fieldRecommendations.authorUserId })
    .from(fieldRecommendations)
    .where(eq(fieldRecommendations.id, id))
    .limit(1);
  if (!existing) throw new Error("Recommendation not found.");
  if (!options?.allowAny && existing.authorUserId !== actor.id) {
    throw new Error("You can remove only recommendations you added.");
  }
  await db.delete(fieldRecommendations).where(eq(fieldRecommendations.id, id));
}

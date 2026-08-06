import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { partyPayments, purchaseReturns, purchases, suppliers } from "@/db/schema";
import { asc, count, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";

export const getAllSuppliers = unstable_cache(
  async () => db.select().from(suppliers).orderBy(asc(suppliers.name)),
  ["suppliers-all"],
  { revalidate: 120, tags: ["suppliers"] }
);

export const getSuppliers = unstable_cache(
  async (search?: string, page = 1, pageSize = 20) => {
    const q = search?.trim();
    const offset = (page - 1) * pageSize;

    if (q) {
      const pattern = `%${q}%`;
      return db
        .select()
        .from(suppliers)
        .where(
          or(
            ilike(suppliers.name, pattern),
            ilike(suppliers.phone, pattern),
            ilike(suppliers.gstin, pattern),
            ilike(suppliers.city, pattern)
          )
        )
        .orderBy(asc(suppliers.name))
        .limit(pageSize)
        .offset(offset);
    }

    return db
      .select()
      .from(suppliers)
      .orderBy(asc(suppliers.name))
      .limit(pageSize)
      .offset(offset);
  },
  ["suppliers-list"],
  { revalidate: 120, tags: ["suppliers"] }
);

export const getSupplierCount = unstable_cache(
  async (search?: string) => {
    const q = search?.trim();
    if (q) {
      const pattern = `%${q}%`;
      const [result] = await db
        .select({ count: count() })
        .from(suppliers)
        .where(
          or(
            ilike(suppliers.name, pattern),
            ilike(suppliers.phone, pattern),
            ilike(suppliers.gstin, pattern),
            ilike(suppliers.city, pattern)
          )
        );
      return result?.count ?? 0;
    }

    const [result] = await db
      .select({ count: count() })
      .from(suppliers);
    return result?.count ?? 0;
  },
  ["suppliers-count"],
  { revalidate: 120, tags: ["suppliers"] }
);

export async function getSupplierById(id: number) {
  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, id))
    .limit(1);
  return supplier ?? null;
}

const createSupplierSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required"),
  gstin: z.string().trim().optional(),
  pan: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  pinCode: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

function normalizeSupplierFields(input: CreateSupplierInput) {
  const parsed = createSupplierSchema.parse(input);
  const gstin = parsed.gstin?.toUpperCase() || null;
  const pan = parsed.pan?.toUpperCase() || null;
  const phone = parsed.phone?.replace(/\D/g, "") || null;

  if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) {
    throw new Error("GSTIN must be a valid 15-character GST number");
  }
  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    throw new Error("PAN must be a valid 10-character PAN (e.g. ABCDE1234F)");
  }
  if (phone && phone.length < 10) {
    throw new Error("Mobile number must be at least 10 digits");
  }
  if (parsed.pinCode && !/^\d{6}$/.test(parsed.pinCode)) {
    throw new Error("PIN code must be 6 digits");
  }

  return {
    name: parsed.name,
    gstin,
    pan,
    address: parsed.address || null,
    city: parsed.city || null,
    state: parsed.state || null,
    pinCode: parsed.pinCode || null,
    phone,
    contact: phone,
  };
}

async function revalidateSupplierPaths(id?: number) {
  const { revalidatePath, revalidateTag } = await import("next/cache");
  revalidateTag("suppliers", "max");
  revalidatePath("/suppliers");
  revalidatePath("/purchases/new");
  revalidatePath("/purchases");
  if (id) revalidatePath(`/suppliers/${id}`);
}

export async function createSupplier(input: CreateSupplierInput | string, contact?: string) {
  const parsed =
    typeof input === "string"
      ? createSupplierSchema.parse({ name: input, phone: contact })
      : createSupplierSchema.parse(input);

  const values = normalizeSupplierFields(parsed);

  try {
    const [supplier] = await db.insert(suppliers).values(values).returning();
    await revalidateSupplierPaths(supplier.id);
    return supplier;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("unique") || message.includes("duplicate")) {
      throw new Error("A supplier with this name already exists");
    }
    throw err;
  }
}

export async function updateSupplier(id: number, input: CreateSupplierInput) {
  const values = normalizeSupplierFields(input);

  try {
    const [supplier] = await db
      .update(suppliers)
      .set(values)
      .where(eq(suppliers.id, id))
      .returning();

    if (!supplier) throw new Error("Supplier not found");
    await revalidateSupplierPaths(id);
    return supplier;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("unique") || message.includes("duplicate")) {
      throw new Error("A supplier with this name already exists");
    }
    throw err;
  }
}

export async function deleteSupplier(id: number) {
  const [purchaseCount] = await db
    .select({ c: count() })
    .from(purchases)
    .where(eq(purchases.supplierId, id));
  if (purchaseCount.c > 0) {
    throw new Error(
      "Cannot delete this supplier — purchases are linked. Edit details instead."
    );
  }

  const [returnCount] = await db
    .select({ c: count() })
    .from(purchaseReturns)
    .where(eq(purchaseReturns.supplierId, id));
  if (returnCount.c > 0) {
    throw new Error(
      "Cannot delete this supplier — purchase returns are linked. Edit details instead."
    );
  }

  const [paymentCount] = await db
    .select({ c: count() })
    .from(partyPayments)
    .where(eq(partyPayments.supplierId, id));
  if (paymentCount.c > 0) {
    throw new Error(
      "Cannot delete this supplier — payments are linked. Edit details instead."
    );
  }

  const [deleted] = await db
    .delete(suppliers)
    .where(eq(suppliers.id, id))
    .returning({ id: suppliers.id });

  if (!deleted) throw new Error("Supplier not found");
  await revalidateSupplierPaths(id);
}

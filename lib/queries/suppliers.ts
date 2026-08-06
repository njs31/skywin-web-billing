import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

export const getSuppliers = unstable_cache(
  async () => db.select().from(suppliers).orderBy(asc(suppliers.name)),
  ["suppliers-list"],
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

export async function createSupplier(input: CreateSupplierInput | string, contact?: string) {
  const { revalidatePath, revalidateTag } = await import("next/cache");

  // Back-compat: older callers passed (name, contact)
  const parsed =
    typeof input === "string"
      ? createSupplierSchema.parse({ name: input, phone: contact })
      : createSupplierSchema.parse(input);

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

  try {
    const [supplier] = await db
      .insert(suppliers)
      .values({
        name: parsed.name,
        gstin,
        pan,
        address: parsed.address || null,
        city: parsed.city || null,
        state: parsed.state || null,
        pinCode: parsed.pinCode || null,
        phone,
        contact: phone,
      })
      .returning();

    revalidateTag("suppliers", "max");
    revalidatePath("/suppliers");
    revalidatePath("/purchases/new");
    return supplier;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("unique") || message.includes("duplicate")) {
      throw new Error("A supplier with this name already exists");
    }
    throw err;
  }
}

import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

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

export async function createSupplier(name: string, contact?: string) {
  const { db } = await import("@/db");
  const { revalidatePath, revalidateTag } = await import("next/cache");
  const [supplier] = await db
    .insert(suppliers)
    .values({ name, contact })
    .returning();
  revalidateTag("suppliers", "max");
  revalidatePath("/suppliers");
  return supplier;
}

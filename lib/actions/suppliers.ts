"use server";

import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getSuppliers() {
  return db.select().from(suppliers).orderBy(asc(suppliers.name));
}

export async function getSupplierById(id: number) {
  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, id))
    .limit(1);
  return supplier ?? null;
}

export async function createSupplier(name: string, contact?: string) {
  const [supplier] = await db
    .insert(suppliers)
    .values({ name, contact })
    .returning();
  revalidatePath("/suppliers");
  return supplier;
}

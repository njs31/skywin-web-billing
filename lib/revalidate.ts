/** Safe wrappers so scripts/tests outside a Next request don't crash. */
export async function safeRevalidateTag(
  ...args: Parameters<typeof import("next/cache").revalidateTag>
) {
  try {
    const { revalidateTag } = await import("next/cache");
    revalidateTag(...args);
  } catch {
    // Outside Next.js request context (CLI scripts).
  }
}

export async function safeRevalidatePath(
  ...args: Parameters<typeof import("next/cache").revalidatePath>
) {
  try {
    const { revalidatePath } = await import("next/cache");
    revalidatePath(...args);
  } catch {
    // Outside Next.js request context (CLI scripts).
  }
}

/**
 * Carousel banners in the Field app (Raja, 26 Nov 2026). Pure rules shared by the dashboard,
 * the server and tests (lib/field-banner-rules.test.ts).
 */

export type BannerPlacement = "products" | "category";

/** Who may add, hide, reorder or remove banners: admins and managers only. */
export function canManageBanners(role: string | null | undefined) {
  return role === "admin" || role === "manager";
}

export type BannerInput = {
  imageUrl: string;
  placement: string;
  categoryId?: number | null;
  productId?: number | null;
  title?: string | null;
};

export type CleanBanner = {
  imageUrl: string;
  placement: BannerPlacement;
  categoryId: number | null;
  productId: number | null;
  title: string | null;
};

const positiveInt = (n: unknown) => {
  const v = Number(n);
  return Number.isInteger(v) && v > 0 ? v : null;
};

/**
 * Checks a banner. `cleanImage` turns the uploaded image address into the stored one and throws
 * when it isn't an image uploaded from the dashboard.
 */
export function checkBanner(input: BannerInput, cleanImage: (uri: string) => string | null): { value: CleanBanner; errors: string[] } {
  const errors: string[] = [];
  const placement: BannerPlacement = input.placement === "category" ? "category" : "products";
  if (input.placement !== "category" && input.placement !== "products") errors.push("Choose where the banner shows.");
  const categoryId = placement === "category" ? positiveInt(input.categoryId) : null;
  if (placement === "category" && !categoryId) errors.push("Choose the category for this banner.");
  let imageUrl = "";
  const raw = String(input.imageUrl ?? "").trim();
  if (!raw) errors.push("Upload a picture first.");
  else {
    try {
      imageUrl = cleanImage(raw) ?? "";
      if (!imageUrl) errors.push("Upload a picture first.");
    } catch {
      errors.push("Upload the picture from this page.");
    }
  }
  const title = String(input.title ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || null;
  return {
    value: { imageUrl, placement, categoryId, productId: positiveInt(input.productId), title },
    errors,
  };
}

export type AppBanner = {
  id: number;
  imageUrl: string;
  placement: BannerPlacement;
  category: string | null;
  productId: number | null;
};

/** The banners for one app page, in their order. `category` is the category's slug. */
export function bannersFor(all: AppBanner[], placement: BannerPlacement, category?: string | null) {
  return all.filter((b) => b.placement === placement && (placement === "products" || b.category === (category ?? null)));
}

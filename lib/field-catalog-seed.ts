export type FieldCatalogSeedSub = {
  slug: string;
  title: string;
  queries: string[];
  matchTerms: string[];
  iconKey: string;
  iconUri?: string;
  iconTint: boolean;
  productIds: number[];
};

export type FieldCatalogSeedCategory = {
  slug: string;
  title: string;
  queries: string[];
  iconKey: string;
  subs: FieldCatalogSeedSub[];
};

/** TYPE column from the dimension sheet, in that sheet's wording and order. */
const SHEET_TYPES = [
  "PESTICIDES",
  "ORGANIC",
  "MICRO NUTRIENTS",
  "WATER SOLUBLE FERTILIZER",
  "BIO-STIMULENT",
] as const;

function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const FIELD_CATALOG_SEED: FieldCatalogSeedCategory[] = SHEET_TYPES.map((title) => {
  const slug = slugify(title);
  return {
    slug,
    title,
    queries: [title],
    iconKey: slug,
    subs: [
      {
        slug: "all",
        title,
        queries: [title],
        matchTerms: [title],
        iconKey: slug,
        iconTint: true,
        productIds: [],
      },
    ],
  };
});

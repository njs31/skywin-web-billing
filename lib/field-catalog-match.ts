/** Product ids for a Shop search that names a category or subcategory (older app builds search by title). */
export type CatalogMatchSub = { slug: string; title: string; queries: string[]; matchTerms: string[]; productIds: number[] };
export type CatalogMatchCategory = { slug: string; title: string; queries: string[]; subs: CatalogMatchSub[] };

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function catalogProductIdsForQuery(tree: CatalogMatchCategory[], q: string): number[] | null {
  const key = norm(q);
  if (!key) return null;
  const ids: number[] = [];
  let matched = false;
  for (const category of tree) {
    const catHit = [category.slug, category.title, ...category.queries].some((t) => norm(t) === key);
    for (const sub of category.subs) {
      const subHit = catHit || [sub.title, ...sub.queries, ...sub.matchTerms].some((t) => norm(t) === key);
      if (subHit) {
        matched = true;
        ids.push(...sub.productIds);
      }
    }
  }
  return matched ? [...new Set(ids)] : null;
}

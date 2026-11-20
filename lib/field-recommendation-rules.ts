export type RecommendationDraft = {
  crop: string;
  stage: string;
  problem: string;
  note: string;
  productIds: number[];
};

const MAX_PRODUCTS = 8;

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function recommendationInputError(input: RecommendationDraft): string | null {
  const crop = clean(input.crop);
  const stage = clean(input.stage);
  const problem = clean(input.problem);
  const note = clean(input.note);
  if (crop.length < 2 || crop.length > 40) return "Enter the crop (2–40 characters).";
  if (stage.length > 80) return "Stage is too long.";
  if (problem.length < 2 || problem.length > 160) return "Enter the problem (2–160 characters).";
  if (note.length > 500) return "Note is too long.";
  if (input.productIds.length < 1) return "Choose at least one product.";
  if (input.productIds.length > MAX_PRODUCTS) return `Choose at most ${MAX_PRODUCTS} products.`;
  if (input.productIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return "Choose products from the field catalogue.";
  }
  if (new Set(input.productIds).size !== input.productIds.length) {
    return "Each product can be added once.";
  }
  return null;
}

export function cleanRecommendation(input: RecommendationDraft): RecommendationDraft {
  const error = recommendationInputError(input);
  if (error) throw new Error(error);
  return {
    crop: clean(input.crop),
    stage: clean(input.stage),
    problem: clean(input.problem),
    note: clean(input.note),
    productIds: input.productIds,
  };
}

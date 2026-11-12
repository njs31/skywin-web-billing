import { fieldRecommendationsPage } from "@/lib/actions/field";
import { RecommendationsPanel } from "./recommendations-panel";

export default async function FieldRecommendationsPage() {
  const data = await fieldRecommendationsPage();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recommendations</h1>
        <p className="max-w-3xl text-sm text-[#2E4A22]/70">
          Administrators define crop recommendations here. Field officers define them in the Field app.
          An officer sees the rows that match the farmer’s crops. They are suggestions, and any in-stock product can still be ordered.
        </p>
      </div>
      <RecommendationsPanel initial={data.recommendations} canEdit={data.canEdit} />
    </div>
  );
}

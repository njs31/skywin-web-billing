import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth";
import { fieldRecommendationsPage } from "@/lib/actions/field";
import { canUseFieldRecommendations } from "@/lib/field-recommendation-access";
import { RecommendationsPanel } from "./recommendations-panel";

export const dynamic = "force-dynamic";

export default async function FieldRecommendationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canUseFieldRecommendations(user.role)) redirect("/field");
  const data = await fieldRecommendationsPage();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recommendations</h1>
        <p className="max-w-3xl text-sm text-[#2E4A22]/70">
          Field officers recommend products for the farmers assigned to them. Each farmer sees their own recommendations in the app.
          They are suggestions, and any in-stock product can still be ordered.
        </p>
      </div>
      <RecommendationsPanel initial={data.recommendations} canEdit={data.canEdit} />
    </div>
  );
}

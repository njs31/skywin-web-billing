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
  return <RecommendationsPanel initial={data.recommendations} canEdit={data.canEdit} />;
}

import { fieldRoutePage } from "@/lib/actions/field";
import { RoutePlanner } from "./route-planner";

export const dynamic = "force-dynamic";

/** Optimised delivery route for every order still to deliver, from the office and back. */
export default async function FieldDeliveryRoutePage() {
  const data = await fieldRoutePage();
  return <RoutePlanner office={data.office} stops={data.stops} />;
}

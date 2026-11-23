import { fieldBroadcastsPage } from "@/lib/actions/field";
import { BroadcastDesk } from "./broadcast-desk";

export const dynamic = "force-dynamic";

/** Send a notification to every Field app user, and see the ones already sent. */
export default async function FieldNotificationsPage() {
  const data = await fieldBroadcastsPage();
  return <BroadcastDesk sent={data.sent} audience={data.audience} />;
}

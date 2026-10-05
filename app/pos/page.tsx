import { PosScreen } from "@/components/pos/pos-screen";
import { getCustomers } from "@/lib/queries/customers";
import { getSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/actions/auth";

export default async function PosPage() {
  const [customers, settings, user] = await Promise.all([
    getCustomers(),
    getSettings(),
    getCurrentUser(),
  ]);

  return (
    <PosScreen
      customers={customers}
      defaultOperator={
        user?.name?.trim() || settings.defaultOperator || "Counter"
      }
    />
  );
}

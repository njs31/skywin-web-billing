import { PosScreen } from "@/components/pos/pos-screen";
import { getCustomers } from "@/lib/queries/customers";
import { getSettings } from "@/lib/settings";

export default async function PosPage() {
  const [customers, settings] = await Promise.all([
    getCustomers(),
    getSettings(),
  ]);

  return (
    <PosScreen
      customers={customers}
      defaultOperator={settings.defaultOperator}
    />
  );
}

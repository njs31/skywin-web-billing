import { getSettings } from "@/lib/settings";
import { SettingsForm } from "@/components/settings/settings-form";

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-slate-500">
          Business details, billing defaults, and system preferences
        </p>
      </div>
      <SettingsForm settings={settings} />
    </div>
  );
}

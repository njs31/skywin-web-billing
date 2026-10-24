import { fieldOfficers } from "@/lib/actions/field";
import { OfficersPanel } from "./officers-panel";

export default async function FieldOfficersPage() {
  const officers = await fieldOfficers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Field officers</h1>
        <p className="text-sm text-[#2E4A22]/70">
          Add, edit, or remove officers here. Only numbers listed with app access (plus billing admins)
          can sign into the SkyWin Field app.
        </p>
      </div>
      <OfficersPanel officers={officers} />
    </div>
  );
}

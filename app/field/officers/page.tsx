import { fieldOfficers } from "@/lib/actions/field";
import { OfficersPanel } from "./officers-panel";

export default async function FieldOfficersPage() {
  const officers = await fieldOfficers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Field officers</h1>
        <p className="text-sm text-[#2E4A22]/70">
          Registered billing users are listed here and can sign into the Field app as an officer.
          Their billing role stays the same.
        </p>
      </div>
      <OfficersPanel officers={officers} />
    </div>
  );
}

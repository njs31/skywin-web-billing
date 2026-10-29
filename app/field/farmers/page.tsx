import { fieldFarmersList, fieldOfficers } from "@/lib/actions/field";
import { FarmersWorkspace } from "./farmer-form";

export default async function FieldFarmersPage() {
  const [result, officers] = await Promise.all([fieldFarmersList({ page: 1 }), fieldOfficers()]);
  return (
    <div className="mx-auto max-w-6xl">
      <FarmersWorkspace
        initial={result}
        officers={officers.map((officer) => ({ id: officer.id, name: officer.name, phone: officer.phone }))}
      />
    </div>
  );
}

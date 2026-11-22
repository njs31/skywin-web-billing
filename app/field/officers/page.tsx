import { fieldOfficers } from "@/lib/actions/field";
import { OfficersPanel } from "./officers-panel";

export default async function FieldOfficersPage() {
  const officers = await fieldOfficers();
  return <OfficersPanel officers={officers} />;
}

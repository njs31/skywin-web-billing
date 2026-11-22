import { notFound } from "next/navigation";
import { fieldFarmerDetail, fieldOfficers } from "@/lib/actions/field";
import { FarmerEditor } from "../farmer-form";
import { PageHeader } from "@/components/field/kit";
import { getFieldLang } from "@/lib/field-lang";
import { fieldText } from "@/lib/field-i18n";

export default async function FieldFarmerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const farmerId = Number(id);
  if (!Number.isFinite(farmerId)) notFound();
  const [farmer, officers, lang] = await Promise.all([fieldFarmerDetail(farmerId), fieldOfficers(), getFieldLang()]);
  if (!farmer) notFound();
  const f = fieldText(lang).farmers;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        back={{ href: "/field/farmers", label: f.title }}
        title={farmer.name}
        description={`${[farmer.village, farmer.territory].filter(Boolean).join(", ") || f.noVillage} · ${farmer.assignedOfficer || f.noOfficer}`}
      />
      <FarmerEditor farmer={farmer} officers={officers.map((officer) => ({ id: officer.id, name: officer.name, phone: officer.phone }))} />
    </div>
  );
}

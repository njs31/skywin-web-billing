import { notFound } from "next/navigation";
import Link from "next/link";
import { fieldFarmerDetail, fieldOfficers } from "@/lib/actions/field";
import { FarmerEditor } from "../farmer-form";

export default async function FieldFarmerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const farmerId = Number(id);
  if (!Number.isFinite(farmerId)) notFound();
  const [farmer, officers] = await Promise.all([fieldFarmerDetail(farmerId), fieldOfficers()]);
  if (!farmer) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/field/farmers" className="text-xs font-medium text-[#245B3E] hover:underline">
        Farmers
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#1E3317]">{farmer.name}</h1>
        <p className="mt-1 text-sm text-[#5E6B62]">
          {[farmer.village, farmer.territory].filter(Boolean).join(", ") || "No village recorded"} ·{" "}
          {farmer.assignedOfficer || "No officer"}
        </p>
      </div>
      <div className="rounded-lg border border-[#1E3317]/10 bg-white p-4">
        <FarmerEditor
          farmer={farmer}
          officers={officers.map((officer) => ({ id: officer.id, name: officer.name, phone: officer.phone }))}
        />
      </div>
    </div>
  );
}

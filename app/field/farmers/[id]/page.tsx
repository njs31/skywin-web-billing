import { notFound } from "next/navigation";
import Link from "next/link";
import { fieldFarmerDetail, fieldOfficers } from "@/lib/actions/field";
import { FarmerEditForm } from "../farmer-form";

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
    <div className="space-y-5">
      <Link href="/field/farmers" className="text-sm font-medium text-[#2E4A22]/70 hover:underline">
        ← Farmers
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{farmer.name}</h1>
        <p className="text-sm text-[#2E4A22]/70">
          {[farmer.village, farmer.territory].filter(Boolean).join(", ") || "No village"} · {farmer.assignedOfficer || "No officer"} · {farmer.approval}
        </p>
      </div>
      <FarmerEditForm farmer={farmer} officers={officers} />
    </div>
  );
}

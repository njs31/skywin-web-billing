import Link from "next/link";
import { fieldFarmersList, fieldOfficers } from "@/lib/actions/field";
import { FarmerCreateForm } from "./farmer-form";

export default async function FieldFarmersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; approval?: string }>;
}) {
  const params = await searchParams;
  const approval =
    params.approval === "pending" || params.approval === "approved" || params.approval === "rejected"
      ? params.approval
      : "all";
  const [farmers, officers] = await Promise.all([
    fieldFarmersList({ q: params.q, approval }),
    fieldOfficers(),
  ]);

  const pills = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Farmers</h1>
          <p className="text-sm text-[#2E4A22]/70">{farmers.length} farmer records from the Field app.</p>
        </div>
        <form className="flex gap-2">
          <input type="hidden" name="approval" value={approval} />
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Name, village, phone"
            className="h-10 rounded-lg border border-[#1E3317]/15 bg-white px-3 text-sm"
          />
          <button className="h-10 rounded-lg bg-[#1E3317] px-4 text-sm font-semibold text-white">Search</button>
        </form>
      </div>
      <div className="flex gap-2">
        {pills.map((pill) => (
          <Link
            key={pill.key}
            href={pill.key === "all" ? "/field/farmers" : `/field/farmers?approval=${pill.key}`}
            className={`rounded-full px-3 py-1.5 text-sm ${
              approval === pill.key ? "bg-[#1E3317] text-white" : "bg-white text-[#1E3317] border border-[#1E3317]/15"
            }`}
          >
            {pill.label}
          </Link>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#FFF7F5] text-left text-xs uppercase tracking-wide text-[#2E4A22]/60">
            <tr>
              <th className="px-4 py-3">Farmer</th>
              <th className="px-4 py-3">Village</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Officer</th>
              <th className="px-4 py-3">Approval</th>
              <th className="px-4 py-3">Crops · acres</th>
              <th className="px-4 py-3">Payment</th>
            </tr>
          </thead>
          <tbody>
            {farmers.map((farmer) => (
              <tr key={farmer.id} className="border-t border-[#1E3317]/10">
                <td className="px-4 py-3">
                  <Link href={`/field/farmers/${farmer.id}`} className="font-semibold hover:underline">
                    {farmer.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{farmer.village || "—"}</td>
                <td className="px-4 py-3">{farmer.phone || "—"}</td>
                <td className="px-4 py-3">{farmer.assignedOfficer || "—"}</td>
                <td className="px-4 py-3">{farmer.approval}</td>
                <td className="px-4 py-3">
                  {farmer.farms.length
                    ? farmer.farms.map((farm) => `${farm.crop || "—"} ${farm.acres} ac`).join(", ")
                    : "—"}
                </td>
                <td className="px-4 py-3 uppercase">{farmer.paymentMode}</td>
              </tr>
            ))}
            {farmers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[#2E4A22]/50">
                  No farmers yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <FarmerCreateForm officers={officers} />
    </div>
  );
}

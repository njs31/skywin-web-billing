import Link from "next/link";
import { fieldFarmersList, fieldOfficers } from "@/lib/actions/field";
import { FarmerSearchBar } from "./farmer-form";

function farmersHref(input: { approval: string; q?: string; page?: number }) {
  const sp = new URLSearchParams();
  if (input.approval !== "all") sp.set("approval", input.approval);
  if (input.q) sp.set("q", input.q);
  if (input.page && input.page > 1) sp.set("page", String(input.page));
  const query = sp.toString();
  return query ? `/field/farmers?${query}` : "/field/farmers";
}

export default async function FieldFarmersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; approval?: string; page?: string }>;
}) {
  const params = await searchParams;
  const approval =
    params.approval === "pending" || params.approval === "approved" || params.approval === "rejected"
      ? params.approval
      : "all";
  const requestedPage = Number(params.page);
  const [result, officers] = await Promise.all([
    fieldFarmersList({
      q: params.q,
      approval,
      page: Number.isFinite(requestedPage) ? requestedPage : 1,
    }),
    fieldOfficers(),
  ]);
  const { farmers, total, page, pageSize } = result;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

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
          <p className="text-sm text-[#2E4A22]/70">
            {total.toLocaleString("en-IN")} farmers from the Field app
            {total > 0 ? ` · showing ${from.toLocaleString("en-IN")}–${to.toLocaleString("en-IN")}` : ""}
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {pills.map((pill) => (
            <Link
              key={pill.key}
              href={farmersHref({ approval: pill.key, q: params.q })}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                approval === pill.key ? "bg-[#1E3317] text-white" : "bg-white text-[#1E3317] border border-[#1E3317]/15"
              }`}
            >
              {pill.label}
            </Link>
          ))}
        </div>
        <FarmerSearchBar approval={approval} query={params.q ?? ""} officers={officers} />
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#FFF7F5] text-left text-xs uppercase tracking-wide text-[#2E4A22]/60">
            <tr>
              <th className="px-4 py-3">Farmer</th>
              <th className="px-4 py-3">Village</th>
              <th className="px-4 py-3">Territory</th>
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
                <td className="px-4 py-3">{farmer.territory || "—"}</td>
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
                <td colSpan={8} className="px-4 py-10 text-center text-[#2E4A22]/50">
                  No farmers yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <Link
            href={farmersHref({ approval, q: params.q, page: page - 1 })}
            className={`rounded-lg border border-[#1E3317]/15 bg-white px-3 py-2 font-medium ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
          >
            Previous
          </Link>
          <span className="text-[#2E4A22]/70">
            Page {page.toLocaleString("en-IN")} of {pages.toLocaleString("en-IN")}
          </span>
          <Link
            href={farmersHref({ approval, q: params.q, page: page + 1 })}
            className={`rounded-lg border border-[#1E3317]/15 bg-white px-3 py-2 font-medium ${page >= pages ? "pointer-events-none opacity-40" : ""}`}
          >
            Next
          </Link>
        </div>
      ) : null}
    </div>
  );
}

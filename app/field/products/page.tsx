import Link from "next/link";
import { fieldProductsList } from "@/lib/actions/field";

export default async function FieldProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; c?: string }>;
}) {
  const { q = "", c = "" } = await searchParams;
  const all = await fieldProductsList();
  const categories = [...new Map(all.map((p) => [p.categorySlug, p.category])).entries()];
  const needle = q.trim().toLowerCase();
  const rows = all.filter(
    (p) =>
      (!c || p.categorySlug === c) &&
      (!needle || p.name.toLowerCase().includes(needle) || (p.sku ?? "").toLowerCase().includes(needle))
  );
  const filled = all.filter((p) => p.hasDetails).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Product details</h1>
        <p className="text-sm text-[#2E4A22]/70">
          Every active product in billing inventory. {filled} of {all.length} have farmer details filled in.
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name or SKU"
          className="h-9 w-64 rounded-lg border border-[#1E3317]/15 bg-white px-3 text-sm"
        />
        <select
          name="c"
          defaultValue={c}
          className="h-9 rounded-lg border border-[#1E3317]/15 bg-white px-3 text-sm"
        >
          <option value="">All categories</option>
          {categories.map(([slug, title]) => (
            <option key={slug} value={slug}>
              {title}
            </option>
          ))}
        </select>
        <button className="h-9 rounded-lg bg-[#1E3317] px-4 text-sm font-semibold text-white">Filter</button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#1E3317]/5 text-left text-xs uppercase tracking-wide text-[#2E4A22]/60">
            <tr>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Details</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.productId} className="border-t border-[#1E3317]/5">
                <td className="px-4 py-2.5">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-[#2E4A22]/60">{p.sku || `ID ${p.productId}`}</p>
                </td>
                <td className="px-4 py-2.5 text-[#2E4A22]/80">
                  {p.category} · {p.sub}
                </td>
                <td className="px-4 py-2.5">
                  {p.hasDetails ? (
                    <span className="rounded-full bg-[#B8D94A]/40 px-2 py-0.5 text-xs font-semibold">Filled</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      Empty
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/field/products/${p.productId}`}
                    className="font-semibold text-[#2E4A22] hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[#2E4A22]/60">
                  No active products in billing inventory.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

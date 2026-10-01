const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * Stable table-shaped placeholder while the invoice list loads: same
 * header, same columns, pulsing rows — no layout jump, no giant spinner.
 */
export default function Loading() {
  return (
    <div className="space-y-5 p-6" aria-label="Loading invoices" role="status">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-32 animate-pulse rounded-md bg-slate-200" />
          <div className="h-4 w-64 animate-pulse rounded-md bg-slate-100" />
        </div>
        <div className="h-10 w-28 animate-pulse rounded-lg bg-slate-200" />
      </div>

      <div
        aria-hidden
        className="overflow-hidden rounded-lg border border-slate-200 bg-white"
      >
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
        </div>
        <table className="w-full">
          <tbody>
            {SKELETON_ROWS.map((i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-3">
                  <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
                </td>
                <td className="hidden px-3 py-3 sm:table-cell">
                  <div className="h-4 w-14 animate-pulse rounded bg-slate-100" />
                </td>
                <td className="hidden px-3 py-3 md:table-cell">
                  <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
                </td>
                <td className="px-3 py-3">
                  <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                </td>
                <td className="px-3 py-3">
                  <div className="ml-auto h-4 w-16 animate-pulse rounded bg-slate-200" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

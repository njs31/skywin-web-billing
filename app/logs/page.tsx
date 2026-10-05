import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/actions/auth";
import { getActivityLogs } from "@/lib/actions/activity-logs";
import { formatDateTimeIST } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role === "dealer") {
    redirect("/");
  }

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const { rows, total, pageSize } = await getActivityLogs({ q, page, pageSize: 50 });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const href = (nextPage: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (nextPage > 1) query.set("page", String(nextPage));
    const s = query.toString();
    return s ? `/logs?${s}` : "/logs";
  };

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-bold">Logs</h1>
        <p className="text-sm text-slate-500">
          What each person did in the software.
        </p>
      </div>

      <form className="flex max-w-md gap-2" action="/logs">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search name or activity…"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-48">When</TableHead>
              <TableHead>What happened</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="h-24 text-center text-sm text-slate-400">
                  No activity yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs text-slate-500">
                    {formatDateTimeIST(row.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-slate-800">
                    {row.message}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
            <span>
              {total.toLocaleString("en-IN")}{" "}
              {total === 1 ? "entry" : "entries"}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={href(page - 1)}>Previous</Link>
                </Button>
              ) : null}
              <span className="self-center">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={href(page + 1)}>Next</Link>
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

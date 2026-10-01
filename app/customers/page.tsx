import Link from "next/link";
import {
  getCustomersWithOutstanding,
  getCustomersPaged,
  parseCustomerListParams,
  CUSTOMER_PAGE_SIZE,
} from "@/lib/queries/customers";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomerForm } from "@/components/customers/customer-form";
import { CustomerFilters } from "@/components/customers/customer-filters";

const CUSTOMER_TYPES = [
  { key: "all", label: "All" },
  { key: "retail", label: "Retail" },
  { key: "wholesale", label: "Wholesale" },
  { key: "farmer", label: "Farmer" },
] as const;

function listHref(params: { q: string; type: string; page: number }): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.type !== "all") query.set("type", params.type);
  if (params.page > 1) query.set("page", String(params.page));
  const s = query.toString();
  return s ? `/customers?${s}` : "/customers";
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  const filter = parseCustomerListParams(await searchParams);
  const outstandingP = getCustomersWithOutstanding();
  const first = await getCustomersPaged(filter);
  let customers = first.rows;
  const total = first.total;
  const totalPages = Math.max(1, Math.ceil(total / CUSTOMER_PAGE_SIZE));
  let page = filter.page;
  if (page > totalPages) {
    page = totalPages;
    ({ rows: customers } = await getCustomersPaged({ ...filter, page }));
  }
  const outstanding = await outstandingP;
  const pill = (active: boolean) =>
    `inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors ${
      active
        ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
    }`;
  const filtered = filter.q !== "" || filter.type !== "all";

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-slate-500">
            {filtered
              ? `${total} matching ${total === 1 ? "party" : "parties"}`
              : `${total} parties — farmers, retail & wholesale buyers`}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Add Customer</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerForm />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Outstanding Receivables</CardTitle>
          </CardHeader>
          <CardContent>
            {outstanding.length === 0 ? (
              <p className="text-sm text-slate-400">No outstanding balances.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outstanding.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link
                          href={`/customers/${c.id}`}
                          className="font-medium text-emerald-700 hover:underline"
                        >
                          {c.name}
                        </Link>
                      </TableCell>
                      <TableCell>{c.phone ?? "-"}</TableCell>
                      <TableCell className="text-right font-semibold text-amber-600">
                        {formatCurrency(c.outstanding)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Customers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CustomerFilters
            key={`${filter.q}-${filter.type}`}
            defaultQuery={filter.q}
            type={filter.type}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Type
            </span>
            {CUSTOMER_TYPES.map((t) => (
              <Link
                key={t.key}
                href={listHref({ q: filter.q, type: t.key, page: 1 })}
                className={pill(t.key === filter.type)}
              >
                {t.label}
              </Link>
            ))}
            {filtered && (
              <Button asChild size="sm" variant="ghost">
                <Link href="/customers">Clear all</Link>
              </Button>
            )}
          </div>
        </CardContent>
        <CardContent className="p-0">
          {customers.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">
              {filtered
                ? "No customers match these filters."
                : "No customers yet. Add one above."}
            </p>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>Membership</TableHead>
                <TableHead className="text-right">Credit Limit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      href={`/customers/${c.id}`}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize">{c.type}</TableCell>
                  <TableCell>{c.phone ?? "-"}</TableCell>
                  <TableCell className="text-xs">{c.gstin ?? "-"}</TableCell>
                  <TableCell className="text-xs">{c.membershipNo ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(c.creditLimit ?? 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            disabled={page <= 1}
          >
            <Link
              href={listHref({ q: filter.q, type: filter.type, page: page - 1 })}
            >
              Previous
            </Link>
          </Button>
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </span>
          <Button
            asChild
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
          >
            <Link
              href={listHref({ q: filter.q, type: filter.type, page: page + 1 })}
            >
              Next
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

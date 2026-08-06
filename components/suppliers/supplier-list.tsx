"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Supplier } from "@/db/schema";
import { formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { InlineLoader } from "@/components/ui/page-loader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SupplierRowActions } from "@/components/suppliers/supplier-row-actions";

export function SupplierList({
  suppliers,
  totalCount,
  currentPage,
  pageSize,
  defaultQuery = "",
}: {
  suppliers: Supplier[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  defaultQuery?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultQuery);
  const [isPending, startTransition] = useTransition();
  const skipFirst = useRef(true);

  useEffect(() => {
    setQuery(defaultQuery);
  }, [defaultQuery]);

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      const next = `/suppliers?${params.toString()}`;
      startTransition(() => {
        router.replace(next);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, router]);

  const startIndex = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalCount);

  return (
    <div>
      <div className="border-b px-4 py-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, GST, mobile, city…"
          aria-label="Search suppliers"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>
            {totalCount === 0
              ? "0 suppliers found"
              : `Showing ${startIndex}–${endIndex} of ${totalCount} suppliers`}
            {query.trim() ? ` for “${query.trim()}”` : ""}
          </span>
          {isPending && <InlineLoader label="Searching suppliers…" />}
        </div>
      </div>

      {suppliers.length === 0 ? (
        <p className="px-6 py-6 text-sm text-slate-400">
          {query.trim()
            ? "No suppliers match your search."
            : "No suppliers yet. Add one to use in Purchase Entry."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>GST</TableHead>
              <TableHead>City</TableHead>
              <TableHead className="text-right">Purchased</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((supplier) => (
              <TableRow key={supplier.id}>
                <TableCell className="font-medium">{supplier.name}</TableCell>
                <TableCell className="font-mono text-xs">
                  {supplier.phone || "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {supplier.gstin || "—"}
                </TableCell>
                <TableCell>{supplier.city || "—"}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(supplier.totalPurchased)}
                </TableCell>
                <TableCell className="text-right">
                  <SupplierRowActions supplier={supplier} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

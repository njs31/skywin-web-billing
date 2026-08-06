"use client";

import { useMemo, useState } from "react";
import type { Supplier } from "@/db/schema";
import { formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SupplierRowActions } from "@/components/suppliers/supplier-row-actions";

export function SupplierList({ suppliers }: { suppliers: Supplier[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => {
      const haystack = [
        s.name,
        s.phone,
        s.gstin,
        s.pan,
        s.city,
        s.state,
        s.pinCode,
        s.address,
        s.contact,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [suppliers, query]);

  return (
    <div>
      <div className="border-b px-4 py-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, GST, mobile, city…"
          aria-label="Search suppliers"
        />
        <p className="mt-2 text-xs text-slate-500">
          Showing {filtered.length} of {suppliers.length} suppliers
          {query.trim() ? ` for “${query.trim()}”` : ""}
        </p>
      </div>

      {suppliers.length === 0 ? (
        <p className="px-6 py-6 text-sm text-slate-400">
          No suppliers yet. Add one to use in Purchase Entry.
        </p>
      ) : filtered.length === 0 ? (
        <p className="px-6 py-6 text-sm text-slate-400">
          No suppliers match your search.
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
            {filtered.map((supplier) => (
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

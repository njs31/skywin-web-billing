"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import type { Customer, Supplier } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReturnForm } from "./return-form";
import { PurchaseReturnForm } from "./purchase-return-form";
import Link from "next/link";

type ReturnsContainerProps = {
  initialSaleReturns: any[];
  initialPurchaseReturns: any[];
  customers: Customer[];
  suppliers: Supplier[];
};

export function ReturnsContainer({
  initialSaleReturns,
  initialPurchaseReturns,
  customers,
  suppliers,
}: ReturnsContainerProps) {
  const [activeTab, setActiveTab] = useState<"sales" | "purchases">("sales");

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Returns (Debit & Credit Notes)</h1>
          <p className="text-sm text-slate-500">
            Manage credit notes for customers and debit notes for suppliers
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/invoices">Invoices</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/purchases">Purchases</Link>
          </Button>
        </div>
      </div>

      {/* Custom Sleek Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("sales")}
          className={`border-b-2 px-6 py-3 text-sm font-semibold transition-all ${
            activeTab === "sales"
              ? "border-emerald-600 text-emerald-700 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
          }`}
        >
          Credit Notes (Sales Returns)
        </button>
        <button
          onClick={() => setActiveTab("purchases")}
          className={`border-b-2 px-6 py-3 text-sm font-semibold transition-all ${
            activeTab === "purchases"
              ? "border-emerald-600 text-emerald-700 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
          }`}
        >
          Debit Notes (Purchase Returns)
        </button>
      </div>

      {activeTab === "sales" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New Credit Note (Customer Return)</CardTitle>
            </CardHeader>
            <CardContent>
              <ReturnForm customers={customers} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Credit Note History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {initialSaleReturns.length === 0 ? (
                <p className="p-6 text-sm text-slate-400">No customer returns recorded.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Return No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Original Invoice</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {initialSaleReturns.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-semibold text-slate-900">{r.returnNo}</TableCell>
                        <TableCell>
                          {new Date(r.date).toLocaleDateString("en-IN")}
                        </TableCell>
                        <TableCell>{r.saleInvoiceNo ?? "-"}</TableCell>
                        <TableCell>{r.reason ?? "-"}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-700">
                          {formatCurrency(r.grandTotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "purchases" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New Debit Note (Supplier Return)</CardTitle>
            </CardHeader>
            <CardContent>
              <PurchaseReturnForm suppliers={suppliers} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Debit Note History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {initialPurchaseReturns.length === 0 ? (
                <p className="p-6 text-sm text-slate-400">No supplier returns recorded.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Debit Note No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Original Invoice</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {initialPurchaseReturns.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-semibold text-slate-900">{r.returnNo}</TableCell>
                        <TableCell>
                          {new Date(r.date).toLocaleDateString("en-IN")}
                        </TableCell>
                        <TableCell>{r.supplierName}</TableCell>
                        <TableCell>{r.purchaseInvoiceNo ?? "-"}</TableCell>
                        <TableCell>{r.reason ?? "-"}</TableCell>
                        <TableCell className="text-right font-semibold text-red-600">
                          {formatCurrency(r.grandTotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { getEwayExportData } from "@/lib/actions/eway";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck } from "lucide-react";

export function EwayExportButton() {
  const todayStr = new Date().toISOString().split("T")[0];
  const now = new Date();
  const startOfMonthStr = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];

  const [startDate, setStartDate] = useState(startOfMonthStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [isPending, startTransition] = useTransition();

  const handleExport = () => {
    if (!startDate || !endDate) return;
    startTransition(async () => {
      try {
        const rows = await getEwayExportData(startDate, endDate);
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, "E-Way Bill");
        XLSX.writeFile(
          wb,
          `Skywin-EWay-Export-${startDate}-to-${endDate}.xlsx`
        );
      } catch (err) {
        alert(
          err instanceof Error ? err.message : "Failed to export E-Way data."
        );
      }
    });
  };

  return (
    <Card className="border-sky-200 bg-sky-50/10">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-sky-800">
          <Truck className="h-5 w-5 text-sky-600" />
          E-Way Bill Export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-500">
          B2B sales (customer GSTIN present) for Tally / E-Way import
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs font-semibold text-slate-600">
              Start Date
            </Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 h-10 bg-white"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600">
              End Date
            </Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 h-10 bg-white"
            />
          </div>
        </div>
        <Button
          onClick={handleExport}
          disabled={isPending || !startDate || !endDate}
          className="flex h-11 w-full items-center justify-center gap-2 bg-sky-600 font-medium text-white hover:bg-sky-700"
        >
          {isPending ? "Generating Export..." : "Download E-Way Excel"}
        </Button>
      </CardContent>
    </Card>
  );
}

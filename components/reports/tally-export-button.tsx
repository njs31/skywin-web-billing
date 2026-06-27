"use client";

import { useState, useTransition } from "react";
import { getTallyExportData } from "@/lib/actions/tally";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSpreadsheet } from "lucide-react";

export function TallyExportButton() {
  const todayStr = new Date().toISOString().split("T")[0];
  
  // Set default start date to beginning of current month
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
        const data = await getTallyExportData(startDate, endDate);
        
        // Create workbook
        const wb = XLSX.utils.book_new();
        
        // Helper to format sheet columns
        const sheetsMapping = [
          { name: "sales", rows: data.sales },
          { name: "purchase", rows: data.purchase },
          { name: "credit note", rows: data["credit note"] },
          { name: "debit note", rows: data["debit note"] },
          { name: "receipt", rows: data.receipt },
          { name: "payment", rows: data.payment },
        ];

        for (const sheet of sheetsMapping) {
          const ws = XLSX.utils.json_to_sheet(sheet.rows);
          XLSX.utils.book_append_sheet(wb, ws, sheet.name);
        }

        // Trigger file download
        XLSX.writeFile(wb, `Skywin-Tally-Export-${startDate}-to-${endDate}.xlsx`);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to export Tally data.");
      }
    });
  };

  return (
    <Card className="border-emerald-200 bg-emerald-50/10">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-emerald-800">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
          Tally Integration Export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs font-semibold text-slate-600">Start Date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-white h-10 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600">End Date</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-white h-10 mt-1"
            />
          </div>
        </div>
        <Button
          onClick={handleExport}
          disabled={isPending || !startDate || !endDate}
          className="w-full bg-emerald-600 hover:bg-emerald-700 h-11 text-white font-medium flex items-center justify-center gap-2"
        >
          {isPending ? "Generating Export..." : "Download Tally Excel Report"}
        </Button>
      </CardContent>
    </Card>
  );
}

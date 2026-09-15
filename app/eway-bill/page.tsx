import { Truck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function EwayBillComingSoonPage() {
  return (
    <div className="p-6">
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Truck className="h-10 w-10 text-emerald-600" />
          <h1 className="text-2xl font-bold">e-Way Bill</h1>
          <p className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Coming soon
          </p>
          <p className="text-sm text-slate-500">
            Generate e-way bills for dispatched consignments directly from Skywin.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

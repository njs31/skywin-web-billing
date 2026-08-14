import { getWidgetPayload } from "@/lib/queries/widget";
import { buildScriptableWidgetScript } from "@/lib/widget-script";
import { WidgetPreview } from "@/components/widget/widget-preview";
import { WidgetSetup } from "@/components/widget/widget-setup";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function WidgetSetupPage() {
  const payload = await getWidgetPayload();
  const script = buildScriptableWidgetScript();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Phone widget</h1>
        <p className="text-sm text-slate-500">
          Large Scriptable widget for iPhone: today&apos;s sales, 7-day graph, and
          low stock.
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[auto_1fr]">
        <Card className="w-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Large widget preview</CardTitle>
            <p className="text-xs text-slate-500">Live data · 338 × 354</p>
          </CardHeader>
          <CardContent>
            <WidgetPreview data={payload} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Install on iPhone</CardTitle>
          </CardHeader>
          <CardContent>
            <WidgetSetup script={script} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

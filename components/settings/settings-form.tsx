"use client";

import { useState, useTransition } from "react";
import { updateSettings } from "@/lib/actions/billing";
import type { AppSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [error, setError] = useState("");

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        await updateSettings(
          {
            businessName: fd.get("businessName") as string,
            tagline: fd.get("tagline") as string,
            address: fd.get("address") as string,
            phone: fd.get("phone") as string,
            email: fd.get("email") as string,
            gstin: fd.get("gstin") as string,
            defaultOperator: fd.get("defaultOperator") as string,
            invoicePrefix: fd.get("invoicePrefix") as string,
            allowNegativeStock: "false",
            inventoryAdminPinRequired: fd.get("inventoryAdminPinRequired") as string,
            inventoryAdminPin: fd.get("inventoryAdminPin") as string,
            qwicksMerchantId: fd.get("qwicksMerchantId") as string,
            qwicksApiKey: fd.get("qwicksApiKey") as string,
            qwicksHost: fd.get("qwicksHost") as string,
          },
          fd.get("currentPin") as string || undefined,
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save settings");
      }
    });
  };

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Business Name</Label>
              <Input name="businessName" defaultValue={settings.businessName} />
            </div>
            <div>
              <Label>Tagline</Label>
              <Input name="tagline" defaultValue={settings.tagline} />
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Input name="address" defaultValue={settings.address} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Phone</Label>
              <Input name="phone" defaultValue={settings.phone} />
            </div>
            <div>
              <Label>Email</Label>
              <Input name="email" defaultValue={settings.email} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>GSTIN</Label>
              <Input name="gstin" defaultValue={settings.gstin} />
            </div>
            <div>
              <Label>Default Operator</Label>
              <Input
                name="defaultOperator"
                defaultValue={settings.defaultOperator}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Invoice Prefix (Retail)</Label>
              <Input name="invoicePrefix" defaultValue={settings.invoicePrefix} />
            </div>
            <div>
              <Label>Allow Negative Stock</Label>
              <select
                name="allowNegativeStock"
                defaultValue="false"
                disabled
                className="flex h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 cursor-not-allowed"
              >
                <option value="false">No (Locked by policy)</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 border-t pt-4">
            <div className="sm:col-span-2">
              <h3 className="font-semibold text-base text-slate-900">QwicksApp Integration API</h3>
              <p className="text-xs text-slate-500">
                Configure QwicksApp API credentials and merchant endpoints for real-time inventory pulls, checkout stock validation, and order webhooks.
              </p>
            </div>
            <div>
              <Label>QwicksApp Merchant ID</Label>
              <Input name="qwicksMerchantId" defaultValue={settings.qwicksMerchantId} placeholder="SkywinKmu" />
            </div>
            <div>
              <Label>QwicksApp API Key (x-api-key)</Label>
              <Input name="qwicksApiKey" defaultValue={settings.qwicksApiKey} placeholder="skywin_qwicks_api_key_7596" />
            </div>
            <div className="sm:col-span-2">
              <Label>QwicksApp Host Environment</Label>
              <Input name="qwicksHost" defaultValue={settings.qwicksHost} placeholder="qwicks.app" />
            </div>
            <div className="sm:col-span-2 bg-slate-50 p-3 rounded-lg border text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">Integration Endpoints Hosted for QwicksApp Team:</p>
              <p>• <strong>Live Inventory Pull:</strong> <code className="bg-slate-200 px-1 rounded">GET /api/qwicks/inventory</code> or <code className="bg-slate-200 px-1 rounded">GET /api/updateInventory/{settings.qwicksMerchantId || "SkywinKmu"}</code></p>
              <p>• <strong>Stock Check at Checkout:</strong> <code className="bg-slate-200 px-1 rounded">POST /api/qwicks/stock-check</code></p>
              <p>• <strong>Order Ingestion Webhook:</strong> <code className="bg-slate-200 px-1 rounded">POST /api/qwicks/order-placed</code></p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 border-t pt-4">
            <div>
              <Label>Require PIN for Inventory alterations</Label>
              <select
                name="inventoryAdminPinRequired"
                defaultValue={settings.inventoryAdminPinRequired}
                className="flex h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
              >
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </div>
            <div>
              <Label>Current Supervisor PIN</Label>
              <Input
                type="password"
                name="currentPin"
                placeholder="Required to change PIN"
                className={
                  error && error.includes("PIN")
                    ? "border-red-500"
                    : ""
                }
              />
            </div>
            <div>
              <Label>New Supervisor PIN</Label>
              <Input
                type="password"
                name="inventoryAdminPin"
                defaultValue={settings.inventoryAdminPin}
                placeholder="e.g. 1234"
              />
            </div>
          </div>
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 font-medium">
              {error}
            </div>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save Settings"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

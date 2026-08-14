"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";

export function WidgetSetup({ script }: { script: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-5">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
        <li>
          Install{" "}
          <a
            href="https://scriptable.app"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-emerald-700 hover:underline"
          >
            Scriptable
          </a>{" "}
          from the App Store.
        </li>
        <li>
          Open Scriptable → tap + → paste this script → Save as “Skywin Sales”.
          The API URL and key are already inside.
        </li>
        <li>
          Long-press the Home Screen → Add Widget → Scriptable → choose{" "}
          <strong>Large</strong> → pick “Skywin Sales”.
        </li>
        <li>iOS refreshes widgets about every 15 minutes, not live.</li>
      </ol>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-700">Scriptable script</p>
          <Button type="button" variant="outline" size="sm" onClick={copy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <pre className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700">
          {script}
        </pre>
      </div>
    </div>
  );
}

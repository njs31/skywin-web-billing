"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { buttonClass } from "@/components/field/kit";
import { useFieldText } from "@/components/field/lang";

export function RefreshButton() {
  const router = useRouter();
  const t = useFieldText();
  const [pending, start] = useTransition();
  return (
    <button type="button" onClick={() => start(() => router.refresh())} disabled={pending} className={buttonClass("secondary")}>
      <RefreshCw className={pending ? "animate-spin" : ""} aria-hidden />
      {pending ? t.common.refreshing : t.common.refresh}
    </button>
  );
}

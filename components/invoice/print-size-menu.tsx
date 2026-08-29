"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PRINT_SIZES,
  PRINT_SIZE_LABELS,
  buildPrintHref,
  setStoredPrintSize,
  triggerPrint,
  type PrintSize,
} from "@/lib/print-size";
import { cn } from "@/lib/utils";

type PrintSizeMenuProps = {
  /** List mode: open detail URL with ?print=1&size= */
  href?: string;
  /** Detail mode: trigger window.print with chosen size */
  mode?: "link" | "print";
  label?: string;
  size?: "sm" | "default";
  className?: string;
  buttonClassName?: string;
};

export function PrintSizeMenu({
  href,
  mode = href ? "link" : "print",
  label = "Print",
  size = "sm",
  className,
  buttonClassName,
}: PrintSizeMenuProps) {
  const [open, setOpen] = useState(false);

  const choose = (paper: PrintSize) => {
    setStoredPrintSize(paper);
    setOpen(false);
    if (mode === "link" && href) {
      window.open(buildPrintHref(href, paper), "_blank", "noopener,noreferrer");
      return;
    }
    triggerPrint(paper);
  };

  return (
    <div
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <Button
        type="button"
        size={size}
        variant="outline"
        className={buttonClassName}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Printer className="mr-1.5 h-3.5 w-3.5" />
        {label}
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[7.5rem] rounded-md border border-slate-200 bg-white p-1 shadow-lg"
        >
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Paper size
          </p>
          {PRINT_SIZES.map((paper) => (
            <button
              key={paper}
              type="button"
              role="menuitem"
              className="flex w-full items-center rounded px-2.5 py-1.5 text-left text-sm font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"
              onClick={() => choose(paper)}
              onMouseDown={(e) => e.preventDefault()}
            >
              {PRINT_SIZE_LABELS[paper]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

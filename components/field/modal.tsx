"use client";

import { useEffect, useId } from "react";
import { X } from "lucide-react";

/** Centered dialog (a bottom sheet on phones). Escape and the backdrop close it unless busy. */
export function Modal({
  title,
  description,
  onClose,
  busy = false,
  children,
  closeLabel,
  wide = false,
}: {
  wide?: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  onClose: () => void;
  busy?: boolean;
  children: React.ReactNode;
  closeLabel: string;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label={closeLabel} className="absolute inset-0 bg-[#0F1A0C]/50" onClick={() => !busy && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6 ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-[#1E3317]">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm leading-6 text-[#5E6B62]">{description}</p> : null}
          </div>
          <button
            type="button"
            aria-label={closeLabel}
            disabled={busy}
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#5E6B62] hover:bg-[#EDF2E7]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

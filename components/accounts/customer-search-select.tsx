"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { searchCustomersForPicker } from "@/lib/actions/billing";
import type { CustomerPickerOption } from "@/lib/queries/customers";
import { Input } from "@/components/ui/input";

/**
 * Typeahead that fetches at most CUSTOMER_PICKER_LIMIT rows per keystroke.
 * Do not replace this with a Radix Select over `getCustomers()` — that is
 * what froze Receipts after the Field farmer directory landed in `customers`.
 */
export function CustomerSearchSelect({
  selected,
  onSelect,
  placeholder = "Search by name, phone, or GSTIN…",
}: {
  selected?: CustomerPickerOption | null;
  onSelect: (customer: CustomerPickerOption | null) => void;
  placeholder?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CustomerPickerOption[]>([]);
  const selectedId = selected?.id ?? null;
  const prevSelectedId = useRef(selectedId);

  // Parent cleared the selection (e.g. after a successful save) while the
  // dropdown is closed — drop the leftover search text so the field is empty.
  useEffect(() => {
    if (prevSelectedId.current != null && selectedId == null && !open) {
      setQuery("");
      setResults([]);
    }
    prevSelectedId.current = selectedId;
  }, [selectedId, open]);

  useEffect(() => {
    if (!open) return;
    const handle = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const request = ++seq.current;
    const handle = window.setTimeout(() => {
      setLoading(true);
      searchCustomersForPicker(query)
        .then((rows) => {
          if (request === seq.current) setResults(rows);
        })
        .catch(() => {
          if (request === seq.current) setResults([]);
        })
        .finally(() => {
          if (request === seq.current) setLoading(false);
        });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [open, query]);

  const displayValue =
    selected && !open ? selected.name : query;

  const pick = (customer: CustomerPickerOption) => {
    onSelect(customer);
    setQuery(customer.name);
    setOpen(false);
  };

  const clear = () => {
    onSelect(null);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      <Input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className="pl-9 pr-9"
        placeholder={placeholder}
        value={displayValue}
        onChange={(e) => {
          setQuery(e.target.value);
          if (selected) onSelect(null);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          if (selected && !query) setQuery(selected.name);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            e.currentTarget.blur();
          }
        }}
      />
      {(selected || query) && (
        <button
          type="button"
          className="absolute right-2 top-2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          onClick={clear}
          title="Clear customer"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          {loading && results.length === 0 ? (
            <p className="px-2 py-2 text-xs text-slate-400">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-2 py-2 text-xs text-slate-400">
              {query.trim()
                ? "No customers match your search"
                : "Type to search customers"}
            </p>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={selected?.id === c.id}
                onClick={() => pick(c)}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-sm hover:bg-emerald-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">
                    {c.name}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {[c.phone, c.gstin].filter(Boolean).join(" · ") ||
                      "No phone / GSTIN"}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

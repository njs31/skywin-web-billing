"use client";

import { createContext, useContext, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fieldText, type FieldLang, type FieldText } from "@/lib/field-i18n";
import { cn } from "@/lib/utils";

const LangContext = createContext<FieldLang>("en");

export function FieldLangProvider({ lang, children }: { lang: FieldLang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useFieldLang(): FieldLang {
  return useContext(LangContext);
}

/** Dashboard text in the admin's language, for client components. */
export function useFieldText(): FieldText {
  return fieldText(useContext(LangContext));
}

function saveLang(next: FieldLang) {
  document.cookie = `field_lang=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** English / தமிழ் switch. Saves the choice for a year and reloads the page's data in that language. */
export function LangToggle({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  const lang = useFieldLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (next: FieldLang) => {
    if (next === lang) return;
    saveLang(next);
    start(() => router.refresh());
  };
  const base =
    tone === "dark"
      ? "bg-white/10 text-white/70 hover:text-white"
      : "bg-[#EDF2E7] text-[#3E5E2F] hover:text-[#1E3317]";
  const on = tone === "dark" ? "bg-[#C6E26A] text-[#1E3317]" : "bg-[#1E3317] text-white";
  return (
    <div
      role="group"
      aria-label={fieldText(lang).nav.language}
      className={cn("inline-flex rounded-full p-0.5", base, pending && "opacity-70", className)}
    >
      {(["en", "ta"] as const).map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={lang === code}
          onClick={() => set(code)}
          className={cn(
            "h-7 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6E26A]",
            lang === code ? on : ""
          )}
        >
          {code === "en" ? "English" : "தமிழ்"}
        </button>
      ))}
    </div>
  );
}

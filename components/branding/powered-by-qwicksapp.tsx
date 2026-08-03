import { cn } from "@/lib/utils";

type PoweredByQwicksappProps = {
  className?: string;
  /** Compact for sidebar; default for page footers */
  size?: "sm" | "md";
};

/**
 * Pure CSS recreation of the Qwicksapp "Powered By" badge.
 * Links to https://qwicksapp.com
 */
export function PoweredByQwicksapp({
  className,
  size = "sm",
}: PoweredByQwicksappProps) {
  const sm = size === "sm";

  return (
    <a
      href="https://qwicksapp.com"
      target="_blank"
      rel="noopener noreferrer"
      title="Powered by Qwicksapp"
      aria-label="Powered by Qwicksapp"
      className={cn(
        "powered-by-qwicksapp inline-flex flex-col items-stretch no-underline transition-opacity hover:opacity-90",
        sm ? "w-[148px] gap-0.5 rounded-lg px-2 py-1" : "w-[200px] gap-1 rounded-xl px-3 py-1.5",
        className
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1.5",
          sm ? "px-0.5" : "px-1"
        )}
      >
        <span className="h-px flex-1 bg-white/90" aria-hidden />
        <span
          className={cn(
            "shrink-0 font-sans font-medium tracking-wide text-white",
            sm ? "text-[8px]" : "text-[10px]"
          )}
        >
          Powered By
        </span>
        <span className="h-px flex-1 bg-white/90" aria-hidden />
      </span>

      <span
        className={cn(
          "powered-by-wordmark text-center font-black uppercase leading-none tracking-tighter",
          sm ? "text-[15px]" : "text-[20px]"
        )}
      >
        <span className="powered-by-qwicks">QWICKS</span>
        <span className="powered-by-app">APP</span>
      </span>
    </a>
  );
}

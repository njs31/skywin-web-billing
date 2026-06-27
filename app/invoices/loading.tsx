export default function InvoicesLoading() {
  return (
    <div className="animate-pulse space-y-6 p-6">
      <div className="h-8 w-32 rounded-lg bg-slate-200" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

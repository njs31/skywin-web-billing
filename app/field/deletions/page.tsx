import { fieldDeletionRequests } from "@/lib/actions/field-deletions";
import { DeletionsPanel } from "./deletions-panel";
import { PageHeader } from "@/components/field/kit";
import { getFieldLang } from "@/lib/field-lang";
import { fieldText } from "@/lib/field-i18n";

export const dynamic = "force-dynamic";

export default async function FieldDeletionsPage() {
  const [requests, lang] = await Promise.all([fieldDeletionRequests(), getFieldLang()]);
  const d = fieldText(lang).deletions;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title={d.title} description={d.subtitle} />
      <DeletionsPanel
        requests={requests.map((r) => ({
          id: r.id,
          name: r.name,
          phone: r.phone,
          village: r.village,
          customerIds: r.customerIds ?? [],
          status: r.status,
          requestedAt: r.requestedAt.toISOString(),
          decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
          decidedBy: r.decidedBy,
        }))}
      />
    </div>
  );
}

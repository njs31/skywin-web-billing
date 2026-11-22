import { fieldDeletionRequests } from "@/lib/actions/field-deletions";
import { DeletionsPanel } from "./deletions-panel";

export const dynamic = "force-dynamic";

export default async function FieldDeletionsPage() {
  const requests = await fieldDeletionRequests();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Account deletion requests</h1>
        <p className="text-sm text-[#2E4A22]/70">
          Farmers who tapped &ldquo;Delete my account&rdquo; in the Field app. Nothing is erased until you press
          Proceed: then their name, phone, address and farm details are removed. Past bills stay for GST
          under &ldquo;Deleted farmer&rdquo;.
        </p>
      </div>
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

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveFieldFarmer, saveFieldFarmer } from "@/lib/actions/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Officer = { id: number; name: string; phone: string };
type PaymentMode = "upi" | "cash" | "credit" | "card" | "cheque" | "neft";

const PAYMENT_MODES: Array<{ id: PaymentMode; label: string }> = [
  { id: "upi", label: "UPI" },
  { id: "cash", label: "Cash" },
  { id: "credit", label: "Credit" },
  { id: "card", label: "Card" },
  { id: "cheque", label: "Cheque" },
  { id: "neft", label: "Bank transfer (NEFT)" },
];
type Farmer = {
  id: number;
  name: string;
  village: string;
  address: string;
  pin: string;
  phone: string;
  altPhone: string;
  language: "en" | "ta";
  approval: "Approved" | "Pending" | "Rejected";
  rewardPoints: number;
  assignedOfficerId: number | null;
  paymentMode?: PaymentMode;
  photo?: string;
  farms: Array<{
    dbId: number;
    name: string;
    crop: string;
    acres: number;
    gps: string;
    address: string;
    pin: string;
    validated: boolean;
  }>;
};

const emptyFarm = () => ({
  name: "Main field",
  crop: "Paddy",
  acres: "2",
  gps: "",
  address: "",
  pin: "",
});

export function FarmerCreateForm({ officers }: { officers: Officer[] }) {
  return <FarmerFields officers={officers} />;
}

export function FarmerEditForm({ farmer, officers }: { farmer: Farmer; officers: Officer[] }) {
  return <FarmerFields officers={officers} farmer={farmer} />;
}

function FarmerFields({ farmer, officers }: { farmer?: Farmer; officers: Officer[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [name, setName] = useState(farmer?.name ?? "");
  const [village, setVillage] = useState(farmer?.village ?? "");
  const [address, setAddress] = useState(farmer?.address ?? "");
  const [pin, setPin] = useState(farmer?.pin ?? "");
  const [phone, setPhone] = useState(farmer?.phone ?? "");
  const [altPhone, setAltPhone] = useState(farmer?.altPhone ?? "");
  const [language, setLanguage] = useState<"en" | "ta">(farmer?.language ?? "ta");
  const [officerId, setOfficerId] = useState(farmer?.assignedOfficerId ? String(farmer.assignedOfficerId) : "");
  const [points, setPoints] = useState(String(farmer?.rewardPoints ?? 0));
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(farmer?.paymentMode ?? "upi");
  const [photo, setPhoto] = useState(farmer?.photo ?? "");
  const [farmRows, setFarmRows] = useState(
    farmer?.farms.length
      ? farmer.farms.map((farm) => ({
          id: farm.dbId,
          name: farm.name,
          crop: farm.crop,
          acres: String(farm.acres),
          gps: farm.gps,
          address: farm.address,
          pin: farm.pin,
          validated: farm.validated,
        }))
      : [emptyFarm()]
  );

  function submit() {
    setError("");
    start(async () => {
      try {
        const row = await saveFieldFarmer(
          {
            name,
            village,
            address,
            pinCode: pin,
            phone,
            altPhone,
            language,
            assignedOfficerId: officerId ? Number(officerId) : null,
            paymentMode,
            approval: farmer ? (farmer.approval.toLowerCase() as "approved" | "pending" | "rejected") : undefined,
            rewardPoints: Number(points) || 0,
            photoUrl: photo || null,
            source: farmer ? undefined : "registered",
            farms: farmRows.map((farm) => ({
              id: "id" in farm && typeof farm.id === "number" ? farm.id : undefined,
              name: farm.name,
              crop: farm.crop,
              acres: Number(farm.acres) || 0,
              gps: farm.gps,
              address: farm.address,
              pin: farm.pin,
              validated: "validated" in farm && farm.validated === true,
            })),
          },
          farmer?.id
        );
        if (row && !farmer) router.push(`/field/farmers/${row.id}`);
        else router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save farmer");
      }
    });
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[#1E3317]/10 bg-white p-5">
      <h3 className="font-semibold">{farmer ? "Edit farmer" : "Add farmer"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" value={name} onChange={setName} />
        <Field label="Village" value={village} onChange={setVillage} />
        <Field label="Address" value={address} onChange={setAddress} />
        <Field label="PIN" value={pin} onChange={setPin} />
        <Field label="Phone" value={phone} onChange={setPhone} />
        <Field label="Alternate phone" value={altPhone} onChange={setAltPhone} />
        <div>
          <Label>Language</Label>
          <select
            className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
            value={language}
            onChange={(e) => setLanguage(e.target.value as "en" | "ta")}
          >
            <option value="ta">Tamil</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <Label>Officer</Label>
          <select
            className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
            value={officerId}
            onChange={(e) => setOfficerId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {officers.map((officer) => (
              <option key={officer.id} value={officer.id}>
                {officer.name} · {officer.phone}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Payment mode</Label>
          <select
            className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
          >
            {PAYMENT_MODES.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.label}
              </option>
            ))}
          </select>
        </div>
        <Field label="Reward points" value={points} onChange={setPoints} />
        <Field label="Photo URL" value={photo} onChange={setPhoto} />
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Farms</h4>
          <Button type="button" variant="outline" size="sm" onClick={() => setFarmRows((rows) => [...rows, emptyFarm()])}>
            Add farm
          </Button>
        </div>
        {farmRows.map((farm, index) => (
          <div key={index} className="grid gap-2 rounded-xl border border-[#1E3317]/10 p-3 sm:grid-cols-3">
            <Input value={farm.name} onChange={(e) => patchFarm(index, { name: e.target.value })} placeholder="Farm name" />
            <Input value={farm.crop} onChange={(e) => patchFarm(index, { crop: e.target.value })} placeholder="Crop" />
            <Input value={farm.acres} onChange={(e) => patchFarm(index, { acres: e.target.value })} placeholder="Acres" />
            <Input value={farm.gps} onChange={(e) => patchFarm(index, { gps: e.target.value })} placeholder="GPS" />
            <Input value={farm.address} onChange={(e) => patchFarm(index, { address: e.target.value })} placeholder="Address" />
            <Input value={farm.pin} onChange={(e) => patchFarm(index, { pin: e.target.value })} placeholder="PIN" />
          </div>
        ))}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || !name.trim()} onClick={submit}>
          {pending ? "Saving…" : farmer ? "Save farmer" : "Create farmer"}
        </Button>
        {farmer ? (
          <>
            <Button variant="outline" disabled={pending} onClick={() => start(() => approveFieldFarmer(farmer.id, "approved").then(() => router.refresh()))}>
              Approve
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => start(() => approveFieldFarmer(farmer.id, "rejected").then(() => router.refresh()))}>
              Reject
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );

  function patchFarm(index: number, patch: Record<string, string>) {
    setFarmRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

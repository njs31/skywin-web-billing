"use client";

import { useState, useTransition } from "react";
import { updateCustomer } from "@/lib/actions/billing";
import type { Customer } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";

export function CustomerEditForm({ customer }: { customer: Customer }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [gstin, setGstin] = useState(customer.gstin ?? "");
  const [membershipNo, setMembershipNo] = useState(customer.membershipNo ?? "");
  const [acre, setAcre] = useState(customer.acre ?? "");
  const [crop, setCrop] = useState(customer.crop ?? "");
  const [pinCode, setPinCode] = useState(customer.pinCode ?? "");
  const [village, setVillage] = useState(customer.village ?? "");
  const [taluk, setTaluk] = useState(customer.taluk ?? "");
  const [district, setDistrict] = useState(customer.district ?? "");
  const [address, setAddress] = useState(customer.address ?? "");

  const save = () => {
    setError("");
    startTransition(async () => {
      try {
        await updateCustomer(customer.id, {
          name: customer.name,
          phone: phone.trim() || undefined,
          gstin: gstin.trim() || undefined,
          membershipNo: membershipNo.trim() || undefined,
          address: address.trim() || undefined,
          acre: acre.trim() || undefined,
          crop: crop.trim() || undefined,
          pinCode: pinCode.trim() || undefined,
          village: village.trim() || undefined,
          taluk: taluk.trim() || undefined,
          district: district.trim() || undefined,
          type: customer.type,
          creditLimit: parseFloat(customer.creditLimit ?? "0") || 0,
        });
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update customer");
      }
    });
  };

  if (!editing) {
    return (
      <div className="space-y-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <p className="text-xs text-slate-500">Membership No</p>
            <p className="font-medium">{customer.membershipNo || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Mobile Number</p>
            <p className="font-medium">{customer.phone || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">GST Number</p>
            <p className="font-medium font-mono text-xs">{customer.gstin || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Acre</p>
            <p className="font-medium">{customer.acre || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Crop</p>
            <p className="font-medium">{customer.crop || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">PIN Code</p>
            <p className="font-medium">{customer.pinCode || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Village</p>
            <p className="font-medium">{customer.village || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Taluk</p>
            <p className="font-medium">{customer.taluk || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">District</p>
            <p className="font-medium">{customer.district || "-"}</p>
          </div>
        </div>
        {customer.address && (
          <div>
            <p className="text-xs text-slate-500">Address</p>
            <p className="font-medium">{customer.address}</p>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Edit Details
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Membership Number</Label>
          <Input value={membershipNo} onChange={(e) => setMembershipNo(e.target.value)} />
        </div>
        <div>
          <Label>Mobile Number</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label>GST Number</Label>
          <Input value={gstin} onChange={(e) => setGstin(e.target.value)} />
        </div>
        <div>
          <Label>Acre</Label>
          <Input value={acre} onChange={(e) => setAcre(e.target.value)} />
        </div>
        <div>
          <Label>Crop</Label>
          <Input value={crop} onChange={(e) => setCrop(e.target.value)} />
        </div>
        <div>
          <Label>PIN Code</Label>
          <Input value={pinCode} onChange={(e) => setPinCode(e.target.value)} />
        </div>
        <div>
          <Label>Village</Label>
          <Input value={village} onChange={(e) => setVillage(e.target.value)} />
        </div>
        <div>
          <Label>Taluk</Label>
          <Input value={taluk} onChange={(e) => setTaluk(e.target.value)} />
        </div>
        <div>
          <Label>District</Label>
          <Input value={district} onChange={(e) => setDistrict(e.target.value)} />
        </div>
        <div className="sm:col-span-3">
          <Label>Address</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={save}>
          {isPending ? "Saving..." : "Save"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => {
            setEditing(false);
            setPhone(customer.phone ?? "");
            setGstin(customer.gstin ?? "");
            setMembershipNo(customer.membershipNo ?? "");
            setAcre(customer.acre ?? "");
            setCrop(customer.crop ?? "");
            setPinCode(customer.pinCode ?? "");
            setVillage(customer.village ?? "");
            setTaluk(customer.taluk ?? "");
            setDistrict(customer.district ?? "");
            setAddress(customer.address ?? "");
            setError("");
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

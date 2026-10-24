"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveFieldCategory } from "@/lib/actions/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AddCategoryForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [queries, setQueries] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      className="max-w-xl space-y-3 rounded-2xl border border-[#1E3317]/10 bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          try {
            await saveFieldCategory({ title, queries });
            setTitle("");
            setQueries("");
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save category");
          }
        });
      }}
    >
      <h3 className="font-semibold">Add category</h3>
      <div>
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Machineries" required />
      </div>
      <div>
        <Label>Search queries (comma separated)</Label>
        <Input value={queries} onChange={(e) => setQueries(e.target.value)} placeholder="weeder, harvester" />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" disabled={pending || !title.trim()}>
        {pending ? "Saving…" : "Add category"}
      </Button>
    </form>
  );
}

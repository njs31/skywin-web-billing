"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export function PrintButton({ autoPrint }: { autoPrint?: boolean }) {
  useEffect(() => {
    if (autoPrint) {
      const timer = setTimeout(() => window.print(), 500);
      return () => clearTimeout(timer);
    }
  }, [autoPrint]);

  return (
    <Button onClick={() => window.print()}>Print Invoice</Button>
  );
}

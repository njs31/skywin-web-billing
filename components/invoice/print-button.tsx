"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

type PrintButtonProps = {
  autoPrint?: boolean;
  invoiceNo?: string;
  grandTotal?: string;
  phone?: string;
};

export function PrintButton({
  autoPrint,
  invoiceNo,
  grandTotal,
  phone,
}: PrintButtonProps) {
  useEffect(() => {
    if (autoPrint) {
      const timer = setTimeout(() => window.print(), 500);
      return () => clearTimeout(timer);
    }
  }, [autoPrint]);

  const shareWhatsApp = () => {
    const text = encodeURIComponent(
      `Invoice ${invoiceNo ?? ""} from SKYWIN AGRI SUPER MARKET. Total: ₹${grandTotal ?? ""}. Thank you!`
    );
    const url = phone
      ? `https://wa.me/91${phone.replace(/\D/g, "")}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, "_blank");
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={shareWhatsApp}>
        <MessageCircle className="mr-2 h-4 w-4" />
        WhatsApp
      </Button>
      <Button onClick={() => window.print()}>Print Invoice</Button>
    </div>
  );
}

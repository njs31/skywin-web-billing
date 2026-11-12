import { NextRequest, NextResponse } from "next/server";
import { razorpayKeys } from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


/** JSON for inline <script>: escapes characters that could close the tag. */
function js(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const ALLOWED_RETURN_HOSTS = new Set(["skywin.qwicksapp.com", "skywin-field.qwicksapp.com"]);

function safeReturn(raw: string | null) {
  const fallback = "skywinfield://pay";
  if (!raw) return fallback;
  try {
    const u = new URL(raw);
    if (u.protocol === "skywinfield:") return raw;
    if (u.protocol === "https:" && ALLOWED_RETURN_HOSTS.has(u.hostname)) return raw;
  } catch {}
  return fallback;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const { keyId } = razorpayKeys();
  const orderId = (q.get("order") || "").trim();
  const amountRaw = q.get("amount") || "0";
  const amount = /^\d{1,10}$/.test(amountRaw) ? amountRaw : "0";
  const name = q.get("name") || "SkyWin Field";
  const contact = (q.get("contact") || "").replace(/\D/g, "").slice(-10);
  const ret = safeReturn(q.get("return"));
  const embed = q.get("embed") === "1";
  if (!/^order_[A-Za-z0-9]{6,40}$/.test(orderId)) {
    return new NextResponse("Missing order", { status: 400 });
  }

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>SkyWin Pay</title>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <style>
    html, body { margin: 0; min-height: 100%; background: ${embed ? "#EDF2E7" : "#FFF7F5"}; color: #1E3317; }
    body { font-family: system-ui, sans-serif; padding: ${embed ? "0" : "24px"}; }
    h1 { font-size: 22px; }
    p { color: #4a5c3d; }
    button { background: #1E3317; color: #fff; border: 0; border-radius: 14px; height: 52px; width: 100%; font-weight: 800; font-size: 16px; }
    ${embed ? "h1, p, button { display: none; }" : ""}
  </style>
</head>
<body>
  <h1>SkyWin payment</h1>
  <p>Pay ₹${esc((Number(amount) / 100).toFixed(2))} for this field order.</p>
  <button id="pay">Pay now</button>
  <script>
    function send(payload) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        return;
      }
      const u = new URL(${js(ret)});
      Object.keys(payload).forEach(function (k) { u.searchParams.set(k, payload[k]); });
      window.location = u.toString();
    }
    const options = {
      key: ${js(keyId)},
      amount: ${js(amount)},
      currency: "INR",
      name: "SkyWin Biotech",
      description: "Field order",
      order_id: ${js(orderId)},
      prefill: { name: ${js(name)}, contact: ${js(contact)} },
      theme: { color: "#1E3317" },
      handler: function (response) {
        send({
          razorpay_payment_id: response.razorpay_payment_id || "",
          razorpay_order_id: response.razorpay_order_id || "",
          razorpay_signature: response.razorpay_signature || ""
        });
      },
      modal: {
        ondismiss: function () {
          send({ cancelled: "1" });
        }
      }
    };
    const rzp = new Razorpay(options);
    document.getElementById("pay").onclick = function () { rzp.open(); };
    rzp.open();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

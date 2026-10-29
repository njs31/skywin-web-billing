type DelhiveryCfg = {
  token: string;
  base: string;
  pickupName: string;
  originPin: string;
};

export function delhiveryConfig(): DelhiveryCfg {
  return {
    token: (process.env.DELHIVERY_TOKEN || "").trim(),
    base: (process.env.DELHIVERY_BASE_URL || "https://staging-express.delhivery.com").replace(/\/$/, ""),
    pickupName: (process.env.DELHIVERY_PICKUP_NAME || "SKYWIN BIOTECH").trim(),
    originPin: (process.env.DELHIVERY_ORIGIN_PIN || "612401").trim(),
  };
}

function authHeaders(token: string) {
  return {
    Authorization: `Token ${token}`,
    Accept: "application/json",
  };
}

async function delhiveryGet(path: string) {
  const { token, base } = delhiveryConfig();
  if (!token) throw new Error("Delhivery is not configured. Add DELHIVERY_TOKEN on the server.");
  const res = await fetch(`${base}${path}`, { headers: authHeaders(token) });
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = data as { error?: string; message?: string };
    throw new Error(err.error || err.message || `Delhivery request failed (${res.status})`);
  }
  return data;
}

export async function checkDelhiveryPincode(pin: string) {
  const code = pin.replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) throw new Error("Valid 6-digit PIN is required");
  const data = (await delhiveryGet(`/c/api/pin-codes/json/?filter_codes=${code}`)) as {
    delivery_codes?: Array<{
      postal_code?: {
        pin?: string;
        pre_paid?: string;
        cash?: string;
        cod?: string;
        pickup?: string;
        district?: string;
        state_code?: string;
      };
    }>;
  };
  const row = data.delivery_codes?.[0]?.postal_code;
  const prepaid = (row?.pre_paid || "").toUpperCase() === "Y";
  return {
    pin: code,
    serviceable: prepaid,
    prepaid,
    cod: (row?.cod || "").toUpperCase() === "Y",
    pickup: (row?.pickup || "").toUpperCase() === "Y",
    district: row?.district || "",
    state: row?.state_code || "",
  };
}

export async function quoteDelhivery(destPin: string, weightGrams: number) {
  const { originPin } = delhiveryConfig();
  const pin = destPin.replace(/\D/g, "").slice(0, 6);
  const grams = Math.max(100, Math.round(weightGrams));
  const service = await checkDelhiveryPincode(pin);
  if (!service.prepaid) {
    throw new Error(`Delhivery does not deliver prepaid orders to ${pin}.`);
  }
  const qs = new URLSearchParams({
    md: "S",
    ss: "Delivered",
    d_pin: pin,
    o_pin: originPin,
    cgm: String(grams),
    pt: "Pre-paid",
  });
  const data = (await delhiveryGet(`/api/kinko/v1/invoice/charges/.json?${qs}`)) as
    | Array<{ total_amount?: number | string; charged_weight?: number }>
    | { total_amount?: number | string };

  const row = Array.isArray(data) ? data[0] : data;
  const raw = row?.total_amount;
  const amount = Number(raw);
  if (raw == null || !Number.isFinite(amount)) {
    throw new Error("Delhivery did not return a delivery charge.");
  }
  return {
    pin,
    originPin,
    weightGrams: Number(row?.charged_weight) || grams,
    amount: Math.ceil(amount),
  };
}

export async function createDelhiveryShipment(input: {
  orderId: string;
  name: string;
  phone: string;
  address: string;
  pin: string;
  amount: number;
  weightGrams: number;
  productsDesc: string;
  hsn?: string;
  quantity?: number;
}) {
  const { token, base, pickupName, originPin } = delhiveryConfig();
  if (!token) throw new Error("Delhivery is not configured. Add DELHIVERY_TOKEN on the server.");

  const phone = input.phone.replace(/\D/g, "").slice(-10);
  const pin = input.pin.replace(/\D/g, "").slice(0, 6);
  const sellerAddress = "No.171/E2-A, Komalavallipettai, Karaikal Road, Kumbakonam";
  const orderId = input.orderId.trim().slice(0, 40);
  const payload = {
    shipments: [
      {
        name: (input.name.trim() || "Farmer").slice(0, 80),
        add: (input.address.trim() || "Farm").slice(0, 200),
        pin,
        city: "",
        state: "Tamil Nadu",
        country: "India",
        phone,
        order: orderId,
        payment_mode: "Prepaid",
        return_pin: originPin,
        return_city: "Kumbakonam",
        return_phone: "9942499930",
        return_add: sellerAddress,
        return_state: "Tamil Nadu",
        return_country: "India",
        products_desc: input.productsDesc.slice(0, 200) || "Agri inputs",
        hsn_code: (input.hsn || "3808").slice(0, 20),
        cod_amount: "0",
        total_amount: String(Math.max(1, Math.round(input.amount))),
        seller_add: sellerAddress,
        seller_name: "SkyWin Biotech",
        seller_inv: orderId,
        seller_gst_tin: "33AJBPM9217B2ZM",
        quantity: String(Math.max(1, input.quantity || 1)),
        weight: String(Math.max(100, Math.round(input.weightGrams))),
        shipment_width: "15",
        shipment_height: "10",
        shipment_length: "20",
        shipping_mode: "Surface",
        address_type: "home",
      },
    ],
    pickup_location: { name: pickupName },
  };

  const body = new URLSearchParams({
    format: "json",
    data: JSON.stringify(payload),
  });

  const res = await fetch(`${base}/api/cmu/create.json`, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    packages?: Array<{ waybill?: string; status?: string; remarks?: string[] }>;
    error?: string;
    rmq_uuid?: string;
  };
  const pack = data.packages?.[0];
  if (!res.ok || data.success === false || !pack?.waybill) {
    throw new Error(
      data.error || pack?.remarks?.join(", ") || "Delhivery could not book this shipment"
    );
  }
  return {
    waybill: pack.waybill,
    status: pack.status || "Booked",
    courier: "Delhivery" as const,
  };
}

export async function trackDelhivery(waybill: string) {
  const awb = waybill.trim();
  if (!awb) throw new Error("Waybill is required");
  const data = (await delhiveryGet(`/api/v1/packages/json/?waybill=${encodeURIComponent(awb)}`)) as {
    ShipmentData?: Array<{
      Shipment?: {
        Status?: { Status?: string; StatusDateTime?: string; Instructions?: string };
        AWB?: string;
        Origin?: string;
        Destination?: string;
      };
    }>;
  };
  const ship = data.ShipmentData?.[0]?.Shipment;
  return {
    waybill: ship?.AWB || awb,
    status: ship?.Status?.Status || "Unknown",
    at: ship?.Status?.StatusDateTime || "",
    instructions: ship?.Status?.Instructions || "",
    origin: ship?.Origin || "",
    destination: ship?.Destination || "",
  };
}

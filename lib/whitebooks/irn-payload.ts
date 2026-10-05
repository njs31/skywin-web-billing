/**
 * Sale → NIC e-invoice v1.03 JSON (the `GENERATE` request body WhiteBooks
 * passes straight to the IRP).
 *
 * Money rules follow this app's own billing: item rates are GST-exclusive,
 * tax is charged on top, and a bill-level discount scales every line
 * proportionally (the same proration `calculateGstBreakdown` applies).
 * Totals are reconciled against the sale's own grand total with the
 * remainder carried as RndOffAmt — the IRP rejects a document whose
 * ValDtls don't foot, so a large remainder throws instead of pushing a
 * wrong invoice.
 *
 * FIELD MAP (Skywin → IRP/NIC v1.03 → rule). Checked against the notified
 * e-invoice schema + IRIS IRP validation catalogue:
 * - Version "1.1"            — mandatory, current schema version (kept).
 * - TranDtls.SupTyp "B2B"    — only B2B is gated in (loadActiveB2bSale).
 * - TranDtls.RegRev "N"      — reverse charge not modeled (limitation).
 * - TranDtls.IgstOnIntra "N" — intra-state IGST not used (limitation).
 * - DocDtls.Typ "INV"|"CRN"  — invoices and credit notes (wholesale/others).
 * - DocDtls.No               — invoice_no verbatim, official 16-char pattern.
 * - DocDtls.Dt               — DD/MM/YYYY from sales.date.
 * - SellerDtls.*             — settings/businessLocality/businessPin (all mandatory).
 * - BuyerDtls.Gstin/LglNm/Addr1/Loc/Pin/Stcd — customer record, all mandatory; Pos=Stcd=buyer state.
 * - BuyerDtls.Ph/Em, TrdNm   — optional (Em never sent; Ph digits-only-or-null).
 * - Item.SlNo/IsServc "N"    — services not distinguished (limitation: a service line is sent as goods).
 * - Item.HsnCd               — 6/8-digit numeric (AATO >5cr rule).
 * - Item.Qty/UnitPrice        — up to 3dp, never exponent.
 * - Item.Unit                — NIC UQC map (customs list).
 * - Item.TotAmt = Qty×UnitPrice; AssAmt = TotAmt−Discount; TotItemVal = AssAmt+taxes (±1 per IRP 2192/2193/2194).
 * - ValDtls.*                — sums of lines; Discount 0 (all discounts netted — IRP 2189 formula); OthChrg 0 (not modeled); Ces* 0 (cess not modeled); RndOffAmt = remainder; TotInvVal = grand_total.
 * - EwbDtls                  — only with vehicle+distance (same-call EWB).
 * Never sent (all optional/conditional and not applicable): BchDtls,
 * DispDtls/ShipDtls, PayDtls, RefDtls, AddlDocDtls, ExpDtls, AttribDtls.
 */
import { isValidGstin } from "@/lib/gst";
import { isIrpCompatibleDocNo } from "@/lib/financial-year";

export type IrnSaleItem = {
  name: string;
  hsnCode: string | null;
  qty: number | string;
  rate: number | string;
  discountType?: string | null;
  discountValue?: number | string | null;
  gstRate: number | string;
  unit: string | null;
  /** Line taxable after the line discount (the billed amount). */
  amount: number | string;
};

export type IrnBuyer = {
  name: string | null;
  gstin: string | null;
  address: string | null;
  pinCode: string | null;
  phone: string | null;
  village: string | null;
  taluk: string | null;
  district: string | null;
};

export type IrnSale = {
  invoiceNo: string;
  date: Date;
  grandTotal: number | string;
  billDiscount: number | string;
  buyer: IrnBuyer;
  items: IrnSaleItem[];
};

export type IrnSeller = {
  gstin: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  stateCode: string;
  locality: string;
  pin: string;
};

export type IrnDocType = "INV" | "CRN";

export type IrnPrecedingDoc = {
  invoiceNo: string;
  date: Date;
  irn?: string | null;
};

export type IrnPayloadOptions = {
  docType?: IrnDocType;
  preceding?: IrnPrecedingDoc | null;
};

export type IrnDispatch = {
  vehicleNo?: string | null;
  transporterName?: string | null;
  transporterGstin?: string | null;
  distanceKm?: number | string | null;
} | null;

function num(value: number | string | null | undefined): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/** NIC decimal: max 3 fraction digits, plain number (never exponent). */
export function nicAmount(n: number): number {
  return Math.round(n * 1000) / 1000;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** NIC UQC codes for every unit this shop bills in (see lib/units.ts).
 *  Keys are normalised (lowercased, non-letters stripped), so data-entry
 *  variants like "500 GM" or "Mtr." still resolve instead of blocking a
 *  push over a spelling. */
const UNIT_TO_UQC: Record<string, string> = {
  pcs: "PCS",
  pc: "PCS",
  nos: "NOS",
  no: "NOS",
  gram: "GMS",
  gm: "GMS",
  gms: "GMS",
  g: "GMS",
  kg: "KGS",
  kgs: "KGS",
  metre: "MTR",
  meter: "MTR",
  mtr: "MTR",
  m: "MTR",
  ml: "MLT",
  litre: "LTR",
  liter: "LTR",
  ltr: "LTR",
  l: "LTR",
  packet: "PAC",
  pkt: "PAC",
  bag: "BAG",
};

export function uqcForUnit(unit: string | null | undefined): string {
  const key = (unit ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  const uqc = UNIT_TO_UQC[key];
  if (!uqc) {
    throw new Error(
      `Cannot e-invoice: unit "${unit ?? ""}" has no NIC quantity code. ` +
        "Fix the product's unit first."
    );
  }
  return uqc;
}

/**
 * HSN/SAC validation for this business (AATO ₹5–10cr).
 *
 * CURRENT OFFICIAL RULE (Notification 78/2020-Central Tax; enforced on the
 * IRP since 01.10.2023): AATO above ₹5cr must report HSN of at least
 * 6 digits; others at least 4. The IRP additionally rejects codes outside
 * the GSTN HSN master. This checks shape (6-or-8-digit numeric, the only
 * lengths the customs-derived master uses); full master-list membership
 * is a documented follow-up, not guessed here.
 *
 * Throws an actionable message naming the item — the push never reaches
 * WhiteBooks with a bad HSN.
 */
export function validateHsn(hsn: string | null | undefined, itemName: string): string {
  const code = (hsn ?? "").trim().replace(/\s/g, "");
  if (!code) {
    throw new Error(`Cannot e-invoice: "${itemName}" has no HSN code.`);
  }
  if (!/^[0-9]{6}([0-9]{2})?$/.test(code)) {
    throw new Error(
      `Cannot e-invoice: "${itemName}" has HSN "${code}" — ` +
        "this business must report 6- or 8-digit numeric HSN codes. " +
        "Fix the product master."
    );
  }
  return code;
}

export function stateCodeOfGstin(gstin: string): string {
  return gstin.trim().toUpperCase().slice(0, 2);
}

export function formatNicDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function required(value: string | null | undefined, what: string): string {
  const v = (value ?? "").trim();
  if (!v) throw new Error(`Cannot e-invoice: ${what} is missing.`);
  return v;
}

export function isCreditNoteEinvoiceEligible(args: {
  billType?: string | null;
  customerGstin?: string | null;
}): boolean {
  const type = args.billType ?? "";
  return (type === "wholesale" || type === "others") && isValidGstin(args.customerGstin);
}

export function buildIrnPayload(
  sale: IrnSale,
  seller: IrnSeller,
  dispatch: IrnDispatch = null,
  options: IrnPayloadOptions = {}
): Record<string, unknown> {
  const buyerGstin = required(sale.buyer.gstin, "buyer GSTIN").toUpperCase();
  if (!isValidGstin(buyerGstin)) {
    throw new Error(
      "Cannot e-invoice: buyer GSTIN is not a valid 15-character GSTIN."
    );
  }
  if (sale.items.length === 0) {
    throw new Error("Cannot e-invoice: the bill has no items.");
  }

  // NIC DocDtls.No: String(16), official pattern shared with numbering.
  // Existing 17-char retail numbers fail here with an explicit message —
  // never silently substituted (see PART 2 of the staging plan).
  const docNo = sale.invoiceNo.trim();
  if (!isIrpCompatibleDocNo(docNo)) {
    throw new Error(
      `Cannot e-invoice: invoice number "${docNo}" is not IRP-compatible ` +
        "(max 16 chars, letters/digits/-// only, must not start with 0, / or -)."
    );
  }

  const buyerState = stateCodeOfGstin(buyerGstin);
  const interstate = buyerState !== seller.stateCode.padStart(2, "0");

  const buyerPin = required(sale.buyer.pinCode, "buyer pincode").replace(/\s/g, "");
  if (!/^[1-9][0-9]{5}$/.test(buyerPin)) {
    throw new Error(
      "Cannot e-invoice: buyer pincode must be 6 digits — fix the customer record."
    );
  }
  const buyerLoc =
    sale.buyer.district?.trim() ||
    sale.buyer.taluk?.trim() ||
    sale.buyer.village?.trim() ||
    "";
  if (!buyerLoc) {
    throw new Error(
      "Cannot e-invoice: buyer locality is missing (village/taluk/district) — fix the customer record."
    );
  }

  const subtotal = sale.items.reduce((sum, it) => sum + num(it.amount), 0);
  if (subtotal <= 0) {
    throw new Error("Cannot e-invoice: bill total is zero.");
  }
  const billDiscount = Math.max(0, num(sale.billDiscount));
  const scale = (subtotal - billDiscount) / subtotal;
  if (!(scale >= 0)) {
    throw new Error("Cannot e-invoice: bill discount exceeds the subtotal.");
  }

  const itemList = sale.items.map((it, i) => {
    const qty = num(it.qty);
    const unitPrice = num(it.rate);
    if (!(qty > 0)) throw new Error(`Cannot e-invoice: bad quantity on "${it.name}".`);
    const totAmt = round2(qty * unitPrice);
    const assAmt = round2(num(it.amount) * scale);
    const lineDiscount = round2(totAmt - num(it.amount));
    const gstRt = num(it.gstRate);
    if (!(gstRt >= 0)) {
      throw new Error(`Cannot e-invoice: bad GST rate on "${it.name}".`);
    }
    const tax = round2((assAmt * gstRt) / 100);
    // The IRP rejects a line whose halves differ by even a paisa (error
    // 2227), which a round-half-up split produces on odd-paisa tax. Both
    // halves carry the same rounded value instead; any stray paisa against
    // the bill's own total is absorbed by RndOffAmt at the document level.
    const half = round2(tax / 2);
    const cgstAmt = interstate ? 0 : half;
    const sgstAmt = interstate ? 0 : half;
    const igstAmt = interstate ? tax : 0;
    const hsn = validateHsn(it.hsnCode, it.name);
    return {
      SlNo: String(i + 1),
      IsServc: "N",
      PrdDesc: it.name.trim().slice(0, 100),
      HsnCd: hsn,
      Qty: nicAmount(qty),
      FreeQty: 0,
      Unit: uqcForUnit(it.unit),
      UnitPrice: nicAmount(unitPrice),
      TotAmt: totAmt,
      Discount: Math.max(0, lineDiscount),
      AssAmt: assAmt,
      GstRt: gstRt,
      SgstAmt: sgstAmt,
      IgstAmt: igstAmt,
      CgstAmt: cgstAmt,
      CesRt: 0,
      CesAmt: 0,
      CesNonAdvlAmt: 0,
      StateCesRt: 0,
      StateCesAmt: 0,
      StateCesNonAdvlAmt: 0,
      OthChrg: 0,
      TotItemVal: round2(assAmt + cgstAmt + sgstAmt + igstAmt),
    };
  });

  const sum = (pick: (it: (typeof itemList)[number]) => number) =>
    round2(itemList.reduce((s, it) => s + pick(it), 0));
  const assVal = sum((it) => it.AssAmt);
  const cgstVal = sum((it) => it.CgstAmt);
  const sgstVal = sum((it) => it.SgstAmt);
  const igstVal = sum((it) => it.IgstAmt);
  // ValDtls.Discount stays 0: every discount (line and bill-level) is
  // already netted into the lines above, and the IRP derives its own
  // total as (sum of TotItemVal) + OthChrg − Discount (error 2189) — any
  // value here would be subtracted a second time.
  const discountTotal = 0;
  const grandTotal = round2(num(sale.grandTotal));
  const preRound = round2(assVal + cgstVal + sgstVal + igstVal);
  const rndOff = round2(grandTotal - preRound);
  if (Math.abs(rndOff) > 5) {
    throw new Error(
      `Cannot e-invoice: bill total (${grandTotal}) does not foot with ` +
        `its lines (${preRound}) — check the bill's discounts/rounding.`
    );
  }

  const sellerPin = seller.pin.replace(/\s/g, "");
  if (!/^[1-9][0-9]{5}$/.test(sellerPin)) {
    throw new Error("Cannot e-invoice: seller pincode is misconfigured.");
  }

  const payload: Record<string, unknown> = {
    Version: "1.1",
    TranDtls: {
      TaxSch: "GST",
      SupTyp: "B2B",
      RegRev: "N",
      EcmGstin: null,
      IgstOnIntra: "N",
    },
    DocDtls: {
      Typ: options.docType ?? "INV",
      No: docNo,
      Dt: formatNicDate(sale.date),
    },
    SellerDtls: {
      Gstin: seller.gstin.toUpperCase(),
      LglNm: seller.name.slice(0, 100),
      TrdNm: seller.name.slice(0, 100),
      Addr1: seller.address.trim().slice(0, 100),
      Addr2: null,
      Loc: seller.locality,
      Pin: Number(sellerPin),
      Stcd: seller.stateCode.padStart(2, "0"),
      Ph: seller.phone.replace(/\D/g, "").slice(0, 10) || null,
      Em: seller.email || null,
    },
    BuyerDtls: {
      Gstin: buyerGstin,
      LglNm: required(sale.buyer.name, "buyer name").slice(0, 100),
      TrdNm: (sale.buyer.name ?? "").trim().slice(0, 100) || null,
      Pos: buyerState,
      Addr1: required(sale.buyer.address, "buyer address").slice(0, 100),
      Addr2: null,
      Loc: buyerLoc,
      Pin: Number(buyerPin),
      Stcd: buyerState,
      Ph: (sale.buyer.phone ?? "").replace(/\D/g, "").slice(0, 10) || null,
      Em: null,
    },
    ItemList: itemList,
    ValDtls: {
      AssVal: assVal,
      CgstVal: cgstVal,
      SgstVal: sgstVal,
      IgstVal: igstVal,
      CesVal: 0,
      StCesVal: 0,
      Discount: discountTotal,
      OthChrg: 0,
      RndOffAmt: rndOff,
      TotInvVal: grandTotal,
    },
  };

  if (options.preceding?.invoiceNo?.trim()) {
    payload.RefDtls = {
      PrecDocDtls: [
        {
          InvNo: options.preceding.invoiceNo.trim().slice(0, 16),
          InvDt: formatNicDate(options.preceding.date),
          ...(options.preceding.irn
            ? { OthRefNo: options.preceding.irn }
            : {}),
        },
      ],
    };
  }

  // Same-call e-way bill: only when there's actually something to move on.
  const distance = num(dispatch?.distanceKm);
  const vehNo = (dispatch?.vehicleNo ?? "").trim();
  if (dispatch && distance > 0 && vehNo) {
    const transGstin = (dispatch.transporterGstin ?? "").trim().toUpperCase();
    payload.EwbDtls = {
      Transid: isValidGstin(transGstin) ? transGstin : null,
      Transname: (dispatch.transporterName ?? "").trim().slice(0, 100) || null,
      Distance: Math.round(distance),
      Transdocno: docNo.slice(0, 15),
      TransdocDt: formatNicDate(sale.date),
      Vehno: vehNo.toUpperCase(),
      Vehtype: "R",
      TransMode: "1",
    };
  }

  return payload;
}

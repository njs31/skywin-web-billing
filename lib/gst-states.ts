/**
 * GST state-code helpers. The first two digits of a GSTIN are the state code.
 * Shared by the e-way export and the Tally/GST export.
 */
export const GST_STATE_NAMES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

/** State code (2 digits) from a GSTIN, or "" when it can't be read. */
export function stateCodeFromGstin(gstin: string | null | undefined): string {
  const code = (gstin ?? "").trim().slice(0, 2);
  return /^\d{2}$/.test(code) ? code : "";
}

/**
 * State name for a GSTIN. Falls back to `fallbackState` when the GSTIN is
 * missing/unknown.
 */
export function stateNameFromGstin(
  gstin: string | null | undefined,
  fallbackState = ""
): string {
  const code = stateCodeFromGstin(gstin);
  return (code && GST_STATE_NAMES[code]) || fallbackState;
}

/** e.g. "Tamil Nadu (33)" — used as Place of Supply on the e-way export. */
export function placeOfSupplyFromGstin(
  gstin: string | null | undefined,
  fallbackState: string,
  fallbackCode: string
): string {
  const code = stateCodeFromGstin(gstin) || fallbackCode;
  const name = GST_STATE_NAMES[code] || fallbackState;
  return `${name} (${code})`;
}

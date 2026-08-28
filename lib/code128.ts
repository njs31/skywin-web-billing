/**
 * CODE128-B encoder for retail product labels.
 * Patterns match ISO/IEC 15417 (same table used by JsBarcode).
 */
const PATTERNS = [
  "11011001100",
  "11001101100",
  "11001100110",
  "10010011000",
  "10010001100",
  "10001001100",
  "10011001000",
  "10011000100",
  "10001100100",
  "11001001000",
  "11001000100",
  "11000100100",
  "10110011100",
  "10011011100",
  "10011001110",
  "10111001100",
  "10011101100",
  "10011100110",
  "11001110010",
  "11001011100",
  "11001001110",
  "11011100100",
  "11001110100",
  "11101101110",
  "11101001100",
  "11100101100",
  "11100100110",
  "11101100100",
  "11100110100",
  "11100110010",
  "11011011000",
  "11011000110",
  "11000110110",
  "10100011000",
  "10001011000",
  "10001000110",
  "10110001000",
  "10001101000",
  "10001100010",
  "11010001000",
  "11000101000",
  "11000100010",
  "10110111000",
  "10110001110",
  "10001101110",
  "10111011000",
  "10111000110",
  "10001110110",
  "11101110110",
  "11010001110",
  "11000101110",
  "11011101000",
  "11011100010",
  "11011101110",
  "11101011000",
  "11101000110",
  "11100010110",
  "11101101000",
  "11101100010",
  "11100011010",
  "11101111010",
  "11001000010",
  "11110001010",
  "10100110000",
  "10100001100",
  "10010110000",
  "10010000110",
  "10000101100",
  "10000100110",
  "10110010000",
  "10110000100",
  "10011010000",
  "10011000010",
  "10000110100",
  "10000110010",
  "11000010010",
  "11001010000",
  "11110111010",
  "11000010100",
  "10001111010",
  "10100111100",
  "10010111100",
  "10010011110",
  "10111100100",
  "10011110100",
  "10011110010",
  "11110100100",
  "11110010100",
  "11110010010",
  "11011011110",
  "11011110110",
  "11110110110",
  "10101111000",
  "10100011110",
  "10001011110",
  "10111101000",
  "10111100010",
  "11110101000",
  "11110100010",
  "10111011110",
  "10111101110",
  "11101011110",
  "11110101110",
  "11010000100",
  "11010010000",
  "11010011100",
  "1100011101011",
];

const CODE_C = 99;
const CODE_B = 100;
const START_B = 104;
const START_C = 105;
const STOP = 106;

/**
 * Quiet zone in modules on each side. ISO/IEC 15417 asks for at least 10×
 * the module width; scanners reject barcodes printed hard against artwork.
 */
const QUIET_MODULES = 10;

export type Code128Bar = { x: number; width: number };

export function sanitizeCode128Text(value: string) {
  const cleaned = value
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "0";
}

function digitRunLength(data: string, from: number) {
  let run = 0;
  while (from + run < data.length) {
    const char = data.charCodeAt(from + run);
    if (char < 48 || char > 57) break;
    run += 1;
  }
  return run;
}

/**
 * Encode to code values, switching into subset C for digit runs.
 *
 * Subset C packs two digits per symbol, so a numeric barcode needs roughly
 * half the modules. On a 50 mm label that is the difference between a 1-dot
 * and a 2-dot module, which is the difference between a barcode that scans
 * and one that does not.
 */
export function encodeCode128Values(data: string): number[] {
  const values: number[] = [];
  const lead = digitRunLength(data, 0);
  const allDigits = lead === data.length;

  let mode: "B" | "C";
  if (lead >= 4 || (allDigits && lead >= 2 && lead % 2 === 0)) {
    mode = "C";
    values.push(START_C);
  } else {
    mode = "B";
    values.push(START_B);
  }

  let i = 0;
  while (i < data.length) {
    const run = digitRunLength(data, i);
    if (mode === "C") {
      if (run >= 2) {
        values.push(Number(data.slice(i, i + 2)));
        i += 2;
      } else {
        values.push(CODE_B);
        mode = "B";
      }
      continue;
    }

    const endsData = i + run === data.length;
    if (run >= 6 || (endsData && run >= 4)) {
      // An odd run has to shed one digit in subset B before the pairs line up.
      if (run % 2 === 1) {
        values.push(data.charCodeAt(i) - 32);
        i += 1;
      }
      values.push(CODE_C);
      mode = "C";
      continue;
    }

    values.push(data.charCodeAt(i) - 32);
    i += 1;
  }

  let checksum = values[0]!;
  for (let position = 1; position < values.length; position++) {
    checksum += values[position]! * position;
  }
  values.push(checksum % 103);
  values.push(STOP);

  return values;
}

/** Binary modules including ISO quiet zones (10 modules each side). */
export function encodeCode128(text: string) {
  const values = encodeCode128Values(sanitizeCode128Text(text));
  const quiet = "0".repeat(QUIET_MODULES);
  return quiet + values.map((value) => PATTERNS[value]!).join("") + quiet;
}

/**
 * Lay the symbol out on a whole number of printer dots.
 *
 * Thermal heads can only burn whole dots. A fractional module width gets
 * rounded differently from bar to bar, so nominally equal bars come out one
 * dot apart and the scanner cannot recover the widths. Snapping the module to
 * an integer and centring the leftover space keeps every bar exact.
 */
export function layoutCode128Dots(text: string, availableDots: number) {
  const encoded = encodeCode128(text);
  const moduleDots = Math.max(1, Math.floor(availableDots / encoded.length));
  const totalDots = moduleDots * encoded.length;
  const originDots = Math.max(0, Math.round((availableDots - totalDots) / 2));

  const bars: Code128Bar[] = [];
  let i = 0;
  while (i < encoded.length) {
    if (encoded[i] !== "1") {
      i += 1;
      continue;
    }
    let run = 0;
    while (i + run < encoded.length && encoded[i + run] === "1") run += 1;
    bars.push({
      x: originDots + i * moduleDots,
      width: run * moduleDots,
    });
    i += run;
  }

  return { bars, moduleDots, totalDots, originDots, encoded };
}

/** Fractional-width layout kept for renderers that scale to a non-dot grid (PDF). */
export function layoutCode128Bars(
  text: string,
  x: number,
  width: number
): { bars: Code128Bar[]; moduleWidth: number; encoded: string } {
  const encoded = encodeCode128(text);
  const moduleWidth = width / encoded.length;

  const bars: Code128Bar[] = [];
  let i = 0;
  while (i < encoded.length) {
    if (encoded[i] !== "1") {
      i += 1;
      continue;
    }
    let run = 0;
    while (i + run < encoded.length && encoded[i + run] === "1") run += 1;
    bars.push({ x: x + i * moduleWidth, width: run * moduleWidth });
    i += run;
  }

  return { bars, moduleWidth, encoded };
}

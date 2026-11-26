import sharp from "sharp";

/**
 * Razorpay's QR Codes API returns the QR as a tall branded poster (about 674×1644, 400 KB:
 * "Powered by Razorpay", BHIM/UPI marks, the black QR square, app logos, business name).
 * The officer's screen shows only the code, so this cuts out the black square, adds a white
 * margin and saves it as a small PNG (a few KB) that reaches the phone quickly.
 *
 * The square is the tallest run of rows holding near-black pixels (the blue band behind the
 * card is not near-black). If no clean square is found, the whole poster is sent, smaller.
 */
export async function qrSquareFromRazorpayImage(input: Buffer) {
  const { data, info } = await sharp(input)
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const box = blackSquare(data, info.width, info.height, info.channels);
  if (!box) {
    const poster = await sharp(input).flatten({ background: "#ffffff" }).resize({ width: 420 }).png({ palette: true }).toBuffer();
    return { png: poster, cropped: false };
  }
  // Quiet zone: about 10% on each side, as UPI apps expect a white border around the code.
  const pad = Math.round(box.size * 0.1);
  const png = await sharp(input)
    .flatten({ background: "#ffffff" })
    .extract({ left: box.left, top: box.top, width: box.size, height: box.size })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: "#ffffff" })
    .png({ palette: true, colours: 16 })
    .toBuffer();
  return { png, cropped: true };
}

/** Bounding square of the QR's black modules, or null when the picture isn't the expected layout. */
export function blackSquare(data: Uint8Array | Buffer, width: number, height: number, channels: number) {
  const black = (i: number) => data[i] < 70 && data[i + 1] < 70 && data[i + 2] < 70;
  const rows: { left: number; right: number }[] = [];
  for (let y = 0; y < height; y++) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < width; x++) {
      if (black((y * width + x) * channels)) {
        if (left < 0) left = x;
        right = x;
      }
    }
    rows.push({ left, right });
  }
  // Runs of rows with black pixels; gaps of a few rows (a white module row) don't break a run.
  let best: { top: number; bottom: number } | null = null;
  let start = -1;
  let lastInk = -1;
  const gap = Math.max(4, Math.round(height * 0.012));
  for (let y = 0; y <= height; y++) {
    const ink = y < height && rows[y].left >= 0;
    if (ink) {
      if (start < 0) start = y;
      lastInk = y;
    } else if (start >= 0 && (y === height || y - lastInk > gap)) {
      if (!best || lastInk - start > best.bottom - best.top) best = { top: start, bottom: lastInk };
      start = -1;
    }
  }
  if (!best) return null;
  let left = width;
  let right = -1;
  for (let y = best.top; y <= best.bottom; y++) {
    if (rows[y].left < 0) continue;
    left = Math.min(left, rows[y].left);
    right = Math.max(right, rows[y].right);
  }
  const w = right - left + 1;
  const h = best.bottom - best.top + 1;
  // A QR is square and big enough to scan; anything else means Razorpay changed the layout.
  if (w < 120 || h < 120 || Math.abs(w - h) > Math.max(w, h) * 0.06) return null;
  const size = Math.max(w, h);
  return {
    left: Math.max(0, Math.min(left, width - size)),
    top: Math.max(0, Math.min(best.top, height - size)),
    size,
  };
}

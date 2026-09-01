import test from "node:test";
import assert from "node:assert/strict";
import {
  BAND_ROWS,
  buildEscPosJob,
  buildEscPosLabel,
  buildRasterBand,
  DEFAULT_FEED_DOTS,
} from "./escpos-print";
import {
  DOTS_PER_MM,
  LABEL_PITCH_MM,
  PRINT_BAND_H_DOTS,
  PRINT_W_DOTS,
} from "./label-print-config";

const BYTES_PER_ROW = PRINT_W_DOTS / 8; // 48

function raster(height = PRINT_BAND_H_DOTS) {
  return {
    width: PRINT_W_DOTS,
    height,
    bytesPerRow: BYTES_PER_ROW,
    bytes: new Uint8Array(BYTES_PER_ROW * height).fill(0xa5),
  };
}

/** Offsets of every `GS v 0` header in a job, with its declared dimensions. */
function bands(job: Uint8Array) {
  const found: { at: number; bytesPerRow: number; rows: number }[] = [];
  let i = 0;
  while (i < job.length) {
    if (job[i] === 0x1d && job[i + 1] === 0x76 && job[i + 2] === 0x30) {
      const bytesPerRow = job[i + 4]! | (job[i + 5]! << 8);
      const rows = job[i + 6]! | (job[i + 7]! << 8);
      found.push({ at: i, bytesPerRow, rows });
      i += 8 + bytesPerRow * rows;
    } else {
      i++;
    }
  }
  return found;
}

test("buildRasterBand", async (t) => {
  await t.test("emits a GS v 0 header then the rows", () => {
    const data = new Uint8Array(BYTES_PER_ROW * 2).fill(0x0f);
    const out = buildRasterBand(BYTES_PER_ROW, 2, data);
    assert.deepEqual(
      [...out.subarray(0, 8)],
      [0x1d, 0x76, 0x30, 0x00, BYTES_PER_ROW, 0x00, 2, 0x00]
    );
    assert.equal(out.length, 8 + data.length);
  });

  await t.test("rejects data that contradicts its dimensions", () => {
    assert.throws(() => buildRasterBand(BYTES_PER_ROW, 2, new Uint8Array(3)));
  });
});

test("buildEscPosLabel", async (t) => {
  const job = buildEscPosLabel(raster());

  await t.test("matches the byte count the vendor driver produces", () => {
    // 64 lead-in + 6 full bands + 2-byte gap seek, for the 384 × 144 dot
    // printable band.
    assert.equal(job.length, 64 + 6 * (8 + BAND_ROWS * BYTES_PER_ROW) + 2);
    assert.equal(job.length, 7026);
  });

  await t.test("leads with the zero-byte wake-up", () => {
    assert.deepEqual([...job.subarray(0, 64)], new Array(64).fill(0));
    assert.equal(job[64], 0x1d);
  });

  await t.test("splits the label into bands the printer will accept", () => {
    const found = bands(job);
    assert.equal(found.length, Math.ceil(PRINT_BAND_H_DOTS / BAND_ROWS));
    assert.ok(
      found.every((b) => b.bytesPerRow === BYTES_PER_ROW),
      "every band is the full label width"
    );
    assert.ok(
      found.slice(0, -1).every((b) => b.rows === BAND_ROWS),
      "every band but the last is a full band"
    );
    assert.equal(
      found.reduce((sum, b) => sum + b.rows, 0),
      PRINT_BAND_H_DOTS,
      "the bands cover the label exactly once"
    );
  });

  await t.test("ends by seeking the die cut with GS FF", () => {
    // The printer's own gap sensor, not a counted feed: this is what stops a
    // run drifting out of registration one label at a time.
    assert.deepEqual([...job.subarray(-2)], [0x1d, 0x0c]);
  });

  await t.test("falls back to a counted feed when asked", () => {
    const blind = buildEscPosLabel(raster(), { endOfLabel: "feed" });
    assert.deepEqual([...blind.subarray(-3)], [0x1b, 0x4a, DEFAULT_FEED_DOTS]);
  });

  await t.test("counts exactly one sticker pitch when it has to count", () => {
    // Without the sensor the printer advances only what it is told. If image
    // + feed overshoots the pitch, every label drifts further down the roll
    // than the last; the vendor driver's 80-dot tear-off feed did this.
    const pitch = LABEL_PITCH_MM * DOTS_PER_MM;
    assert.equal(PRINT_BAND_H_DOTS + DEFAULT_FEED_DOTS, pitch);
  });

  await t.test("an explicit gap means the sensor cannot be used", () => {
    const custom = buildEscPosLabel(raster(), { feedDots: 24 });
    assert.deepEqual([...custom.subarray(-3)], [0x1b, 0x4a, 24]);
  });

  await t.test("sends the raster uninverted — 1 burns a dot", () => {
    // TSPL needed the negative; ESC/POS does not. A 0xa5 row must survive.
    assert.equal(job[64 + 8], 0xa5);
  });

  await t.test("handles a height that is not a multiple of the band", () => {
    const found = bands(buildEscPosLabel(raster(BAND_ROWS + 1)));
    assert.deepEqual(
      found.map((b) => b.rows),
      [BAND_ROWS, 1]
    );
  });
});

test("buildEscPosJob", async (t) => {
  await t.test("repeats each label for the copy count", () => {
    const one = buildEscPosLabel(raster());
    assert.equal(buildEscPosJob([raster()], { copies: 3 }).length, one.length * 3);
  });

  await t.test("defaults to a single copy and clamps nonsense", () => {
    const one = buildEscPosLabel(raster());
    assert.equal(buildEscPosJob([raster()]).length, one.length);
    assert.equal(buildEscPosJob([raster()], { copies: 0 }).length, one.length);
  });

  await t.test("concatenates multiple products", () => {
    const one = buildEscPosLabel(raster());
    assert.equal(buildEscPosJob([raster(), raster()]).length, one.length * 2);
  });
});

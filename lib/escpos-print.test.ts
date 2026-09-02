import test from "node:test";
import assert from "node:assert/strict";
import {
  BAND_ROWS,
  buildEscPosJob,
  buildEscPosLabel,
  buildRasterBand,
  DEFAULT_FEED_DOTS,
  DEFAULT_PRESENT_DOTS,
  presentDotsFromMm,
} from "./escpos-print";
import {
  DOTS_PER_MM,
  LABEL_PITCH_MM,
  PRINT_BAND_H_DOTS,
  PRINT_W_DOTS,
} from "./label-print-config";

const BYTES_PER_ROW = PRINT_W_DOTS / 8; // 48
/** The trailing ESC J that pushes the last label past the tear bar. */
const PRESENT_BYTES = 3;
/** The leading gap seek that registers the paper before the first label. */
const LEAD_BYTES = 2;

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
    // 64 lead-in + 6 full bands + 2-byte gap seek, for the 368 × 144 dot
    // printable band. buildEscPosLabel is one label, so no present feed.
    assert.equal(job.length, 64 + 6 * (8 + BAND_ROWS * BYTES_PER_ROW) + 2);
    assert.equal(job.length, 6738);
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
    assert.equal(
      buildEscPosJob([raster()], { copies: 3 }).length,
      LEAD_BYTES + one.length * 3 + PRESENT_BYTES
    );
  });

  await t.test("defaults to a single copy and clamps nonsense", () => {
    const one = buildEscPosLabel(raster());
    const expected = LEAD_BYTES + one.length + PRESENT_BYTES;
    assert.equal(buildEscPosJob([raster()]).length, expected);
    assert.equal(buildEscPosJob([raster()], { copies: 0 }).length, expected);
  });

  await t.test("concatenates multiple products", () => {
    const one = buildEscPosLabel(raster());
    assert.equal(
      buildEscPosJob([raster(), raster()]).length,
      LEAD_BYTES + one.length * 2 + PRESENT_BYTES
    );
  });

  await t.test("presents the last label with a counted feed, not a seek", () => {
    // A second gap seek is a no-op: the seek stops when the sensor sees the
    // gap, and the parked position is where the sensor sees the gap. Only a
    // counted feed actually moves the label out to the tear bar.
    const job = buildEscPosJob([raster()]);
    assert.deepEqual([...job.subarray(-3)], [0x1b, 0x4a, DEFAULT_PRESENT_DOTS]);
    assert.notDeepEqual([...job.subarray(-2)], [0x1d, 0x0c]);
  });

  await t.test("takes the tear-off distance from settings", () => {
    // Tear bars differ between printers, so the shop can tune this without a
    // deploy rather than waiting on another guess.
    const job = buildEscPosJob([raster()], { presentDots: 64 });
    assert.deepEqual([...job.subarray(-3)], [0x1b, 0x4a, 64]);
  });

  await t.test("clamps a nonsense tear-off distance", () => {
    // Past 25 mm the feed crosses the following die cut, and the seek opening
    // the next job then skips an extra sticker every time.
    assert.deepEqual([...buildEscPosJob([raster()], { presentDots: 9999 }).subarray(-3)],
      [0x1b, 0x4a, 200]);
    assert.deepEqual([...buildEscPosJob([raster()], { presentDots: -5 }).subarray(-2)],
      [0x1d, 0x0c], "a zero feed leaves the label's own seek as the last command");
    assert.deepEqual([...buildEscPosJob([raster()], { presentDots: Number.NaN }).subarray(-3)],
      [0x1b, 0x4a, DEFAULT_PRESENT_DOTS]);
  });

  await t.test("mm from settings convert to dots", () => {
    assert.equal(presentDotsFromMm("12"), 96);
    // Half millimetres land on whole dots: the head lays 8 to the millimetre.
    assert.equal(presentDotsFromMm("12.5"), 100);
    assert.equal(presentDotsFromMm("13"), 104);
    // A tenth of a millimetre is a real change: the head lays 8 dots to the
    // millimetre, so these are one dot apart and feed differently.
    assert.equal(presentDotsFromMm("13.1"), 105);
    assert.equal(presentDotsFromMm("13.2"), 106);
    // But 0.125 mm is the floor, so finer than that resolves to the same dot
    // rather than being discarded.
    assert.equal(presentDotsFromMm("12.55"), 100);
    assert.equal(presentDotsFromMm("13.15"), 105);
    assert.equal(presentDotsFromMm("13.3"), 106);
    assert.equal(presentDotsFromMm(18), 144);
    assert.equal(presentDotsFromMm(""), DEFAULT_PRESENT_DOTS);
    assert.equal(presentDotsFromMm(null), DEFAULT_PRESENT_DOTS);
    assert.equal(presentDotsFromMm("abc"), DEFAULT_PRESENT_DOTS);
  });

  await t.test("a run of labels keeps every label registered", () => {
    // The shape a multi-label run depends on: one seek to register the paper,
    // then each label followed by its own seek, then a single present feed.
    // Copies must not each pay the present feed, or a run of twenty wastes
    // twenty stickers.
    const job = buildEscPosJob([raster(), raster(), raster()]);
    const one = buildEscPosLabel(raster());

    assert.deepEqual([...job.subarray(0, 2)], [0x1d, 0x0c], "leading register");
    assert.equal(job.length, LEAD_BYTES + one.length * 3 + PRESENT_BYTES);

    let seeks = 0;
    for (let i = 0; i < job.length - 1; i++) {
      if (job[i] === 0x1d && job[i + 1] === 0x0c) seeks++;
    }
    assert.equal(seeks, 4, "one register plus one per label");

    let feeds = 0;
    for (let i = 0; i < job.length - 2; i++) {
      if (job[i] === 0x1b && job[i + 1] === 0x4a) feeds++;
    }
    assert.equal(feeds, 1, "exactly one present feed for the whole run");
  });

  await t.test("registers before the first label", () => {
    // The previous job left the paper part-way down a sticker.
    const job = buildEscPosJob([raster()]);
    assert.deepEqual([...job.subarray(0, 2)], [0x1d, 0x0c]);
  });

  await t.test("pays the present feed once per job, not once per label", () => {
    // It costs a blank sticker, so a run of twenty must not cost twenty.
    const one = buildEscPosLabel(raster());
    const twenty = buildEscPosJob([raster()], { copies: 20 });
    assert.equal(twenty.length, LEAD_BYTES + one.length * 20 + PRESENT_BYTES);
  });

  await t.test("can be told not to present", () => {
    const job = buildEscPosJob([raster()], { present: false });
    assert.equal(job.length, buildEscPosLabel(raster()).length);
    assert.deepEqual([...job.subarray(-2)], [0x1d, 0x0c]);
  });

  await t.test("presents by counted feed when the sensor is not in use", () => {
    // A blind job has no sensor to recover with, so its feed must be an exact
    // pitch or every later label is out of step. ESC J tops out at 255 dots,
    // so that takes two commands. And it must not lead with a seek.
    const job = buildEscPosJob([raster()], { endOfLabel: "feed" });
    const pitch = LABEL_PITCH_MM * DOTS_PER_MM;
    assert.deepEqual(
      [...job.subarray(-6)],
      [0x1b, 0x4a, 255, 0x1b, 0x4a, pitch - 255]
    );
    assert.notDeepEqual([...job.subarray(0, 2)], [0x1d, 0x0c]);
  });
});

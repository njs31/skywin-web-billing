import test from "node:test";
import assert from "node:assert/strict";
import { buildTsplJob, concatBytes } from "./tspl-print";
import { TSPL_LABEL_W_MM, TSPL_LABEL_H_MM, TSPL_GAP_MM } from "./label-print-config";

function raster(width = 384, height = 168) {
  const bytesPerRow = Math.ceil(width / 8);
  return {
    width,
    height,
    bytesPerRow,
    bytes: new Uint8Array(bytesPerRow * height).fill(0xa5),
  };
}

function decode(bytes: Uint8Array) {
  return new TextDecoder("latin1").decode(bytes);
}

test("concatBytes", async (t) => {
  await t.test("joins parts in order with no gaps", () => {
    const joined = concatBytes([
      Uint8Array.from([1, 2]),
      Uint8Array.from([3]),
      Uint8Array.from([4, 5, 6]),
    ]);
    assert.deepEqual([...joined], [1, 2, 3, 4, 5, 6]);
  });
});

test("buildTsplJob", async (t) => {
  const r = raster();
  const job = buildTsplJob(r, 1);
  const text = decode(job);

  await t.test("declares the real media size, not a guess", () => {
    assert.ok(
      text.includes(`SIZE ${TSPL_LABEL_W_MM} mm,${TSPL_LABEL_H_MM} mm`),
      "SIZE command missing or wrong"
    );
    assert.ok(text.includes(`GAP ${TSPL_GAP_MM} mm,0 mm`), "GAP command missing or wrong");
  });

  await t.test("clears the buffer before drawing", () => {
    assert.ok(/CLS\r\n/.test(text), "CLS missing");
    // CLS must come after the SIZE/GAP header and before BITMAP.
    const clsAt = text.indexOf("CLS\r\n");
    const bitmapAt = text.indexOf("BITMAP");
    assert.ok(clsAt >= 0 && bitmapAt > clsAt, "CLS does not precede BITMAP");
  });

  await t.test("BITMAP declares the raster's real dimensions", () => {
    assert.ok(
      text.includes(`BITMAP 0,0,${r.bytesPerRow},${r.height},0,`),
      "BITMAP header does not match the raster passed in"
    );
  });

  await t.test("the raster's own bytes are carried verbatim, not corrupted", () => {
    // The raster is filled with a distinctive byte; every one of them must
    // still be in the job, uninterpreted as text (no accidental encoding).
    const count = [...job].filter((b) => b === 0xa5).length;
    assert.equal(count, r.bytes.length);
  });

  await t.test("prints exactly one copy when asked for one", () => {
    assert.ok(/PRINT 1,1\r\n$/.test(text), "PRINT 1,1 missing or not last");
  });
});

test("buildTsplJob copies", async (t) => {
  await t.test("repeats via PRINT 1,N, not by repeating the bitmap", () => {
    const r = raster();
    const job = buildTsplJob(r, 6);
    const text = decode(job);
    assert.ok(/PRINT 1,6\r\n$/.test(text), "PRINT 1,6 missing or not last");
    // Exactly one BITMAP command — the printer's own firmware does the
    // repeating, not N copies of the raster bytes sent from the browser.
    const bitmapCount = (text.match(/BITMAP /g) ?? []).length;
    assert.equal(bitmapCount, 1);
  });

  await t.test("clamps a nonsense copy count to something sane", () => {
    const r = raster();
    assert.ok(/PRINT 1,1\r\n$/.test(decode(buildTsplJob(r, 0))));
    assert.ok(/PRINT 1,1\r\n$/.test(decode(buildTsplJob(r, -5))));
    assert.ok(/PRINT 1,999\r\n$/.test(decode(buildTsplJob(r, 5000))));
  });
});

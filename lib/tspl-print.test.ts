import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTsplHeader,
  buildTsplJob,
  buildTsplLabel,
  invertBits,
} from "./tspl-print";
import { LABEL_H_DOTS, PRINT_W_DOTS, PRINT_X_DOTS } from "./label-print-config";

const BYTES_PER_ROW = PRINT_W_DOTS / 8; // 48

function raster(fill = 0b10101010) {
  return {
    width: PRINT_W_DOTS,
    height: LABEL_H_DOTS,
    bytesPerRow: BYTES_PER_ROW,
    bytes: new Uint8Array(BYTES_PER_ROW * LABEL_H_DOTS).fill(fill),
  };
}

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("TSPL job", () => {
  it("declares the die-cut media so the printer stops at each gap", () => {
    const header = latin1(buildTsplHeader());
    // Without SIZE/GAP the printer has no idea where a sticker ends and the
    // artwork runs on to the next one.
    assert.match(header, /^SIZE 50 mm,25 mm\r\n/);
    assert.match(header, /\r\nGAP 2 mm,0 mm\r\n/);
    assert.match(header, /\r\nCLS\r\n$/);
  });

  it("honours a different gap, density and orientation", () => {
    const header = latin1(
      buildTsplHeader({ gapMm: 3, density: 12, speed: 3, upright: false })
    );
    assert.match(header, /GAP 3 mm,0 mm/);
    assert.match(header, /DENSITY 12/);
    assert.match(header, /SPEED 3/);
    assert.match(header, /DIRECTION 0/);
  });

  it("sends the bitmap width in bytes and height in dots, at the head offset", () => {
    const text = latin1(buildTsplLabel(raster()));
    assert.match(
      text,
      new RegExp(`BITMAP ${PRINT_X_DOTS},0,${BYTES_PER_ROW},${LABEL_H_DOTS},0,`)
    );
  });

  it("inverts the raster, because a TSPL 0 bit is the one that burns", () => {
    const payload = buildTsplLabel(raster(0b10101010));
    const prefix = `BITMAP ${PRINT_X_DOTS},0,${BYTES_PER_ROW},${LABEL_H_DOTS},0,`;
    const dataStart = latin1(payload).indexOf(prefix) + prefix.length;
    // Sending our 1-means-ink raster straight through prints a solid black label.
    assert.equal(payload[dataStart], 0b01010101);
  });

  it("round-trips through invertBits", () => {
    const source = new Uint8Array([0x00, 0xff, 0xa5]);
    assert.deepEqual([...invertBits(source)], [0xff, 0x00, 0x5a]);
    assert.deepEqual([...invertBits(invertBits(source))], [...source]);
  });

  it("asks the firmware for copies instead of resending the image", () => {
    const text = latin1(buildTsplLabel(raster(), { copies: 4 }));
    assert.match(text, /PRINT 1,4\r\n$/);
    assert.equal(text.split("BITMAP").length - 1, 1);
  });

  it("clears the buffer before each label in a run", () => {
    const text = latin1(buildTsplJob([raster(), raster(), raster()]));
    assert.equal(text.split("BITMAP").length - 1, 3);
    assert.equal(text.split("PRINT 1,").length - 1, 3);
    // One media setup for the job, then CLS per label.
    assert.equal(text.split("SIZE 50 mm").length - 1, 1);
    assert.equal(text.split("CLS").length - 1, 4);
  });

  it("contains no document markup for the printer to print as text", () => {
    const text = latin1(buildTsplJob([raster()]));
    for (const marker of ["%PDF", "%!PS", "<html", "<!DOCTYPE", "data:image"]) {
      assert.ok(!text.includes(marker), `job leaked ${marker}`);
    }
  });

  it("rejects a raster whose data does not match its dimensions", () => {
    assert.throws(
      () =>
        buildTsplLabel({
          width: 8,
          height: 2,
          bytesPerRow: 1,
          bytes: new Uint8Array(3),
        }),
      /does not match/
    );
  });
});

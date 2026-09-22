import { describe, expect, it } from "vitest";
import { composeOnPaper, createEmptyBitmap, grayToBits, computeLayout, trimBlankRows } from "./bitmap";
import { BYTES_PER_LINE, PAPER_WIDTH_DOTS } from "./constants";
import { bitmapToEscPos, packBitmapRows, PROBE_BYTES } from "./escpos";

describe("packBitmapRows", () => {
  it("empacota 384 dots em 48 bytes por linha, bit 7 = pixel esquerdo", () => {
    const bmp = createEmptyBitmap(2);
    bmp.bits[0] = 1; // x=0, y=0
    bmp.bits[7] = 1; // x=7, y=0
    bmp.bits[PAPER_WIDTH_DOTS + 383] = 1; // x=383, y=1
    const packed = packBitmapRows(bmp);
    expect(packed.length).toBe(BYTES_PER_LINE * 2);
    expect(packed[0]).toBe(0b1000_0001);
    expect(packed[BYTES_PER_LINE + 47]).toBe(0b0000_0001);
  });

  it("rejeita bitmap com largura diferente de 384", () => {
    expect(() => packBitmapRows({ width: 100, height: 1, bits: new Uint8Array(100) })).toThrow();
  });
});

describe("bitmapToEscPos", () => {
  it("gera ESC @, ESC a 1, GS v 0 m=0 xL=48 xH=0 e avanço final", () => {
    const bmp = createEmptyBitmap(3);
    const out = bitmapToEscPos(bmp, { feedLines: 4 });
    const head = Array.from(out.subarray(0, 13));
    expect(head).toEqual([
      0x1b, 0x40, // ESC @
      0x1b, 0x61, 0x01, // ESC a 1
      0x1d, 0x76, 0x30, 0x00, // GS v 0 m=0
      48, 0, // xL xH
      3, 0, // yL yH
    ]);
    expect(out.length).toBe(13 + 48 * 3 + 3);
    expect(Array.from(out.subarray(out.length - 3))).toEqual([0x1b, 0x64, 4]);
  });

  it("é determinístico", () => {
    const bmp = createEmptyBitmap(10);
    for (let i = 0; i < bmp.bits.length; i += 3) bmp.bits[i] = 1;
    expect(bitmapToEscPos(bmp)).toEqual(bitmapToEscPos(bmp));
  });

  it("divide em bandas quando a altura passa de 1024 linhas", () => {
    const bmp = createEmptyBitmap(1500);
    const out = bitmapToEscPos(bmp);
    // 2 cabeçalhos GS v 0 (8 bytes cada)
    expect(out.length).toBe(2 + 3 + 8 * 2 + 48 * 1500 + 3);
    const second = 5 + 8 + 48 * 1024;
    expect(Array.from(out.subarray(second, second + 8))).toEqual([0x1d, 0x76, 0x30, 0, 48, 0, 476 & 0xff, 476 >> 8]);
  });

  it("PROBE_BYTES é apenas ESC @", () => {
    expect(Array.from(PROBE_BYTES)).toEqual([0x1b, 0x40]);
  });
});

describe("pipeline 1-bit", () => {
  it("threshold simples sem dithering", () => {
    const gray = Float32Array.from([0, 100, 127, 128, 200, 255]);
    expect(Array.from(grayToBits(gray, 6, 1, 128, "none"))).toEqual([1, 1, 1, 0, 0, 0]);
  });

  it("layout respeita margens e alinhamento, sempre dentro de 384", () => {
    const l = computeLayout(100, 50, { scale: 50, marginLeft: 16, marginRight: 16, align: "right" });
    expect(l.w).toBe(176);
    expect(l.h).toBe(88);
    expect(l.x + l.w).toBe(PAPER_WIDTH_DOTS - 16);
  });

  it("composeOnPaper produz 384 de largura e trimBlankRows remove linhas vazias", () => {
    const content = new Uint8Array([0, 0, 1, 1, 0, 0]); // 2x3
    const bmp = composeOnPaper(content, 2, 3, 10, false);
    expect(bmp.width).toBe(PAPER_WIDTH_DOTS);
    expect(bmp.height).toBe(3);
    expect(bmp.bits[PAPER_WIDTH_DOTS + 10]).toBe(1);
    expect(trimBlankRows(bmp).height).toBe(1);
  });
});
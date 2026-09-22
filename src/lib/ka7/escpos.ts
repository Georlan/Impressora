import { assertPaperWidth, type Bitmap1 } from "./bitmap";
import { BYTES_PER_LINE } from "./constants";

const ESC = 0x1b;
const GS = 0x1d;

/** Altura máxima por comando GS v 0 (yL yH → 16 bits). Dividimos em bandas menores. */
const MAX_BAND_HEIGHT = 1024;

export interface EscPosOptions {
  /** Linhas de avanço de papel ao final (ESC d n). */
  feedLines?: number;
}

/**
 * Empacota um bitmap 1-bit (1 = preto) em linhas de 48 bytes.
 * Bit 7 do primeiro byte = pixel mais à esquerda.
 */
export function packBitmapRows(bitmap: Bitmap1): Uint8Array {
  assertPaperWidth(bitmap);
  const { width, height, bits } = bitmap;
  const out = new Uint8Array(BYTES_PER_LINE * height);
  for (let y = 0; y < height; y++) {
    const rowIn = y * width;
    const rowOut = y * BYTES_PER_LINE;
    for (let x = 0; x < width; x++) {
      if (bits[rowIn + x]) {
        out[rowOut + (x >> 3)] = (out[rowOut + (x >> 3)] ?? 0) | (0x80 >> (x & 7));
      }
    }
  }
  return out;
}

/**
 * Gera o fluxo ESC/POS completo (determinístico):
 *   ESC @            → inicializa
 *   ESC a 1          → centraliza
 *   GS v 0 m=0 xL xH yL yH + raster   (em bandas)
 *   ESC d n          → avanço final
 */
export function bitmapToEscPos(bitmap: Bitmap1, opts: EscPosOptions = {}): Uint8Array {
  assertPaperWidth(bitmap);
  const feed = Math.max(0, Math.min(255, opts.feedLines ?? 4));
  const packed = packBitmapRows(bitmap);
  const chunks: number[][] = [];

  chunks.push([ESC, 0x40]); // ESC @
  chunks.push([ESC, 0x61, 0x01]); // ESC a 1

  let total = 0;
  const bands: { header: number[]; start: number; end: number }[] = [];
  for (let y0 = 0; y0 < bitmap.height; y0 += MAX_BAND_HEIGHT) {
    const h = Math.min(MAX_BAND_HEIGHT, bitmap.height - y0);
    const header = [
      GS,
      0x76,
      0x30,
      0x00, // m = 0 (normal)
      BYTES_PER_LINE & 0xff, // xL = 48
      (BYTES_PER_LINE >> 8) & 0xff, // xH = 0
      h & 0xff, // yL
      (h >> 8) & 0xff, // yH
    ];
    bands.push({ header, start: y0 * BYTES_PER_LINE, end: (y0 + h) * BYTES_PER_LINE });
  }

  const tail = [ESC, 0x64, feed]; // ESC d n

  for (const c of chunks) total += c.length;
  for (const b of bands) total += b.header.length + (b.end - b.start);
  total += tail.length;

  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  for (const b of bands) {
    out.set(b.header, off);
    off += b.header.length;
    out.set(packed.subarray(b.start, b.end), off);
    off += b.end - b.start;
  }
  out.set(tail, off);
  return out;
}

/** Bytes mínimos para uma sondagem segura de conexão: só ESC @ (não imprime nada). */
export const PROBE_BYTES = new Uint8Array([ESC, 0x40]);

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
import { PAPER_WIDTH_DOTS } from "./constants";

/**
 * Bitmap 1-bit final: exatamente 384 colunas.
 * `bits[y * width + x]` = 1 (preto) ou 0 (branco).
 * É o MESMO bitmap usado pelo preview e pela geração ESC/POS.
 */
export interface Bitmap1 {
  width: number;
  height: number;
  bits: Uint8Array;
}

export type Preset = "pixelart" | "foto" | "logo";
export type Dither = "none" | "floyd" | "atkinson";
export type Align = "left" | "center" | "right";

export interface ProcessSettings {
  preset: Preset;
  /** 0–255: cinza abaixo do limiar vira preto. */
  threshold: number;
  /** -100..100 */
  brightness: number;
  /** -100..100 */
  contrast: number;
  dither: Dither;
  invert: boolean;
  autoCrop: boolean;
  /** 10..100 — % da área útil (384 - margens). */
  scale: number;
  marginLeft: number;
  marginRight: number;
  align: Align;
}

export const PRESETS: Record<Preset, Omit<ProcessSettings, "preset">> = {
  pixelart: {
    threshold: 128,
    brightness: 0,
    contrast: 0,
    dither: "none",
    invert: false,
    autoCrop: false,
    scale: 100,
    marginLeft: 0,
    marginRight: 0,
    align: "center",
  },
  foto: {
    threshold: 128,
    brightness: 0,
    contrast: 10,
    dither: "floyd",
    invert: false,
    autoCrop: false,
    scale: 100,
    marginLeft: 0,
    marginRight: 0,
    align: "center",
  },
  logo: {
    threshold: 165,
    brightness: 0,
    contrast: 25,
    dither: "none",
    invert: false,
    autoCrop: true,
    scale: 90,
    marginLeft: 0,
    marginRight: 0,
    align: "center",
  },
};

export const PRESET_LABELS: Record<Preset, string> = {
  pixelart: "Pixel Art",
  foto: "Foto",
  logo: "Logo",
};

export function settingsFromPreset(preset: Preset): ProcessSettings {
  return { preset, ...PRESETS[preset] };
}

export function createEmptyBitmap(height: number): Bitmap1 {
  return { width: PAPER_WIDTH_DOTS, height, bits: new Uint8Array(PAPER_WIDTH_DOTS * height) };
}

export function assertPaperWidth(bitmap: Bitmap1): void {
  if (bitmap.width !== PAPER_WIDTH_DOTS) {
    throw new Error(`Bitmap inválido: largura ${bitmap.width}, esperado ${PAPER_WIDTH_DOTS} dots.`);
  }
  if (bitmap.bits.length !== bitmap.width * bitmap.height) {
    throw new Error("Bitmap inválido: tamanho de dados não confere com width*height.");
  }
}

/* ------------------------------------------------------------------------ */
/* Pipeline puro sobre arrays (testável fora do browser)                     */
/* ------------------------------------------------------------------------ */

/** Converte RGBA (compondo alpha sobre branco) em cinza 0..255 (Float32). */
export function rgbaToGray(rgba: Uint8ClampedArray | Uint8Array, count: number): Float32Array {
  const gray = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const a = (rgba[o + 3] ?? 255) / 255;
    const r = (rgba[o] ?? 0) * a + 255 * (1 - a);
    const g = (rgba[o + 1] ?? 0) * a + 255 * (1 - a);
    const b = (rgba[o + 2] ?? 0) * a + 255 * (1 - a);
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

/** Bounding box de pixels "não brancos" (cinza < limite). Retorna null se vazio. */
export function findContentBounds(
  gray: Float32Array,
  width: number,
  height: number,
  whiteLimit = 245,
): { x: number; y: number; w: number; h: number } | null {
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((gray[y * width + x] ?? 255) < whiteLimit) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Aplica brilho (-100..100) e contraste (-100..100) in-place. */
export function applyBrightnessContrast(
  gray: Float32Array,
  brightness: number,
  contrast: number,
): void {
  const b = (brightness / 100) * 128;
  const c = contrast / 100;
  const factor = c >= 0 ? 1 + c * 3 : 1 + c; // até 4x ou até 0x
  for (let i = 0; i < gray.length; i++) {
    let v = ((gray[i] ?? 0) - 128) * factor + 128 + b;
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    gray[i] = v;
  }
}

/**
 * Converte cinza em bits (1 = preto) usando threshold ou dithering.
 * Determinístico: sem aleatoriedade.
 */
export function grayToBits(
  gray: Float32Array,
  width: number,
  height: number,
  threshold: number,
  dither: Dither,
): Uint8Array {
  const bits = new Uint8Array(width * height);
  if (dither === "none") {
    for (let i = 0; i < gray.length; i++) bits[i] = (gray[i] ?? 0) < threshold ? 1 : 0;
    return bits;
  }
  const buf = Float32Array.from(gray);
  const spread = (x: number, y: number, err: number) => {
    if (x < 0 || x >= width || y >= height) return;
    buf[y * width + x] = (buf[y * width + x] ?? 0) + err;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = buf[i] ?? 0;
      const black = old < threshold;
      bits[i] = black ? 1 : 0;
      const err = old - (black ? 0 : 255);
      if (dither === "floyd") {
        spread(x + 1, y, (err * 7) / 16);
        spread(x - 1, y + 1, (err * 3) / 16);
        spread(x, y + 1, (err * 5) / 16);
        spread(x + 1, y + 1, (err * 1) / 16);
      } else {
        const e = err / 8;
        spread(x + 1, y, e);
        spread(x + 2, y, e);
        spread(x - 1, y + 1, e);
        spread(x, y + 1, e);
        spread(x + 1, y + 1, e);
        spread(x, y + 2, e);
      }
    }
  }
  return bits;
}

/** Calcula largura/altura do conteúdo e o deslocamento X dentro dos 384 dots. */
export function computeLayout(
  srcW: number,
  srcH: number,
  s: Pick<ProcessSettings, "scale" | "marginLeft" | "marginRight" | "align">,
): { w: number; h: number; x: number } {
  const ml = Math.max(0, Math.min(PAPER_WIDTH_DOTS - 8, Math.round(s.marginLeft)));
  const mr = Math.max(0, Math.min(PAPER_WIDTH_DOTS - 8 - ml, Math.round(s.marginRight)));
  const usable = PAPER_WIDTH_DOTS - ml - mr;
  const w = Math.max(1, Math.round((usable * Math.max(1, s.scale)) / 100));
  const h = Math.max(1, Math.round((srcH * w) / srcW));
  let x = ml;
  if (s.align === "center") x = ml + Math.floor((usable - w) / 2);
  else if (s.align === "right") x = ml + usable - w;
  return { w, h, x };
}

/** Coloca bits de conteúdo (w×h) num bitmap de 384 dots com deslocamento x. */
export function composeOnPaper(
  content: Uint8Array,
  w: number,
  h: number,
  x: number,
  invert: boolean,
): Bitmap1 {
  const bmp = createEmptyBitmap(h);
  for (let y = 0; y < h; y++) {
    const rowOff = y * PAPER_WIDTH_DOTS;
    for (let cx = 0; cx < w; cx++) {
      const px = x + cx;
      if (px < 0 || px >= PAPER_WIDTH_DOTS) continue;
      bmp.bits[rowOff + px] = content[y * w + cx] ?? 0;
    }
  }
  if (invert) for (let i = 0; i < bmp.bits.length; i++) bmp.bits[i] = (bmp.bits[i] ?? 0) ^ 1;
  return bmp;
}

/** Trim de linhas totalmente brancas no topo e na base (limita papel gasto). */
export function trimBlankRows(bmp: Bitmap1): Bitmap1 {
  const { width, height, bits } = bmp;
  const rowBlank = (y: number) => {
    const off = y * width;
    for (let x = 0; x < width; x++) if (bits[off + x]) return false;
    return true;
  };
  let top = 0;
  let bottom = height - 1;
  while (top < height && rowBlank(top)) top++;
  while (bottom > top && rowBlank(bottom)) bottom--;
  if (top === 0 && bottom === height - 1) return bmp;
  const h = Math.max(1, bottom - top + 1);
  return { width, height: h, bits: bits.slice(top * width, (top + h) * width) };
}
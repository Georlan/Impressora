/**
 * Processamento de imagem no browser (Canvas/ImageData).
 * Resultado: Bitmap1 de 384 dots — o mesmo usado no preview e no ESC/POS.
 */
import {
  applyBrightnessContrast,
  composeOnPaper,
  computeLayout,
  findContentBounds,
  grayToBits,
  rgbaToGray,
  trimBlankRows,
  type Bitmap1,
  type ProcessSettings,
} from "./bitmap";
import { PAPER_WIDTH_DOTS } from "./constants";

export interface LoadedImage {
  name: string;
  width: number;
  height: number;
  source: HTMLImageElement;
  objectUrl: string;
}

export function loadImageFile(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () =>
      resolve({
        name: file.name,
        width: img.naturalWidth,
        height: img.naturalHeight,
        source: img,
        objectUrl: url,
      });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível abrir esta imagem."));
    };
    img.src = url;
  });
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function processImage(img: LoadedImage, s: ProcessSettings): Bitmap1 {
  // 1) Rasteriza a imagem original em tamanho natural (limitando memória).
  const MAX_SRC = 2048;
  const k = Math.min(1, MAX_SRC / Math.max(img.width, img.height));
  const sw = Math.max(1, Math.round(img.width * k));
  const sh = Math.max(1, Math.round(img.height * k));
  const srcCanvas = makeCanvas(sw, sh);
  const sctx = srcCanvas.getContext("2d", { willReadFrequently: true })!;
  sctx.imageSmoothingEnabled = k < 1 && s.preset !== "pixelart";
  sctx.drawImage(img.source, 0, 0, sw, sh);

  // 2) Recorte automático de bordas brancas/transparentes.
  let crop = { x: 0, y: 0, w: sw, h: sh };
  if (s.autoCrop) {
    const gray = rgbaToGray(sctx.getImageData(0, 0, sw, sh).data, sw * sh);
    const b = findContentBounds(gray, sw, sh);
    if (b) crop = b;
  }

  // 3) Redimensiona para a largura útil (nearest para pixel art).
  const { w, h, x } = computeLayout(crop.w, crop.h, s);
  const dst = makeCanvas(w, h);
  const dctx = dst.getContext("2d", { willReadFrequently: true })!;
  dctx.imageSmoothingEnabled = s.preset !== "pixelart";
  dctx.imageSmoothingQuality = "high";
  dctx.drawImage(srcCanvas, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);

  // 4) Cinza → brilho/contraste → 1 bit.
  const gray = rgbaToGray(dctx.getImageData(0, 0, w, h).data, w * h);
  applyBrightnessContrast(gray, s.brightness, s.contrast);
  const bits = grayToBits(gray, w, h, s.threshold, s.dither);

  // 5) Compõe nos 384 dots com margens/alinhamento.
  const bmp = composeOnPaper(bits, w, h, x, s.invert);
  return s.invert ? bmp : trimBlankRows(bmp);
}

/** Desenha o bitmap 1-bit num canvas (preto sobre papel), sem suavização. */
export function drawBitmapToCanvas(bmp: Bitmap1, canvas: HTMLCanvasElement): void {
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d")!;
  const id = ctx.createImageData(bmp.width, bmp.height);
  for (let i = 0; i < bmp.bits.length; i++) {
    const v = bmp.bits[i] ? 0 : 255;
    const o = i * 4;
    id.data[o] = v;
    id.data[o + 1] = v;
    id.data[o + 2] = v;
    id.data[o + 3] = bmp.bits[i] ? 255 : 0; // branco transparente: papel aparece atrás
  }
  ctx.putImageData(id, 0, 0);
}

/** Miniatura PNG (data URL) do bitmap para o histórico. */
export function bitmapToThumbnail(bmp: Bitmap1, maxW = 96): string {
  const full = makeCanvas(bmp.width, bmp.height);
  const ctx = full.getContext("2d")!;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, bmp.width, bmp.height);
  const layer = makeCanvas(bmp.width, bmp.height);
  drawBitmapToCanvas(bmp, layer);
  ctx.drawImage(layer, 0, 0);
  const scale = maxW / PAPER_WIDTH_DOTS;
  const th = Math.max(1, Math.round(bmp.height * scale));
  const small = makeCanvas(maxW, Math.min(th, 160));
  const sctx = small.getContext("2d")!;
  sctx.fillStyle = "#f4efe4";
  sctx.fillRect(0, 0, small.width, small.height);
  sctx.drawImage(full, 0, 0, maxW, th);
  return small.toDataURL("image/png");
}
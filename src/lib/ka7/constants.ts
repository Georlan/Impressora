/** Largura física da KA-1445 / KA7 (58 mm): 384 dots por linha. */
export const PAPER_WIDTH_DOTS = 384;
/** 384 dots / 8 = 48 bytes por linha raster. */
export const BYTES_PER_LINE = PAPER_WIDTH_DOTS / 8;
/** Colunas de texto no modo -t (fonte padrão 12 dots → 32 colunas). */
export const TEXT_COLUMNS = 32;

export const PRINTER_INFO = {
  model: "KA-1445",
  alias: "KA7",
  mac: "configurado no utilitário local",
  transport: "Bluetooth Classic BR/EDR · SPP · RFCOMM canal 1",
} as const;

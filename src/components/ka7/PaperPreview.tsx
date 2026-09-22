import { useEffect, useRef } from "react";
import type { Bitmap1 } from "@/lib/ka7/bitmap";
import { drawBitmapToCanvas } from "@/lib/ka7/process-image";
import { PAPER_WIDTH_DOTS } from "@/lib/ka7/constants";
import { cn } from "@/lib/utils";

interface Props {
  bitmap: Bitmap1 | null;
  /** Escala visual do papel (1 = 384 px reais). */
  zoom?: number;
  emptyHint?: string;
  className?: string;
}

/**
 * Preview do papel de 58 mm. Renderiza o MESMO bitmap 1-bit que vai para a
 * impressora — sem suavização, sem "embelezar".
 */
export function PaperPreview({ bitmap, zoom = 1, emptyHint, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (ref.current && bitmap) drawBitmapToCanvas(bitmap, ref.current);
  }, [bitmap]);

  const width = PAPER_WIDTH_DOTS * zoom;

  return (
    <div className={cn("flex flex-col items-center", className)} style={{ width }}>
      <div className="paper-tear h-2 w-full rotate-180" aria-hidden />
      <div
        className="paper-sheet relative w-full overflow-hidden"
        style={{ minHeight: 160 * zoom }}
      >
        {bitmap ? (
          <canvas
            ref={ref}
            className="pixelated block"
            style={{ width, height: bitmap.height * zoom }}
            aria-label={`Preview térmico ${bitmap.width}×${bitmap.height} dots`}
          />
        ) : (
          <div className="flex h-full min-h-[inherit] items-center justify-center p-6 text-center font-mono text-xs uppercase tracking-widest text-paper-ink/50">
            {emptyHint ?? "sem conteúdo"}
          </div>
        )}
      </div>
      <div className="paper-tear h-2 w-full" aria-hidden />
    </div>
  );
}
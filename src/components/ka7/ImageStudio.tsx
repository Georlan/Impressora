import { Download, Printer } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Controls } from "./Controls";
import { Dropzone } from "./Dropzone";
import { PaperPreview } from "./PaperPreview";
import { settingsFromPreset, type ProcessSettings } from "@/lib/ka7/bitmap";
import { downloadBin, printRaw } from "@/lib/ka7/bridge";
import { BYTES_PER_LINE, PAPER_WIDTH_DOTS } from "@/lib/ka7/constants";
import { bitmapToEscPos, bytesToBase64 } from "@/lib/ka7/escpos";
import { newId, type HistoryItem } from "@/lib/ka7/history";
import {
  bitmapToThumbnail,
  loadImageFile,
  processImage,
  type LoadedImage,
} from "@/lib/ka7/process-image";

interface Props {
  demo: boolean;
  canPrint: boolean;
  onPrinted: (item: HistoryItem) => void;
}

export function ImageStudio({ demo, canPrint, onPrinted }: Props) {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [settings, setSettings] = useState<ProcessSettings>(() => settingsFromPreset("foto"));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      if (image) URL.revokeObjectURL(image.objectUrl);
    };
  }, [image]);

  const bitmap = useMemo(() => {
    if (!image) return null;
    try {
      return processImage(image, settings);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [image, settings]);

  const escpos = useMemo(() => (bitmap ? bitmapToEscPos(bitmap) : null), [bitmap]);

  const onFile = useCallback(async (file: File) => {
    try {
      const img = await loadImageFile(file);
      setImage(img);
      // Heurística: imagens pequenas provavelmente são pixel art.
      if (img.width <= 128 && img.height <= 128) setSettings(settingsFromPreset("pixelart"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  const makeHistory = (): HistoryItem | null => {
    if (!image || !bitmap || !escpos) return null;
    return {
      id: newId(),
      kind: "image",
      name: image.name,
      date: new Date().toISOString(),
      settings,
      thumbnail: bitmapToThumbnail(bitmap),
      escposBase64: bytesToBase64(escpos),
      heightDots: bitmap.height,
    };
  };

  const print = async () => {
    if (!escpos || !image) return;
    if (demo) {
      toast.info("Modo demo: nenhuma impressora local. Baixe o .bin e rode imprimir-ka7 arquivo.bin.");
      return;
    }
    setBusy(true);
    const t = toast.loading(`Enviando ${escpos.length.toLocaleString("pt-BR")} bytes para a KA7…`);
    const r = await printRaw(escpos);
    setBusy(false);
    if (r.ok) {
      toast.success("Impresso na KA7", { id: t, description: r.message });
      const h = makeHistory();
      if (h) onPrinted(h);
    } else {
      toast.error("Falha ao imprimir", { id: t, description: r.message });
    }
  };

  const download = () => {
    if (!escpos || !image) return;
    downloadBin(escpos, image.name.replace(/\.[^.]+$/, "") + ".ka7.bin");
    const h = makeHistory();
    if (h) onPrinted(h);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* Coluna esquerda */}
      <aside className="space-y-6">
        <Dropzone
          onFile={onFile}
          fileName={image?.name}
          dims={image ? { width: image.width, height: image.height } : undefined}
          compact={Boolean(image)}
        />
        <Controls value={settings} onChange={setSettings} />
      </aside>

      {/* Centro/direita: preview */}
      <section className="space-y-4">
        <div className="hairline-grid rounded-xl border border-border bg-surface/40 p-4 sm:p-8">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="flex flex-col items-center gap-3">
              <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                Original
              </h3>
              <div className="flex w-full max-w-[384px] items-center justify-center rounded-md border border-border/60 bg-background/60 p-2">
                {image ? (
                  <img
                    src={image.objectUrl}
                    alt={image.name}
                    className={
                      image.width <= 128 ? "pixelated max-h-[480px] w-full object-contain" : "max-h-[480px] w-full object-contain"
                    }
                  />
                ) : (
                  <div className="py-16 font-mono text-xs uppercase tracking-widest text-muted-foreground/60">
                    nenhuma imagem
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col items-center gap-3">
              <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                Preview térmico · 58 mm · {PAPER_WIDTH_DOTS} dots
              </h3>
              <div className="w-full max-w-[384px] overflow-x-auto">
                <PaperPreview bitmap={bitmap} emptyHint="o papel aparece aqui" />
              </div>
            </div>
          </div>
        </div>

        {/* Barra de ação */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <div className="flex-1 font-mono text-[11px] text-muted-foreground">
            {bitmap && escpos ? (
              <>
                {bitmap.width}×{bitmap.height} dots · {BYTES_PER_LINE} B/linha ·{" "}
                {escpos.length.toLocaleString("pt-BR")} bytes ESC/POS ·{" "}
                {(bitmap.height / 8).toFixed(0)} mm
              </>
            ) : (
              "GS v 0 · 384 dots · 48 bytes/linha"
            )}
          </div>
          <Button variant="outline" size="sm" onClick={download} disabled={!escpos}>
            <Download /> Baixar .bin
          </Button>
          <Button
            size="lg"
            onClick={print}
            disabled={!escpos || busy || (!demo && !canPrint)}
            className="font-semibold"
          >
            <Printer /> Imprimir na KA7
          </Button>
        </div>
      </section>
    </div>
  );
}
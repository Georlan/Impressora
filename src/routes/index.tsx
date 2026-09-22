import { createFileRoute } from "@tanstack/react-router";
import { CloudOff, Image as ImageIcon, Type } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HistoryList } from "@/components/ka7/HistoryList";
import { ImageStudio } from "@/components/ka7/ImageStudio";
import { PrinterConsole } from "@/components/ka7/PrinterConsole";
import { StatusBadge } from "@/components/ka7/StatusBadge";
import { TextStudio } from "@/components/ka7/TextStudio";
import { usePrinterStatus } from "@/hooks/use-printer-status";
import { getBridgeUrl, printRaw, printText } from "@/lib/ka7/bridge";
import { PRINTER_INFO } from "@/lib/ka7/constants";
import { base64ToBytes } from "@/lib/ka7/escpos";
import {
  addHistoryItem,
  clearHistory,
  loadHistory,
  removeHistoryItem,
  type HistoryItem,
} from "@/lib/ka7/history";

const TITLE = "KA7 Print Studio — impressora térmica KA-1445 (58 mm)";
const DESC =
  "Prepare e imprima imagens e texto na impressora térmica Bluetooth KA-1445 / KA7 via ESC/POS GS v 0, com preview real de 384 dots.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
    ],
  }),
  component: Index,
});

function Index() {
  const printer = usePrinterStatus();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("image");
  const [reprintText, setReprintText] = useState<string | undefined>();

  useEffect(() => setHistory(loadHistory()), []);

  const canPrint = !printer.demo && Boolean(printer.health?.commandFound);
  const onPrinted = (item: HistoryItem) => setHistory(addHistoryItem(item));

  const reprint = async (item: HistoryItem) => {
    if (printer.demo) {
      if (item.kind === "text") {
        setReprintText(item.text);
        setTab("text");
      }
      toast.info("Modo demo: reimpressão simulada.");
      return;
    }
    setBusy(true);
    const t = toast.loading(`Reimprimindo "${item.name}"…`);
    const r =
      item.kind === "image"
        ? await printRaw(base64ToBytes(item.escposBase64))
        : await printText(item.text);
    setBusy(false);
    if (r.ok) {
      toast.success("Reimpresso", { id: t, description: r.message });
      setHistory(addHistoryItem({ ...item, id: `${item.id}-${Date.now().toString(36)}`, date: new Date().toISOString() }));
    } else {
      toast.error("Falha ao reimprimir", { id: t, description: r.message });
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded bg-primary font-mono text-sm font-bold text-primary-foreground">
              K7
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight tracking-tight">
                KA7 Print Studio
              </h1>
              <p className="hidden font-mono text-[11px] text-muted-foreground sm:block">
                {PRINTER_INFO.model} · {PRINTER_INFO.mac} · 384 dots
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <StatusBadge
              status={printer.status}
              detail={printer.detail}
              onRefresh={() => void printer.probe()}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-8 px-4 py-6 sm:px-6">
        {printer.demo && (
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
            <CloudOff className="mt-0.5 size-4 shrink-0 text-warning" />
            <div>
              <strong>Modo demo.</strong> O bridge local em{" "}
              <code className="font-mono text-xs">{getBridgeUrl()}</code> não respondeu. Um preview
              hospedado na nuvem não alcança a impressora Bluetooth do seu computador. Rode{" "}
              <code className="font-mono text-xs">npm run dev:all</code> no Linux para imprimir de
              verdade. Você ainda pode preparar imagens e baixar o <code className="font-mono text-xs">.bin</code>.
            </div>
          </div>
        )}
        {printer.status === "unavailable" && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
            <CloudOff className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <strong>Último comando falhou.</strong> {printer.detail} Use os controles rápidos e
              abra o diagnóstico para ver o retorno real do utilitário.
            </div>
          </div>
        )}

        <PrinterConsole
          demo={printer.demo}
          disabled={printer.status === "testing"}
          onProbe={printer.probe}
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-9 bg-surface">
            <TabsTrigger value="image" className="gap-1.5 px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ImageIcon className="size-3.5" /> Imagem
            </TabsTrigger>
            <TabsTrigger value="text" className="gap-1.5 px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Type className="size-3.5" /> Texto
            </TabsTrigger>
          </TabsList>
          <TabsContent value="image" className="mt-5">
            <ImageStudio demo={printer.demo} canPrint={canPrint} onPrinted={onPrinted} />
          </TabsContent>
          <TabsContent value="text" className="mt-5">
            <TextStudio
              key={reprintText ?? "default"}
              demo={printer.demo}
              canPrint={canPrint}
              onPrinted={onPrinted}
              {...(reprintText !== undefined ? { initialText: reprintText } : {})}
            />
          </TabsContent>
        </Tabs>

        <HistoryList
          items={history}
          busy={busy}
          onReprint={reprint}
          onRemove={(id) => setHistory(removeHistoryItem(id))}
          onClear={() => {
            clearHistory();
            setHistory([]);
          }}
        />

        <footer className="border-t border-border pt-4 font-mono text-[11px] text-muted-foreground">
          {PRINTER_INFO.transport} · ESC @ · ESC a 1 · GS v 0 m=0 · 48 bytes/linha · via{" "}
          <span className="text-foreground/80">imprimir-ka7</span> (stdin)
        </footer>
      </main>
    </div>
  );
}
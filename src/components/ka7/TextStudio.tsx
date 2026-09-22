import { Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { printText } from "@/lib/ka7/bridge";
import { TEXT_COLUMNS } from "@/lib/ka7/constants";
import { newId, type HistoryItem } from "@/lib/ka7/history";

interface Props {
  demo: boolean;
  canPrint: boolean;
  onPrinted: (item: HistoryItem) => void;
  initialText?: string;
}

/** Quebra em linhas de 32 colunas, como a fonte padrão da impressora faz. */
function wrapLines(text: string, cols = TEXT_COLUMNS): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    if (raw.length === 0) {
      out.push("");
      continue;
    }
    let line = raw;
    while (line.length > cols) {
      let cut = line.lastIndexOf(" ", cols);
      if (cut <= 0) cut = cols;
      out.push(line.slice(0, cut));
      line = line.slice(cut).trimStart();
    }
    out.push(line);
  }
  return out;
}

export function TextStudio({ demo, canPrint, onPrinted, initialText }: Props) {
  const [text, setText] = useState(initialText ?? "KA7 Print Studio\n\nOlá, papel térmico!");
  const [busy, setBusy] = useState(false);
  const lines = wrapLines(text);

  const print = async () => {
    if (!text.trim()) return;
    if (demo) {
      toast.info("Modo demo: sem impressora local. Rode: imprimir-ka7 -t \"seu texto\"");
      return;
    }
    setBusy(true);
    const t = toast.loading("Enviando texto para a KA7…");
    const r = await printText(text);
    setBusy(false);
    if (r.ok) {
      toast.success("Texto impresso", { id: t, description: r.message });
      onPrinted({
        id: newId(),
        kind: "text",
        name: lines.find((l) => l.trim())?.slice(0, 40) || "Texto",
        date: new Date().toISOString(),
        text,
      });
    } else {
      toast.error("Falha ao imprimir", { id: t, description: r.message });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-3">
        <label className="text-xs text-muted-foreground" htmlFor="ka7-text">
          Texto (modo simples · <span className="font-mono">imprimir-ka7 -t</span>)
        </label>
        <Textarea
          id="ka7-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          className="resize-y bg-surface font-mono text-sm"
          spellCheck={false}
        />
        <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
          <span>{TEXT_COLUMNS} colunas · quebra automática</span>
          <span>
            {lines.length} {lines.length === 1 ? "linha" : "linhas"}
          </span>
        </div>
      </aside>

      <section className="space-y-4">
        <div className="hairline-grid flex justify-center rounded-xl border border-border bg-surface/40 p-4 sm:p-8">
          <div className="flex w-[384px] max-w-full flex-col">
            <div className="paper-tear h-2 w-full rotate-180" aria-hidden />
            <div className="paper-sheet min-h-[200px] px-3 py-4">
              <pre className="whitespace-pre font-mono text-[15px] leading-6 text-paper-ink">
                {lines.map((l, i) => (
                  <div key={i}>{l || " "}</div>
                ))}
              </pre>
            </div>
            <div className="paper-tear h-2 w-full" aria-hidden />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <div className="flex-1 font-mono text-[11px] text-muted-foreground">
            {text.length} caracteres · fonte interna da impressora
          </div>
          <Button
            size="lg"
            onClick={print}
            disabled={!text.trim() || busy || (!demo && !canPrint)}
            className="font-semibold"
          >
            <Printer /> Imprimir na KA7
          </Button>
        </div>
      </section>
    </div>
  );
}
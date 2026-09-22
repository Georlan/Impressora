import { Printer, Trash2, Type } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { PRESET_LABELS } from "@/lib/ka7/bitmap";
import type { HistoryItem } from "@/lib/ka7/history";

interface Props {
  items: HistoryItem[];
  busy: boolean;
  onReprint: (item: HistoryItem) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function HistoryList({ items, busy, onReprint, onRemove, onClear }: Props) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Histórico recente · local
        </h2>
        {items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground">
            Limpar
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center font-mono text-xs text-muted-foreground/70">
          Nada impresso ainda. Cada impressão fica salva neste navegador.
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2.5"
            >
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded bg-paper">
                {it.kind === "image" ? (
                  <img src={it.thumbnail} alt="" className="pixelated h-full w-full object-cover object-top" />
                ) : (
                  <Type className="size-5 text-paper-ink/70" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{it.name}</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {format(new Date(it.date), "dd MMM · HH:mm", { locale: ptBR })}
                  {" · "}
                  {it.kind === "image"
                    ? `${PRESET_LABELS[it.settings.preset]} · t${it.settings.threshold} · ${
                        it.settings.dither === "none" ? "sem dither" : it.settings.dither
                      } · ${it.heightDots}px`
                    : "texto"}
                </div>
              </div>
              <Button
                size="icon"
                variant="secondary"
                aria-label="Imprimir novamente"
                title="Imprimir novamente"
                disabled={busy}
                onClick={() => onReprint(it)}
              >
                <Printer />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remover"
                className="text-muted-foreground"
                onClick={() => onRemove(it.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
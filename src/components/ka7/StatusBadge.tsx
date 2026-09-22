import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PrinterStatus } from "@/lib/ka7/bridge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const LABEL: Record<PrinterStatus, string> = {
  ready: "Pronta",
  unavailable: "Indisponível",
  testing: "Testando...",
  demo: "Modo demo",
};

const DOT: Record<PrinterStatus, string> = {
  ready: "bg-success shadow-[0_0_10px] shadow-success/60",
  unavailable: "bg-destructive",
  testing: "bg-warning animate-pulse-dot",
  demo: "bg-muted-foreground",
};

interface Props {
  status: PrinterStatus;
  detail: string;
  onRefresh: () => void;
}

export function StatusBadge({ status, detail, onRefresh }: Props) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onRefresh}
            disabled={status === "testing"}
            className={cn(
              "group inline-flex h-8 items-center gap-2 rounded-full border border-border bg-surface px-3 font-mono text-xs uppercase tracking-wider text-foreground transition-colors hover:border-primary/50 disabled:cursor-wait",
            )}
            aria-label={`Status da KA7: ${LABEL[status]}. Clique para testar novamente.`}
          >
            <span className={cn("size-2 rounded-full", DOT[status])} />
            <span>KA7 · {LABEL[status]}</span>
            <RefreshCw
              className={cn(
                "size-3 text-muted-foreground transition-transform group-hover:rotate-90",
                status === "testing" && "animate-spin",
              )}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs font-mono text-xs">
          {detail}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
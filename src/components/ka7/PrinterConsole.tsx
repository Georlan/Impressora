import {
  Activity,
  ChevronsDown,
  FlaskConical,
  RefreshCcw,
  RotateCcw,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  clearBridgeLogs,
  feedPaper,
  getBridgeLogs,
  resetPrinter,
  testPrint,
  type BridgeLog,
  type BridgeResult,
} from "@/lib/ka7/bridge";

interface Props {
  demo: boolean;
  disabled?: boolean;
  onProbe: () => Promise<BridgeResult>;
}

function showResult(title: string, result: BridgeResult) {
  const description = [
    result.message,
    result.durationMs !== undefined ? `${result.durationMs} ms` : "",
    result.stderr ? `stderr: ${result.stderr}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  if (result.ok) toast.success(title, { description });
  else toast.error(title, { description });
}

export function PrinterConsole({ demo, disabled = false, onProbe }: Props) {
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<BridgeLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  const refreshLogs = useCallback(async () => {
    setLogs(await getBridgeLogs());
  }, []);

  useEffect(() => {
    if (showLogs && !demo) void refreshLogs();
  }, [demo, refreshLogs, showLogs]);

  const run = async (label: string, fn: () => Promise<BridgeResult>) => {
    if (demo) {
      toast.info("Bridge local indisponível. Rode npm run dev:all.");
      return;
    }
    setBusy(true);
    const result = await fn();
    setBusy(false);
    showResult(label, result);
    if (showLogs) void refreshLogs();
  };

  return (
    <section className="rounded-xl border border-border bg-surface/70">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="mr-auto">
          <h2 className="text-sm font-semibold">Controles rápidos da KA7</h2>
          <p className="font-mono text-[11px] text-muted-foreground">
            Cada botão abre uma conexão curta, envia o comando e fecha.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={busy || disabled}
          onClick={() => void run("Conexão testada", onProbe)}
        >
          <Activity />
          Testar conexão
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={busy || disabled}
          onClick={() => void run("Teste enviado", testPrint)}
        >
          <FlaskConical />
          Teste texto
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={busy || disabled}
          onClick={() => void run("KA7 reinicializada", resetPrinter)}
        >
          <RotateCcw />
          Reset
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="mr-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Feed
        </span>
        {[1, 3, 5, 10].map((lines) => (
          <Button
            key={lines}
            variant="secondary"
            size="sm"
            disabled={busy || disabled}
            onClick={() => void run(`Feed +${lines}`, () => feedPaper(lines))}
          >
            <ChevronsDown />
            +{lines}
          </Button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {busy && (
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-warning">
              <RefreshCcw className="size-3 animate-spin" />
              enviando
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={demo}
            onClick={() => {
              setShowLogs((v) => !v);
              if (!showLogs) void refreshLogs();
            }}
          >
            <TerminalSquare />
            {showLogs ? "Fechar diagnóstico" : "Diagnóstico"}
          </Button>
        </div>
      </div>

      {showLogs && (
        <div className="border-t border-border bg-background/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="mr-auto">
              <h3 className="font-mono text-xs font-semibold uppercase tracking-wider">
                Log do bridge
              </h3>
              <p className="text-xs text-muted-foreground">
                Mostra o retorno real do imprimir-ka7, inclusive stderr e duração.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void refreshLogs()}>
              <RefreshCcw />
              Atualizar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await clearBridgeLogs();
                setLogs([]);
              }}
            >
              <Trash2 />
              Limpar
            </Button>
          </div>

          {logs.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-8 text-center font-mono text-xs text-muted-foreground">
              Nenhum comando registrado nesta sessão do bridge.
            </div>
          ) : (
            <div className="max-h-72 space-y-2 overflow-auto pr-1">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-[11px]"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={log.ok ? "text-success" : "text-destructive"}>
                      {log.ok ? "OK" : "ERRO"}
                    </span>
                    <strong className="text-foreground">{log.action}</strong>
                    <span className="text-muted-foreground">
                      {new Date(log.at).toLocaleTimeString("pt-BR")}
                    </span>
                    <span className="text-muted-foreground">{log.durationMs} ms</span>
                    {log.bytes !== undefined && (
                      <span className="text-muted-foreground">{log.bytes} bytes</span>
                    )}
                  </div>
                  <p className="mt-1 break-words text-foreground/80">{log.message}</p>
                  {log.stderr && (
                    <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-destructive/10 p-2 text-destructive">
                      stderr: {log.stderr}
                    </pre>
                  )}
                  {log.stdout && log.stdout !== log.message && (
                    <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-muted/30 p-2 text-muted-foreground">
                      stdout: {log.stdout}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

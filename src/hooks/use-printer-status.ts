import { useCallback, useEffect, useRef, useState } from "react";
import { bridgeHealth, probePrinter, type BridgeHealth, type PrinterStatus } from "@/lib/ka7/bridge";

export interface PrinterState {
  status: PrinterStatus;
  health: BridgeHealth | null;
  detail: string;
  lastChecked: Date | null;
  refresh: () => Promise<void>;
  /** true quando o bridge local não responde (preview na nuvem, bridge parado…). */
  demo: boolean;
}

export function usePrinterStatus(): PrinterState {
  const [status, setStatus] = useState<PrinterStatus>("testing");
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [detail, setDetail] = useState("Procurando o bridge local…");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const running = useRef(false);

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setStatus("testing");
    setDetail("Testando…");
    try {
      const h = await bridgeHealth();
      setHealth(h);
      if (!h) {
        setStatus("demo");
        setDetail("Bridge local não encontrado — modo demo (sem impressão real).");
        return;
      }
      if (!h.commandFound) {
        setStatus("unavailable");
        setDetail(`Bridge ativo, mas "${h.command}" não está no PATH.`);
        return;
      }
      const r = await probePrinter();
      if (r.ok) {
        setStatus("ready");
        setDetail(`Conexão RFCOMM OK em ${r.durationMs ?? 0} ms.`);
      } else {
        setStatus("unavailable");
        setDetail(r.message);
      }
    } finally {
      setLastChecked(new Date());
      running.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, health, detail, lastChecked, refresh, demo: status === "demo" };
}
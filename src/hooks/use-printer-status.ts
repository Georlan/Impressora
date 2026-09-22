import { useCallback, useEffect, useRef, useState } from "react";
import {
  bridgeHealth,
  probePrinter,
  type BridgeHealth,
  type BridgeResult,
  type PrinterStatus,
} from "@/lib/ka7/bridge";

export interface PrinterState {
  status: PrinterStatus;
  health: BridgeHealth | null;
  detail: string;
  lastChecked: Date | null;
  /**
   * Atualiza apenas o estado do bridge por padrão.
   * Passe true para abrir uma conexão curta com a KA7.
   */
  refresh: (probe?: boolean) => Promise<void>;
  probe: () => Promise<BridgeResult>;
  demo: boolean;
}

export function usePrinterStatus(): PrinterState {
  const [status, setStatus] = useState<PrinterStatus>("testing");
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [detail, setDetail] = useState("Procurando o bridge local…");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const running = useRef(false);

  const checkBridge = useCallback(async (): Promise<BridgeHealth | null> => {
    const h = await bridgeHealth();
    setHealth(h);

    if (!h) {
      setStatus("demo");
      setDetail("Bridge local não encontrado — modo demo (sem impressão real).");
      return null;
    }

    if (!h.commandFound) {
      setStatus("unavailable");
      setDetail(`Bridge ativo, mas "${h.command}" não está no PATH.`);
      return h;
    }

    setStatus("standby");
    setDetail(
      h.busy
        ? "Bridge pronto, mas há um comando em andamento."
        : "Bridge pronto. A KA7 só conecta quando você envia um comando.",
    );
    return h;
  }, []);

  const probe = useCallback(async (): Promise<BridgeResult> => {
    if (running.current) {
      return { ok: false, message: "Já existe um teste em andamento." };
    }

    running.current = true;
    setStatus("testing");
    setDetail("Abrindo conexão curta com a KA7…");

    try {
      const h = await bridgeHealth();
      setHealth(h);

      if (!h) {
        const result = { ok: false, message: "Bridge local não encontrado." };
        setStatus("demo");
        setDetail(result.message);
        return result;
      }

      if (!h.commandFound) {
        const result = { ok: false, message: `"${h.command}" não está no PATH.` };
        setStatus("unavailable");
        setDetail(result.message);
        return result;
      }

      const r = await probePrinter();
      if (r.ok) {
        setStatus("ready");
        setDetail(`KA7 respondeu em ${r.durationMs ?? 0} ms. A conexão foi fechada após o teste.`);
      } else {
        setStatus("unavailable");
        setDetail(r.message);
      }
      return r;
    } finally {
      setLastChecked(new Date());
      running.current = false;
    }
  }, []);

  const refresh = useCallback(
    async (shouldProbe = false) => {
      if (shouldProbe) {
        await probe();
        return;
      }

      if (running.current) return;
      running.current = true;
      setStatus("testing");
      setDetail("Verificando bridge local…");
      try {
        await checkBridge();
      } finally {
        setLastChecked(new Date());
        running.current = false;
      }
    },
    [checkBridge, probe],
  );

  // Importante: não abre Bluetooth automaticamente ao carregar a página.
  // Isso evita conexões desnecessárias e disputa com outros clientes.
  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  return {
    status,
    health,
    detail,
    lastChecked,
    refresh,
    probe,
    demo: status === "demo",
  };
}

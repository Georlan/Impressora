/**
 * Cliente do bridge local (bridge/server.ts).
 *
 * O browser nunca fala Bluetooth diretamente. Todos os comandos passam pelo
 * bridge em localhost e, de lá, pelo utilitário imprimir-ka7.
 */

export const DEFAULT_BRIDGE_URL = "http://localhost:7777";

export function getBridgeUrl(): string {
  const fromEnv = import.meta.env["VITE_KA7_BRIDGE_URL"] as string | undefined;
  return (fromEnv && fromEnv.trim()) || DEFAULT_BRIDGE_URL;
}

export type PrinterStatus = "ready" | "standby" | "unavailable" | "testing" | "demo";

export interface BridgeHealth {
  ok: boolean;
  bridge: boolean;
  command: string;
  commandFound: boolean;
  commandPath?: string | null;
  version: string;
  busy?: boolean;
}

export interface BridgeResult {
  ok: boolean;
  message: string;
  bytes?: number;
  stderr?: string;
  stdout?: string;
  durationMs?: number;
}

export interface BridgeLog extends BridgeResult {
  id: string;
  at: string;
  action: string;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error("Tempo esgotado ao falar com o bridge.")), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
}

async function bridgeJson<T>(path: string, init?: RequestInit, timeoutMs = 20000): Promise<T> {
  const res = await withTimeout(
    fetch(`${getBridgeUrl()}${path}`, { cache: "no-store", ...init }),
    timeoutMs,
  );
  return (await res.json()) as T;
}

/** Verifica só o bridge e o comando local. Não abre Bluetooth. */
export async function bridgeHealth(): Promise<BridgeHealth | null> {
  try {
    const res = await withTimeout(fetch(`${getBridgeUrl()}/health`, { cache: "no-store" }), 2500);
    if (!res.ok) return null;
    return (await res.json()) as BridgeHealth;
  } catch {
    return null;
  }
}

/** Abre uma conexão curta, envia ESC @ e fecha. Não movimenta papel. */
export async function probePrinter(): Promise<BridgeResult> {
  try {
    return await bridgeJson<BridgeResult>("/probe", { method: "POST" });
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Reinicializa o estado ESC/POS sem imprimir. */
export async function resetPrinter(): Promise<BridgeResult> {
  try {
    return await bridgeJson<BridgeResult>("/reset", { method: "POST" });
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Move o papel usando ESC d n. */
export async function feedPaper(lines: number): Promise<BridgeResult> {
  try {
    return await bridgeJson<BridgeResult>(
      "/feed",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lines }),
      },
      30000,
    );
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Envia bytes ESC/POS crus → stdin de imprimir-ka7. */
export async function printRaw(bytes: Uint8Array): Promise<BridgeResult> {
  try {
    return await bridgeJson<BridgeResult>(
      "/print/raw",
      {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: bytes as BodyInit,
      },
      60000,
    );
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Texto simples → imprimir-ka7 -t. */
export async function printText(text: string): Promise<BridgeResult> {
  try {
    return await bridgeJson<BridgeResult>(
      "/print/text",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      },
      60000,
    );
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Teste curto de texto. */
export function testPrint(): Promise<BridgeResult> {
  return printText("KA7 Print Studio\nTeste OK");
}

export async function getBridgeLogs(): Promise<BridgeLog[]> {
  try {
    const r = await bridgeJson<{ ok: boolean; logs: BridgeLog[] }>("/logs", undefined, 3000);
    return r.logs ?? [];
  } catch {
    return [];
  }
}

export async function clearBridgeLogs(): Promise<void> {
  try {
    await bridgeJson("/logs", { method: "DELETE" }, 3000);
  } catch {
    // diagnóstico não deve quebrar a UI
  }
}

/** Dispara download de .bin para impressão manual. */
export function downloadBin(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

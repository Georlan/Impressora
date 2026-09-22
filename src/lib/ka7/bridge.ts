/**
 * Cliente do bridge local (bridge/server.ts).
 *
 * IMPORTANTE: o browser NUNCA fala Bluetooth. Ele só envia bytes por HTTP para
 * o bridge rodando em localhost, que faz pipe para o comando `imprimir-ka7`.
 * Um preview hospedado na nuvem não alcança a impressora — nesse caso o app
 * entra em "modo demo".
 */

export const DEFAULT_BRIDGE_URL = "http://localhost:7777";

export function getBridgeUrl(): string {
  const fromEnv = import.meta.env["VITE_KA7_BRIDGE_URL"] as string | undefined;
  return (fromEnv && fromEnv.trim()) || DEFAULT_BRIDGE_URL;
}

export type PrinterStatus = "ready" | "unavailable" | "testing" | "demo";

export interface BridgeHealth {
  ok: boolean;
  bridge: boolean;
  command: string;
  commandFound: boolean;
  version: string;
}

export interface BridgeResult {
  ok: boolean;
  message: string;
  bytes?: number;
  stderr?: string;
  durationMs?: number;
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

/** O bridge está rodando? (não toca na impressora) */
export async function bridgeHealth(): Promise<BridgeHealth | null> {
  try {
    const res = await withTimeout(fetch(`${getBridgeUrl()}/health`, { cache: "no-store" }), 2500);
    if (!res.ok) return null;
    return (await res.json()) as BridgeHealth;
  } catch {
    return null;
  }
}

/** Sondagem real: abre RFCOMM, envia só ESC @ e fecha. Não gasta papel. */
export async function probePrinter(): Promise<BridgeResult> {
  try {
    const res = await withTimeout(
      fetch(`${getBridgeUrl()}/probe`, { method: "POST" }),
      20000,
    );
    return (await res.json()) as BridgeResult;
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Envia bytes ESC/POS crus → stdin de `imprimir-ka7`. */
export async function printRaw(bytes: Uint8Array): Promise<BridgeResult> {
  try {
    const res = await withTimeout(
      fetch(`${getBridgeUrl()}/print/raw`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: bytes as BodyInit,
      }),
      60000,
    );
    return (await res.json()) as BridgeResult;
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Texto simples → `imprimir-ka7 -t "texto"`. */
export async function printText(text: string): Promise<BridgeResult> {
  try {
    const res = await withTimeout(
      fetch(`${getBridgeUrl()}/print/text`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      }),
      60000,
    );
    return (await res.json()) as BridgeResult;
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Teste de impressão curto (gasta ~3 linhas de papel). */
export function testPrint(): Promise<BridgeResult> {
  return printText("KA7 Print Studio\nTeste OK");
}

/** Dispara o download de um .bin para imprimir manualmente: imprimir-ka7 arquivo.bin */
export function downloadBin(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
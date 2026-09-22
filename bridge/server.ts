/**
 * KA7 Print Studio — bridge local
 *
 * Servidor HTTP mínimo (Node/TypeScript) que recebe bytes do frontend e faz
 * pipe para o utilitário já validado `imprimir-ka7` (no PATH).
 *
 *   POST /print/raw   body: application/octet-stream  → stdin de `imprimir-ka7`
 *   POST /print/text  body: {"text": "..."}           → `imprimir-ka7 -t "..."`
 *   POST /probe       envia só ESC @ (2 bytes) via stdin → testa a conexão sem gastar papel
 *   GET  /health      bridge vivo? comando encontrado no PATH?
 *
 * Só roda em localhost. Um preview hospedado na nuvem NÃO consegue acessar a
 * impressora Bluetooth do seu computador — por isso o frontend entra em modo demo
 * quando este bridge não responde.
 *
 * Não usamos /dev/rfcomm0, CUPS, BLE GATT nem conexão persistente: cada job é uma
 * execução isolada do `imprimir-ka7`, que abre o socket RFCOMM, envia e fecha.
 */
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

const PORT = Number(process.env["KA7_BRIDGE_PORT"] ?? 7777);
const HOST = process.env["KA7_BRIDGE_HOST"] ?? "127.0.0.1";
const COMMAND = process.env["KA7_PRINT_CMD"] ?? "imprimir-ka7";
const VERSION = "0.1.0";
const MAX_BODY = 8 * 1024 * 1024; // 8 MB
const JOB_TIMEOUT_MS = 90_000;

const PROBE_BYTES = Buffer.from([0x1b, 0x40]); // ESC @

function findCommand(cmd: string): string | null {
  if (cmd.includes("/")) {
    try {
      accessSync(cmd, constants.X_OK);
      return cmd;
    } catch {
      return null;
    }
  }
  for (const dir of (process.env["PATH"] ?? "").split(delimiter)) {
    if (!dir) continue;
    const full = join(dir, cmd);
    try {
      accessSync(full, constants.X_OK);
      return full;
    } catch {
      /* next */
    }
  }
  return null;
}

interface RunResult {
  ok: boolean;
  message: string;
  bytes?: number;
  stderr?: string;
  durationMs: number;
}

/** Executa `imprimir-ka7` com args e (opcionalmente) bytes no stdin. */
function runPrinter(args: string[], stdin?: Buffer): Promise<RunResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const bin = findCommand(COMMAND);
    if (!bin) {
      resolve({
        ok: false,
        message: `Comando "${COMMAND}" não encontrado no PATH. Instale em ~/.local/bin/imprimir-ka7.`,
        durationMs: 0,
      });
      return;
    }
    const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    let stdout = "";
    let done = false;
    const finish = (r: RunResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({
        ok: false,
        message: "A impressora não respondeu a tempo. Ela está ligada e pareada?",
        stderr,
        durationMs: Date.now() - started,
      });
    }, JOB_TIMEOUT_MS);

    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) =>
      finish({ ok: false, message: `Falha ao executar: ${err.message}`, durationMs: Date.now() - started }),
    );
    child.on("close", (code) => {
      const durationMs = Date.now() - started;
      if (code === 0) {
        finish({
          ok: true,
          message: stdout.trim() || "Enviado para a KA7.",
          bytes: stdin?.length,
          stderr: stderr.trim() || undefined,
          durationMs,
        });
      } else {
        finish({
          ok: false,
          message: friendlyError(stderr, code),
          stderr: stderr.trim() || undefined,
          durationMs,
        });
      }
    });

    if (stdin) {
      child.stdin.on("error", () => {
        /* EPIPE quando o processo morre cedo: tratado no close */
      });
      child.stdin.end(stdin);
    } else {
      child.stdin.end();
    }
  });
}

function friendlyError(stderr: string, code: number | null): string {
  const s = stderr.toLowerCase();
  if (s.includes("host is down") || s.includes("112")) return "KA7 desligada ou fora de alcance.";
  if (s.includes("connection refused") || s.includes("111")) return "KA7 recusou a conexão RFCOMM (canal 1).";
  if (s.includes("resource busy") || s.includes("busy")) return "KA7 ocupada — outro programa está conectado.";
  if (s.includes("permission")) return "Sem permissão para abrir o socket Bluetooth.";
  if (s.includes("timed out") || s.includes("timeout")) return "Tempo esgotado ao conectar na KA7.";
  return `imprimir-ka7 terminou com código ${code ?? "?"}.`;
}

/* ---------------------------------------------------------------- HTTP --- */

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("Corpo muito grande."));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function cors(res: ServerResponse) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-allow-private-network", "true");
}

let busy = false;
async function exclusive<T>(fn: () => Promise<T>): Promise<T | { ok: false; message: string }> {
  if (busy) return { ok: false, message: "Já existe um job em andamento. Aguarde." };
  busy = true;
  try {
    return await fn();
  } finally {
    busy = false;
  }
}

const server = createServer(async (req, res) => {
  cors(res);
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && (path === "/" || path === "/health")) {
      const found = findCommand(COMMAND);
      json(res, 200, {
        ok: true,
        bridge: true,
        version: VERSION,
        command: COMMAND,
        commandFound: Boolean(found),
        commandPath: found,
      });
      return;
    }

    if (req.method === "POST" && path === "/probe") {
      const r = await exclusive(() => runPrinter([], PROBE_BYTES));
      json(res, 200, r);
      return;
    }

    if (req.method === "POST" && path === "/print/raw") {
      const body = await readBody(req);
      if (body.length === 0) return json(res, 400, { ok: false, message: "Nenhum byte recebido." });
      const r = await exclusive(() => runPrinter([], body));
      json(res, 200, r);
      return;
    }

    if (req.method === "POST" && path === "/print/text") {
      const body = await readBody(req);
      let text = "";
      try {
        text = String((JSON.parse(body.toString("utf8")) as { text?: unknown }).text ?? "");
      } catch {
        return json(res, 400, { ok: false, message: "JSON inválido." });
      }
      if (!text.trim()) return json(res, 400, { ok: false, message: "Texto vazio." });
      const r = await exclusive(() => runPrinter(["-t", text]));
      json(res, 200, r);
      return;
    }

    json(res, 404, { ok: false, message: `Rota não encontrada: ${req.method} ${path}` });
  } catch (err) {
    json(res, 500, { ok: false, message: (err as Error).message });
  }
});

server.listen(PORT, HOST, () => {
  const found = findCommand(COMMAND);
  console.log(`\n  KA7 bridge  →  http://${HOST}:${PORT}`);
  console.log(`  comando     →  ${COMMAND} ${found ? `(${found})` : "(NÃO encontrado no PATH!)"}`);
  console.log(`  rotas       →  GET /health · POST /probe · POST /print/raw · POST /print/text\n`);
});
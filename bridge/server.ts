/**
 * KA7 Print Studio — bridge local
 *
 * O browser nunca fala Bluetooth. Este bridge recebe comandos HTTP locais e
 * delega a comunicação real ao utilitário `imprimir-ka7`, que abre o socket
 * RFCOMM sob demanda, envia os bytes e fecha a conexão.
 */
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

const PORT = Number(process.env["KA7_BRIDGE_PORT"] ?? 7777);
const HOST = process.env["KA7_BRIDGE_HOST"] ?? "127.0.0.1";
const COMMAND = process.env["KA7_PRINT_CMD"] ?? "imprimir-ka7";
const VERSION = "0.2.0";
const MAX_BODY = 8 * 1024 * 1024;
const JOB_TIMEOUT_MS = 90_000;
const MAX_LOGS = 80;

const ESC_INIT = Buffer.from([0x1b, 0x40]);

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
      // next
    }
  }
  return null;
}

interface RunResult {
  ok: boolean;
  message: string;
  bytes?: number;
  stderr?: string;
  stdout?: string;
  durationMs: number;
}

interface BridgeLog extends RunResult {
  id: string;
  at: string;
  action: string;
}

const logs: BridgeLog[] = [];

function pushLog(action: string, result: RunResult) {
  const entry: BridgeLog = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    action,
    ...result,
  };
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;

  const level = result.ok ? "OK" : "ERRO";
  console.log(
    `[${entry.at}] [${level}] ${action} · ${result.durationMs} ms${result.bytes ? ` · ${result.bytes} bytes` : ""} · ${result.message}`,
  );
  if (result.stderr) console.error(`  stderr: ${result.stderr}`);
}

/** Executa imprimir-ka7 e registra stdout/stderr para diagnóstico. */
function runPrinter(action: string, args: string[], stdin?: Buffer): Promise<RunResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const bin = findCommand(COMMAND);

    const finishAndLog = (result: RunResult) => {
      pushLog(action, result);
      resolve(result);
    };

    if (!bin) {
      finishAndLog({
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
      finishAndLog(r);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({
        ok: false,
        message: "A KA7 não respondeu a tempo. Confira energia, alcance e se outro app está segurando o Bluetooth.",
        stderr: stderr.trim() || undefined,
        stdout: stdout.trim() || undefined,
        durationMs: Date.now() - started,
      });
    }, JOB_TIMEOUT_MS);

    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

    child.on("error", (err) =>
      finish({
        ok: false,
        message: `Falha ao executar imprimir-ka7: ${err.message}`,
        stderr: stderr.trim() || undefined,
        stdout: stdout.trim() || undefined,
        durationMs: Date.now() - started,
      }),
    );

    child.on("close", (code) => {
      const durationMs = Date.now() - started;
      const cleanOut = stdout.trim();
      const cleanErr = stderr.trim();

      if (code === 0) {
        finish({
          ok: true,
          message: cleanOut || "Comando enviado para a KA7.",
          bytes: stdin?.length,
          stderr: cleanErr || undefined,
          stdout: cleanOut || undefined,
          durationMs,
        });
      } else {
        finish({
          ok: false,
          message: friendlyError(cleanErr, code),
          stderr: cleanErr || undefined,
          stdout: cleanOut || undefined,
          durationMs,
        });
      }
    });

    child.stdin.on("error", () => {
      // EPIPE é refletido no close do processo.
    });
    child.stdin.end(stdin);
  });
}

function friendlyError(stderr: string, code: number | null): string {
  const s = stderr.toLowerCase();
  if (s.includes("host is down") || s.includes("112")) return "KA7 desligada ou fora de alcance.";
  if (s.includes("connection refused") || s.includes("111")) return "KA7 recusou a conexão RFCOMM (canal 1).";
  if (s.includes("resource busy") || s.includes("busy")) return "KA7 ocupada — outro programa está usando a conexão.";
  if (s.includes("permission")) return "Sem permissão para abrir o socket Bluetooth.";
  if (s.includes("timed out") || s.includes("timeout")) return "Tempo esgotado ao conectar na KA7.";
  if (s) return `imprimir-ka7 falhou: ${stderr}`;
  return `imprimir-ka7 terminou com código ${code ?? "?"} sem mensagem de erro.`;
}

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
  res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-allow-private-network", "true");
}

let busy = false;

async function exclusive<T>(fn: () => Promise<T>): Promise<T | { ok: false; message: string; durationMs: number }> {
  if (busy) return { ok: false, message: "Já existe um comando sendo enviado para a KA7. Aguarde.", durationMs: 0 };
  busy = true;
  try {
    return await fn();
  } finally {
    busy = false;
  }
}

function parseJson(body: Buffer): Record<string, unknown> | null {
  try {
    return JSON.parse(body.toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
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
        busy,
      });
      return;
    }

    if (req.method === "GET" && path === "/logs") {
      json(res, 200, { ok: true, busy, logs });
      return;
    }

    if (req.method === "DELETE" && path === "/logs") {
      logs.length = 0;
      json(res, 200, { ok: true, message: "Logs limpos." });
      return;
    }

    if (req.method === "POST" && path === "/probe") {
      const r = await exclusive(() => runPrinter("testar conexão", [], ESC_INIT));
      json(res, 200, r);
      return;
    }

    if (req.method === "POST" && path === "/reset") {
      const r = await exclusive(() => runPrinter("reset ESC/POS", [], ESC_INIT));
      json(res, 200, r);
      return;
    }

    if (req.method === "POST" && path === "/feed") {
      const body = await readBody(req);
      const data = parseJson(body);
      if (!data) return json(res, 400, { ok: false, message: "JSON inválido." });

      const raw = Number(data["lines"] ?? 1);
      if (!Number.isInteger(raw) || raw < 1 || raw > 20) {
        return json(res, 400, { ok: false, message: "Feed deve estar entre 1 e 20 linhas." });
      }

      // ESC d n = imprime/alimenta n linhas.
      const bytes = Buffer.from([0x1b, 0x64, raw]);
      const r = await exclusive(() => runPrinter(`feed ${raw} linha(s)`, [], bytes));
      json(res, 200, r);
      return;
    }

    if (req.method === "POST" && path === "/print/raw") {
      const body = await readBody(req);
      if (body.length === 0) return json(res, 400, { ok: false, message: "Nenhum byte recebido." });
      const r = await exclusive(() => runPrinter("imprimir imagem", [], body));
      json(res, 200, r);
      return;
    }

    if (req.method === "POST" && path === "/print/text") {
      const body = await readBody(req);
      const data = parseJson(body);
      if (!data) return json(res, 400, { ok: false, message: "JSON inválido." });

      const text = String(data["text"] ?? "");
      if (!text.trim()) return json(res, 400, { ok: false, message: "Texto vazio." });

      const r = await exclusive(() => runPrinter("imprimir texto", ["-t", text]));
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
  console.log(`  versão      →  ${VERSION}`);
  console.log(`  comando     →  ${COMMAND} ${found ? `(${found})` : "(NÃO encontrado no PATH!)"}`);
  console.log("  controles   →  /probe · /reset · /feed · /print/text · /print/raw · /logs\n");
});

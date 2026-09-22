import type { ProcessSettings } from "./bitmap";

const KEY = "ka7-print-history-v1";
const MAX_ITEMS = 20;

export type HistoryItem =
  | {
      id: string;
      kind: "image";
      name: string;
      date: string;
      settings: ProcessSettings;
      thumbnail: string;
      /** ESC/POS já gerado, em base64 — permite "Imprimir novamente" sem a imagem original. */
      escposBase64: string;
      heightDots: number;
    }
  | {
      id: string;
      kind: "text";
      name: string;
      date: string;
      text: string;
    };

export function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(items: HistoryItem[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // quota cheia: descarta os mais antigos
    try {
      window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, 5)));
    } catch {
      /* ignore */
    }
  }
}

export function addHistoryItem(item: HistoryItem): HistoryItem[] {
  const next = [item, ...loadHistory()].slice(0, MAX_ITEMS);
  saveHistory(next);
  return next;
}

export function removeHistoryItem(id: string): HistoryItem[] {
  const next = loadHistory().filter((i) => i.id !== id);
  saveHistory(next);
  return next;
}

export function clearHistory(): void {
  saveHistory([]);
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
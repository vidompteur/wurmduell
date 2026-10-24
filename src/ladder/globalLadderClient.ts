import { CONFIG } from "../config";
import { type GlobalLadderFile, newestLadder, parseGlobalLadder } from "./globalLadder";

async function fetchLadder(url: string | URL, timeoutMs: number): Promise<GlobalLadderFile> {
  const res = await fetch(url, { cache: "no-cache", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`ladder.json: HTTP ${res.status}`);
  return parseGlobalLadder(await res.json());
}

/**
 * Lädt die globale Rangliste: die aktuelle Datei aus dem Repository und die mitgelieferte `ladder.json`
 * neben der Seite; es gilt der jüngere Stand. Ist eine Quelle nicht erreichbar, genügt die andere.
 */
export async function loadGlobalLadder(): Promise<GlobalLadderFile> {
  const sources = [fetchLadder(new URL("ladder.json", document.baseURI), 8000)];
  if (CONFIG.ladder.url) sources.push(fetchLadder(CONFIG.ladder.url, 5000));
  const results = await Promise.allSettled(sources);
  const files = results.map((r) => (r.status === "fulfilled" ? r.value : null));
  const best = newestLadder(...files);
  if (!best) throw new Error("Globale Rangliste nicht erreichbar");
  return best;
}

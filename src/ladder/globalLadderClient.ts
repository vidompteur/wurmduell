import { CONFIG } from "../config";
import { reportError } from "../telemetry";
import { type GlobalLadderFile, newestLadder, parseGlobalLadder } from "./globalLadder";

/**
 * Holt eine Rangliste per einfachem GET (keine eigenen Header und kein `cache`-Modus: Safari löst bei `no-cache`
 * sonst eine CORS-Vorabfrage aus, die raw.githubusercontent.com ablehnt). Frische bekommt die Adresse über einen
 * 5-Minuten-Zeitstempel, passend zur Cache-Dauer von GitHub.
 */
async function fetchLadder(url: string | URL, timeoutMs: number): Promise<GlobalLadderFile> {
  const target = new URL(url, document.baseURI);
  target.searchParams.set("t", String(Math.floor(Date.now() / 300_000)));
  const res = await fetch(target, { signal: AbortSignal.timeout(timeoutMs) });
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
  const names = ["Seite", "Repository"];
  const files = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    // Nicht still schlucken: sonst bleibt unbemerkt, dass nur der (evtl. alte) Stand der Seite angezeigt wird.
    console.warn(`Globale Rangliste: Quelle „${names[i]}“ nicht erreichbar`, r.reason);
    reportError(r.reason, "ladder.fetch", { source: names[i] });
    return null;
  });
  const best = newestLadder(...files);
  if (!best) throw new Error("Globale Rangliste nicht erreichbar");
  return best;
}

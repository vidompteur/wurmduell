/**
 * Baut `public/ladder.json` aus den öffentlichen Ladder-Summaries aller Spieler: automatisch gefundene Konten
 * (Relay-Abfrage nach der Collection) plus die Einträge in `public/players.json`; `blocked` dort sperrt Konten.
 * Aufruf: `npm run ladder:build`. Läuft unter Node (tsx) und braucht Netzwerk.
 * Die Datei wird nur neu geschrieben, wenn sich Einträge geändert haben (kein Commit-Rauschen).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type FetchLike, buildGlobalEntries, discoverPlayers, parseGlobalLadder } from "../src/ladder/globalLadder";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const playersPath = join(root, "public", "players.json");
const ladderPath = join(root, "public", "ladder.json");

const fetchFn: FetchLike = (url) => fetch(url, { signal: AbortSignal.timeout(15_000), headers: { accept: "application/json" } });

function readJson(path: string): unknown {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  } catch {
    return null;
  }
}

const rawPlayers = readJson(playersPath) as { players?: unknown; blocked?: unknown } | null;
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((p): p is string => typeof p === "string") : []);
const listed = strings(rawPlayers?.players);
const blocked = strings(rawPlayers?.blocked);
const found = await discoverPlayers(fetchFn);
console.log(`Automatisch gefunden: ${found.dids.length} Konto/Konten${found.error ? ` (Relay-Fehler: ${found.error}, nur players.json wird genutzt)` : ""}`);
const players = [...new Set([...listed, ...found.dids])];
const previous = parseGlobalLadder(readJson(ladderPath));

const { entries, report } = await buildGlobalEntries({ players, blocked, previous, fetchFn });
for (const line of report) console.log(`${line.status.padEnd(11)} ${line.input}${line.did ? ` (${line.did})` : ""} – ${line.message}`);

const failed = report.filter((l) => l.status === "error").length;
// Nur hart scheitern, wenn gar nichts geladen werden konnte, obwohl Spieler eingetragen sind – und dann nichts überschreiben.
if (players.length > 0 && failed === players.length) {
  console.error("Alle Spieler fehlgeschlagen (Netzwerk?). ladder.json bleibt unverändert.");
  process.exit(1);
}
const unchanged = JSON.stringify(entries) === JSON.stringify(previous.entries);
if (unchanged && existsSync(ladderPath)) {
  console.log("Keine Änderungen, ladder.json bleibt unverändert.");
} else {
  const file = { version: 1, updatedAt: new Date().toISOString(), entries };
  writeFileSync(ladderPath, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`ladder.json geschrieben: ${entries.length} Spieler.`);
}

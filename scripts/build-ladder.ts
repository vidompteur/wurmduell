/**
 * Baut `public/ladder.json` aus den öffentlichen Ladder-Summaries der Spieler in `public/players.json`.
 * Aufruf: `npm run ladder:build`. Läuft unter Node (tsx) und braucht Netzwerk.
 * Die Datei wird nur neu geschrieben, wenn sich Einträge geändert haben (kein Commit-Rauschen).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type FetchLike, buildGlobalEntries, parseGlobalLadder } from "../src/ladder/globalLadder";

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

const rawPlayers = readJson(playersPath) as { players?: unknown } | null;
const players = Array.isArray(rawPlayers?.players) ? rawPlayers.players.filter((p): p is string => typeof p === "string") : [];
const previous = parseGlobalLadder(readJson(ladderPath));

const { entries, report } = await buildGlobalEntries({ players, previous, fetchFn });
for (const line of report) console.log(`${line.status.padEnd(11)} ${line.input}${line.did ? ` (${line.did})` : ""} – ${line.message}`);

const failed = report.filter((l) => l.status === "error").length;
const unchanged = JSON.stringify(entries) === JSON.stringify(previous.entries);
if (unchanged && existsSync(ladderPath)) {
  console.log("Keine Änderungen, ladder.json bleibt unverändert.");
} else {
  const file = { version: 1, updatedAt: new Date().toISOString(), entries };
  writeFileSync(ladderPath, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`ladder.json geschrieben: ${entries.length} Spieler.`);
}
// Nur hart scheitern, wenn gar nichts geladen werden konnte, obwohl Spieler eingetragen sind.
if (players.length > 0 && failed === players.length) {
  console.error("Alle Spieler fehlgeschlagen (Netzwerk?).");
  process.exit(1);
}

import { entryFromSummary } from "../atproto/records";
import type { LadderEntry } from "../types";
import { sortEntries } from "./LadderStore";

/**
 * Globale Ladder: eine statische Datei (`ladder.json`), die ein Skript regelmäßig aus den
 * öffentlichen `de.wurmduell.ladderSummary`-Records der teilnehmenden Spieler erzeugt.
 * Dieses Modul ist frei von DOM- und Node-Abhängigkeiten und wird von Skript und UI genutzt.
 */

export interface GlobalLadderEntry extends LadderEntry {
  /** Handle zum Zeitpunkt des letzten Laufs (nur Anzeige, die DID ist die ID). */
  handle: string | null;
}

export interface GlobalLadderFile {
  version: 1;
  /** Zeitpunkt der letzten inhaltlichen Änderung; `null`, solange nie gebaut wurde. */
  updatedAt: string | null;
  entries: GlobalLadderEntry[];
}

export const EMPTY_GLOBAL_LADDER: GlobalLadderFile = { version: 1, updatedAt: null, entries: [] };

const SUMMARY_COLLECTION = "de.wurmduell.ladderSummary";

/** Liest `ladder.json` defensiv ein (die Datei kommt aus dem Netz). */
export function parseGlobalLadder(raw: unknown): GlobalLadderFile {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY_GLOBAL_LADDER };
  const r = raw as Record<string, unknown>;
  if (r.version !== 1 || !Array.isArray(r.entries)) return { ...EMPTY_GLOBAL_LADDER };
  const entries: GlobalLadderEntry[] = [];
  for (const item of r.entries) {
    if (typeof item !== "object" || item === null) continue;
    const e = item as Record<string, unknown>;
    if (typeof e.playerId !== "string") continue;
    const handle = typeof e.handle === "string" ? e.handle : null;
    const base = entryFromSummary(e, e.playerId, typeof e.name === "string" ? e.name : (handle ?? e.playerId));
    if (base) entries.push({ ...base, handle });
  }
  const updatedAt = typeof r.updatedAt === "string" && !Number.isNaN(Date.parse(r.updatedAt)) ? r.updatedAt : null;
  return { version: 1, updatedAt, entries: sortEntries(entries) as GlobalLadderEntry[] };
}

/** Grobe Plausibilitätsprüfung; Records stammen von den Spielern selbst und können gefälscht sein. */
export function isPlausible(e: LadderEntry): boolean {
  return (
    e.wins + e.losses <= e.matches &&
    e.shotsHit <= e.shotsFired &&
    e.bestWinStreak <= e.wins &&
    e.currentWinStreak <= e.bestWinStreak
  );
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (url: string) => Promise<FetchResponse>;

export type ReportStatus = "ok" | "stale" | "no-record" | "implausible" | "error";
export interface ReportLine {
  input: string;
  did?: string;
  status: ReportStatus;
  message: string;
}

export interface BuildOptions {
  /** Handles oder DIDs aus `players.json`. */
  players: readonly string[];
  /** Gesperrte Handles oder DIDs (werden nie aufgenommen). */
  blocked?: readonly string[];
  /** Vorheriger Stand: dient als Rückfall, wenn ein PDS gerade nicht antwortet. */
  previous: GlobalLadderFile;
  fetchFn: FetchLike;
}

const HANDLE_API = "https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle";

interface DidDoc {
  alsoKnownAs?: unknown;
  service?: unknown;
}

async function getJson(fetchFn: FetchLike, url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetchFn(url);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* kein JSON-Body */
  }
  return { status: res.ok ? 200 : res.status, body };
}

async function resolveDid(fetchFn: FetchLike, input: string): Promise<string> {
  if (input.startsWith("did:")) return input;
  const { status, body } = await getJson(fetchFn, `${HANDLE_API}?handle=${encodeURIComponent(input)}`);
  const did = (body as { did?: unknown } | null)?.did;
  if (status !== 200 || typeof did !== "string" || !did.startsWith("did:")) throw new Error(`Handle „${input}“ nicht auflösbar`);
  return did;
}

async function loadDidDoc(fetchFn: FetchLike, did: string): Promise<{ pds: string; handle: string | null }> {
  let url: string;
  if (did.startsWith("did:plc:")) url = `https://plc.directory/${did}`;
  else if (did.startsWith("did:web:")) url = `https://${decodeURIComponent(did.slice("did:web:".length).split(":")[0] ?? "")}/.well-known/did.json`;
  else throw new Error(`Nicht unterstützte DID-Methode: ${did}`);
  const { status, body } = await getJson(fetchFn, url);
  if (status !== 200 || typeof body !== "object" || body === null) throw new Error("DID-Dokument nicht abrufbar");
  const doc = body as DidDoc;
  const services = Array.isArray(doc.service) ? (doc.service as { id?: unknown; type?: unknown; serviceEndpoint?: unknown }[]) : [];
  const svc = services.find((s) => s.type === "AtprotoPersonalDataServer" || s.id === "#atproto_pds");
  const pds = typeof svc?.serviceEndpoint === "string" ? svc.serviceEndpoint.replace(/\/+$/, "") : "";
  if (!/^https:\/\//.test(pds)) throw new Error("Kein gültiger PDS im DID-Dokument");
  const aka = Array.isArray(doc.alsoKnownAs) ? (doc.alsoKnownAs as unknown[]).find((a) => typeof a === "string" && a.startsWith("at://")) : undefined;
  return { pds, handle: typeof aka === "string" ? aka.slice("at://".length) : null };
}

const RELAY_LIST = "https://relay1.us-east.bsky.network/xrpc/com.atproto.sync.listReposByCollection";
const MAX_DISCOVERY_PAGES = 10;

/**
 * Findet alle Konten, die mindestens eine Ranglisten-Zusammenfassung veröffentlicht haben
 * (Relay-Abfrage nach Collection). Wirft nie: bei Fehlern kommt, was bis dahin gefunden wurde.
 */
export async function discoverPlayers(fetchFn: FetchLike): Promise<{ dids: string[]; error: string | null }> {
  const dids: string[] = [];
  let cursor: string | undefined;
  try {
    for (let page = 0; page < MAX_DISCOVERY_PAGES; page++) {
      const url = `${RELAY_LIST}?collection=${SUMMARY_COLLECTION}&limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const { status, body } = await getJson(fetchFn, url);
      const repos = (body as { repos?: unknown } | null)?.repos;
      if (status !== 200 || !Array.isArray(repos)) return { dids, error: `Relay antwortete mit Status ${status}` };
      for (const r of repos as { did?: unknown }[]) if (typeof r.did === "string" && r.did.startsWith("did:")) dids.push(r.did);
      const next = (body as { cursor?: unknown }).cursor;
      if (typeof next !== "string" || next === "" || repos.length === 0) break;
      cursor = next;
    }
    return { dids, error: null };
  } catch (error) {
    return { dids, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Holt für alle Spieler die Ladder-Summary und baut die sortierte Eintragsliste. Wirft nie pro Spieler. */
export async function buildGlobalEntries(opts: BuildOptions): Promise<{ entries: GlobalLadderEntry[]; report: ReportLine[] }> {
  const { fetchFn, previous } = opts;
  const entries = new Map<string, GlobalLadderEntry>();
  const report: ReportLine[] = [];
  const blocked = new Set((opts.blocked ?? []).map((p) => p.trim().replace(/^@/, "").toLowerCase()));

  for (const input of new Set(opts.players.map((p) => p.trim().replace(/^@/, "")).filter(Boolean))) {
    let did: string | undefined;
    try {
      did = await resolveDid(fetchFn, input);
      if (blocked.has(input.toLowerCase()) || blocked.has(did.toLowerCase())) {
        report.push({ input, did, status: "error", message: "gesperrt (blocked in players.json)" });
        continue;
      }
      if (entries.has(did)) {
        report.push({ input, did, status: "ok", message: "doppelt, übersprungen" });
        continue;
      }
      const { pds, handle } = await loadDidDoc(fetchFn, did);
      const url = `${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${SUMMARY_COLLECTION}&rkey=self`;
      const { status, body } = await getJson(fetchFn, url);
      if (status !== 200) {
        const code = (body as { error?: unknown } | null)?.error;
        if (code === "RecordNotFound") {
          report.push({ input, did, status: "no-record", message: "noch keine Ranglisten-Zusammenfassung im PDS (nie angemeldet gespielt?)" });
          continue;
        }
        throw new Error(`PDS antwortete mit ${status}`);
      }
      const value = (body as { value?: unknown } | null)?.value;
      const shown = handle ?? (input.startsWith("did:") ? null : input);
      const entry = entryFromSummary(value, did, shown ?? did);
      if (!entry) throw new Error("Summary-Record ungültig");
      if (!isPlausible(entry)) {
        report.push({ input, did, status: "implausible", message: "Werte unplausibel, Eintrag ausgelassen" });
        continue;
      }
      entries.set(did, { ...entry, handle: shown });
      report.push({ input, did, status: "ok", message: `${entry.matches} Matches, ${entry.wins} Siege` });
    } catch (error) {
      // Auch wenn der Handle gar nicht aufgelöst werden konnte (z. B. Netzwerkausfall), bleibt der alte Eintrag erhalten.
      const key = input.toLowerCase();
      const old = previous.entries.find(
        (e) => (did !== undefined && e.playerId === did) || e.playerId.toLowerCase() === key || e.name.toLowerCase() === key || e.handle?.toLowerCase() === key,
      );
      if (old) {
        entries.set(old.playerId, old);
        report.push({ input, did: did ?? old.playerId, status: "stale", message: `${(error as Error).message}; alter Stand bleibt` });
      } else {
        report.push({ input, did, status: "error", message: (error as Error).message });
      }
    }
  }
  return { entries: sortEntries([...entries.values()]) as GlobalLadderEntry[], report };
}

/** Wählt den jüngeren Stand (nach `updatedAt`); bei Gleichstand den ersten. `null` zählt als nicht vorhanden. */
export function newestLadder(...files: (GlobalLadderFile | null)[]): GlobalLadderFile | null {
  const time = (f: GlobalLadderFile): number => (f.updatedAt ? Date.parse(f.updatedAt) || 0 : 0);
  let best: GlobalLadderFile | null = null;
  for (const f of files) if (f && (!best || time(f) > time(best))) best = f;
  return best;
}

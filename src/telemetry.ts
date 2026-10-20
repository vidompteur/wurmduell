/**
 * Optionales Logging über Better Stack Logs (HTTP-Ingest, kein SDK): unerwartete Fehler, Logins (mit Nutzerdaten)
 * und Match-Ergebnisse als einzelne Logzeilen. Ohne `CONFIG.logs.host` und `CONFIG.logs.token` passiert nichts.
 * Alle Aufrufe sind fehlertolerant: Logging darf das Spiel nie stören.
 */
import { CONFIG } from "./config";
import type { MatchConfig, MatchResult } from "./types";

type Level = "info" | "warn" | "error";

const MAX_EVENTS_PER_PAGE = 100;
const sessionId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2);
let sent = 0;
let user: { did: string; handle: string | null } | null = null;
let started = false;
let geo: Geo | null = null;

export interface Geo {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  org?: string;
  latitude?: number;
  longitude?: number;
}

/** Vereinheitlicht die Antworten gängiger IP-Dienste (ipwho.is, ipapi.co, ipinfo-ähnlich). */
export function parseGeo(body: unknown): Geo | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.success === false || b.error) return null;
  const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
  const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const conn = typeof b.connection === "object" && b.connection !== null ? (b.connection as Record<string, unknown>) : {};
  const out: Geo = {
    ip: str(b.ip),
    city: str(b.city),
    region: str(b.region) ?? str(b.region_name),
    country: str(b.country) ?? str(b.country_name),
    countryCode: str(b.country_code),
    org: str(conn.isp) ?? str(conn.org) ?? str(b.org),
    latitude: num(b.latitude),
    longitude: num(b.longitude),
  };
  return out.ip || out.city || out.country ? out : null;
}

async function lookupGeo(): Promise<Geo | null> {
  if (!CONFIG.logs.geoLookupUrl) return null;
  try {
    const res = await fetch(CONFIG.logs.geoLookupUrl, { signal: AbortSignal.timeout(3000), headers: { accept: "application/json" } });
    return res.ok ? parseGeo(await res.json()) : null;
  } catch {
    return null;
  }
}

/** „1.2.3.4, Berlin, DE“ für die Nachrichtenzeile. */
export function geoText(g: Geo | null): string {
  if (!g) return "";
  return [g.ip, g.city, g.countryCode ?? g.country].filter(Boolean).join(", ");
}

export function telemetryEnabled(): boolean {
  return CONFIG.logs.host !== "" && CONFIG.logs.token !== "";
}

/** Baut eine Logzeile (reines JSON-Objekt). */
export function buildEvent(level: Level, message: string, fields: Record<string, unknown> = {}, now = new Date()): Record<string, unknown> {
  return { dt: now.toISOString(), level, message, session: sessionId, ...(user ? { user } : {}), ...(geo ? { geo } : {}), ...fields };
}

function ship(event: Record<string, unknown>): void {
  // Nur im Browser senden (Tests und Skripte unter Node loggen nichts).
  if (typeof window === "undefined" || !telemetryEnabled() || sent >= MAX_EVENTS_PER_PAGE) return;
  sent++;
  try {
    const host = CONFIG.logs.host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    void fetch(`https://${host}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${CONFIG.logs.token}` },
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* Logging darf nie stören */
  }
}

function log(level: Level, message: string, fields?: Record<string, unknown>): void {
  ship(buildEvent(level, message, fields));
}

const errorText = (e: unknown): { error: string; stack?: string } => (e instanceof Error ? { error: e.message, stack: e.stack } : { error: String(e) });

/** Kurzform des Browsers, z. B. „Firefox 158 / macOS“. */
export function shortAgent(ua: string | undefined): string {
  if (!ua) return "unbekannter Browser";
  const pick = (re: RegExp): string | null => ua.match(re)?.[1]?.split(".")[0] ?? null;
  const browser =
    (pick(/Edg\/([\d.]+)/) && `Edge ${pick(/Edg\/([\d.]+)/)}`) ||
    (pick(/OPR\/([\d.]+)/) && `Opera ${pick(/OPR\/([\d.]+)/)}`) ||
    (pick(/Firefox\/([\d.]+)/) && `Firefox ${pick(/Firefox\/([\d.]+)/)}`) ||
    (pick(/Chrome\/([\d.]+)/) && `Chrome ${pick(/Chrome\/([\d.]+)/)}`) ||
    (pick(/Version\/([\d.]+).*Safari/) && `Safari ${pick(/Version\/([\d.]+).*Safari/)}`) ||
    "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "?";
  return `${browser} / ${os}`;
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Startet das Logging beim App-Start (globale Fehlerhandler). */
export function initTelemetry(): void {
  if (started || !telemetryEnabled() || typeof window === "undefined") return;
  started = true;
  window.addEventListener("error", (ev) => {
    // Fehler aus Browser-Erweiterungen und fremden Skripten ignorieren.
    if (ev.filename && !ev.filename.startsWith(location.origin)) return;
    const e = errorText(ev.error ?? ev.message);
    log("error", `Fehler: window.onerror – ${e.error}${ev.lineno ? ` (Zeile ${ev.lineno})` : ""}`, { event: "error", where: "window.onerror", ...e, file: ev.filename, line: ev.lineno, col: ev.colno });
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const e = errorText(ev.reason);
    log("error", `Fehler: unhandledrejection – ${e.error}`, { event: "error", where: "unhandledrejection", ...e });
  });
  const c = clientInfo();
  // Erst IP/Ort ermitteln (höchstens 3 Sekunden), damit schon die erste Zeile sie enthält.
  void lookupGeo().then((g) => {
    geo = g;
    log("info", `Seite geladen – ${shortAgent(c.userAgent as string)}, ${c.screen}, ${c.language}, ${c.timeZone}${g ? ` – ${geoText(g)}` : ""}`, { event: "pageview", client: c });
  });
}

/** Meldet einen Fehler, den wir selbst abfangen (Login, Sync, …). */
export function reportError(error: unknown, where: string, extra: Record<string, unknown> = {}): void {
  const e = errorText(error);
  log("error", `Fehler: ${where} – ${e.error}`, { event: "error", where, ...e, ...extra });
}

/** Browser- und Geräteangaben (alles, was der Browser ohne Nachfrage hergibt). */
export function clientInfo(): Record<string, unknown> {
  const nav = (typeof navigator === "undefined" ? {} : navigator) as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean } };
  const info: Record<string, unknown> = {
    userAgent: nav.userAgent,
    platform: nav.platform,
    language: nav.language,
    languages: nav.languages,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    maxTouchPoints: nav.maxTouchPoints,
    online: nav.onLine,
    connection: nav.connection && { type: nav.connection.effectiveType, downlink: nav.connection.downlink, rtt: nav.connection.rtt, saveData: nav.connection.saveData },
  };
  try {
    info.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    info.timeZoneOffsetMinutes = new Date().getTimezoneOffset();
  } catch {
    /* ignorieren */
  }
  if (typeof window !== "undefined") {
    info.screen = `${window.screen?.width}x${window.screen?.height}`;
    info.viewport = `${window.innerWidth}x${window.innerHeight}`;
    info.devicePixelRatio = window.devicePixelRatio;
    info.url = location.href.split("?")[0];
    info.referrer = document.referrer || undefined;
  }
  return info;
}

/** Login mit Nutzerdaten (DID, Handle, PDS, Token-Metadaten, DID-Dokument, Browser-/Gerätedaten). Der Nutzer hängt danach an allen weiteren Zeilen. */
export function logLogin(did: string, handle: string | null, details: Record<string, unknown> = {}): void {
  user = { did, handle };
  const c = clientInfo();
  const pds = (details.token as { pds?: string } | undefined)?.pds;
  const host = pds ? new URL(pds).host : null;
  log("info", `Login: ${handle ?? did}${host ? ` – PDS ${host}` : ""} – ${shortAgent(c.userAgent as string)}, ${c.timeZone}${geo ? ` – ${geoText(geo)}` : ""}`, { event: "login", handle, did, ...details, client: c });
}

export function logLogout(): void {
  log("info", `Logout: ${user?.handle ?? user?.did ?? "unbekannt"}`, { event: "logout" });
  user = null;
}

/** Zusammenfassung eines Match-Ergebnisses. */
export function matchSummary(result: MatchResult): Record<string, unknown> {
  return {
    mode: result.config.mode,
    wormsPerTeam: result.config.wormsPerTeam,
    pure: result.config.pure,
    teleports: result.config.teleports,
    winner: result.winner === null ? null : result.teams[result.winner]?.name,
    reason: result.reason,
    durationSeconds: Math.round(result.durationSeconds),
    mapSeed: result.mapSeed,
    teams: result.teams.map((t) => ({
      name: t.name,
      controller: t.controller.kind === "human" ? { kind: "human", playerId: t.controller.playerId } : { kind: "ai", level: t.controller.level },
      wormsAlive: t.wormsAlive,
      ...t.stats,
    })),
  };
}

/** Start einer Partie (auch Revanche). */
export function logMatchStart(config: MatchConfig): void {
  const [a, b] = config.teams;
  const ctrl = (t: typeof a): string => (t.controller.kind === "ai" ? `KI ${t.controller.level}` : "Mensch");
  const extras = [config.mode === "vsAi" ? "gegen KI" : "Hotseat", `${config.wormsPerTeam} Würmer`, config.pure ? "Original-Modus" : "", `Teleports ${config.teleports}`].filter(Boolean).join(", ");
  log("info", `Spielstart: ${a.name} vs ${b.name} (${extras})`, {
    event: "matchStart",
    mode: config.mode,
    wormsPerTeam: config.wormsPerTeam,
    pure: config.pure,
    teleports: config.teleports,
    teams: [a, b].map((t) => ({ name: t.name, controller: ctrl(t), ...(t.controller.kind === "human" ? { playerId: t.controller.playerId } : {}) })),
  });
}

export function logMatch(result: MatchResult): void {
  const s = matchSummary(result);
  const [a, b] = result.teams;
  const shots = (t: typeof a): string => `${t?.stats.shotsHit}/${t?.stats.shotsFired}`;
  const extras = [result.config.mode === "vsAi" ? "gegen KI" : "Hotseat", `${result.config.wormsPerTeam} Würmer`, result.config.pure ? "Original-Modus" : "", result.reason === "surrender" ? "Aufgabe" : ""].filter(Boolean).join(", ");
  log(
    "info",
    `Match: ${a?.name} vs ${b?.name} – Sieger: ${s.winner ?? "keiner"} – ${clock(result.durationSeconds)} min, Treffer ${shots(a)} : ${shots(b)}, Schaden ${a?.stats.damageDealt} : ${b?.stats.damageDealt} (${extras})`,
    { event: "match", ...s },
  );
}

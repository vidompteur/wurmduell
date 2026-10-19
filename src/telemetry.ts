/**
 * Optionales Logging über Sentry: unerwartete Fehler, Logins (mit Nutzerdaten) und Match-Ergebnisse.
 * Ohne `CONFIG.sentry.dsn` passiert nichts. Das Sentry-SDK wird erst bei Bedarf geladen, und
 * alle Aufrufe sind fehlertolerant: Logging darf das Spiel nie stören.
 */
import { CONFIG } from "./config";
import type { MatchResult } from "./types";

/** Teilmenge der Sentry-API, die wir brauchen. */
interface SentryLike {
  init(options: Record<string, unknown>): void;
  captureException(error: unknown, hint?: Record<string, unknown>): string;
  captureMessage(message: string, hint?: Record<string, unknown>): string;
  setUser(user: { id: string; username?: string } | null): void;
}

let sentry: Promise<SentryLike | null> | null = null;

export function telemetryEnabled(): boolean {
  return CONFIG.sentry.dsn !== "";
}

function load(): Promise<SentryLike | null> {
  if (!telemetryEnabled()) return Promise.resolve(null);
  sentry ??= import("@sentry/browser")
    .then((mod) => {
      const s = mod as unknown as SentryLike;
      s.init({
        dsn: CONFIG.sentry.dsn,
        environment: location.hostname === "localhost" ? "development" : "production",
        // Nur Fehler und unsere eigenen Meldungen, keine Performance-Daten, keine automatischen IP-/Header-Daten.
        sendDefaultPii: false,
        tracesSampleRate: 0,
      });
      return s;
    })
    .catch(() => null);
  return sentry;
}

function run(fn: (s: SentryLike) => void): void {
  void load().then((s) => {
    if (!s) return;
    try {
      fn(s);
    } catch {
      /* Logging darf nie stören */
    }
  });
}

/** Startet Sentry (globale Fehlerhandler) beim App-Start. */
export function initTelemetry(): void {
  run(() => undefined);
}

/** Meldet einen Fehler, den wir selbst abfangen (Login, Sync, …). */
export function reportError(error: unknown, where: string, extra: Record<string, unknown> = {}): void {
  run((s) => s.captureException(error, { tags: { where }, extra }));
}

/** Login (mit Nutzerdaten: DID und Handle) – setzt zugleich den Nutzer für alle weiteren Meldungen. */
export function logLogin(did: string, handle: string | null): void {
  run((s) => {
    s.setUser({ id: did, ...(handle ? { username: handle } : {}) });
    s.captureMessage("Login", { level: "info", tags: { event: "login" }, extra: { did, handle } });
  });
}

export function logLogout(): void {
  run((s) => s.setUser(null));
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

export function logMatch(result: MatchResult): void {
  run((s) => s.captureMessage("Match beendet", { level: "info", tags: { event: "match", mode: result.config.mode }, extra: matchSummary(result) }));
}

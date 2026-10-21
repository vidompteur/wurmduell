import type { LadderStore } from "../ladder/LadderStore";
import type { MatchResult } from "../types";
import { type AtSession, createPdsClient, describeAccount, lastHandle, loginAvailable, restoreSession, signIn, takeLoginRequest } from "./auth";
import { AuthError, classifyAuthError, withTimeout } from "./authFlow";
import { matchRecordsForAccount } from "./records";
import { SyncQueue, syncAccount } from "./sync";
import { t } from "../i18n";
import { identify, logLogin, logLogout, reportError } from "../telemetry";

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type SyncStatus = "idle" | "syncing" | "ok" | "error";

/** Warum gerade niemand angemeldet ist, obwohl man es erwarten würde. */
export type AccountIssue = "offline" | "expired" | "failed";

const SYNC_TIMEOUT_MS = 20_000;
/** Wartezeiten (ms) für automatische Wiederholungen, solange das Netz fehlt. */
const OFFLINE_RETRY_MS = [5_000, 15_000, 45_000];

export interface AccountView {
  /** Angemeldetes Konto (DID) oder `null` im Offline-Modus. */
  did: string | null;
  handle: string | null;
  status: SyncStatus;
  /** Letzte Fehlermeldung (Login oder Sync). */
  error: string | null;
  /** Login ist hier überhaupt möglich (veröffentlichte https-Seite). */
  available: boolean;
  /** Offline (wird wiederholt), Anmeldung abgelaufen oder anderer Fehler; `null` = alles in Ordnung bzw. nie angemeldet. */
  issue: AccountIssue | null;
  /** Der Login wird gerade automatisch neu gestartet. */
  retrying: boolean;
  /** Zuletzt benutzter Handle (zum Vorausfüllen und für „Neu anmelden“). */
  lastHandle: string | null;
}

/**
 * Optionales ATProto-Konto. Ohne Anmeldung bleibt alles lokal; mit Anmeldung wird die Ladder
 * zusätzlich im PDS gespeichert. Alle Fehler führen nur zu einem Statuswechsel, nie zu einem Absturz.
 */
export class Account {
  private session: AtSession | null = null;
  private handle: string | null = null;
  private status: SyncStatus = "idle";
  private error: string | null = null;
  private busy: Promise<void> | null = null;
  private restoring: Promise<void> | null = null;
  private issue: AccountIssue | null = null;
  private retrying = false;
  private offlineAttempt = 0;
  private offlineTimer = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly store: LadderStore,
    private readonly queue: SyncQueue = new SyncQueue(),
  ) {
    // Kommt das Netz zurück, wird die Anmeldung sofort erneut geprüft.
    if (typeof window !== "undefined") window.addEventListener("online", () => this.issue === "offline" && void this.restore());
  }

  view(): AccountView {
    return {
      did: this.session?.sub ?? null,
      handle: this.handle,
      status: this.status,
      error: this.error,
      available: loginAvailable(),
      issue: this.issue,
      retrying: this.retrying,
      lastHandle: lastHandle(),
    };
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** Beim App-Start: Redirect verarbeiten bzw. Session wiederherstellen. Läuft nie doppelt; Fehler → Spielen ohne Konto. */
  restore(): Promise<void> {
    this.restoring ??= this.doRestore().finally(() => {
      this.restoring = null;
    });
    return this.restoring;
  }

  private async doRestore(): Promise<void> {
    if (!loginAvailable()) return;
    window.clearTimeout(this.offlineTimer);
    // Wurde die Seite für einen Login von einer anderen Herkunft hierher geleitet, den Login jetzt starten.
    const requested = takeLoginRequest();
    try {
      const result = await restoreSession();
      if (result.retrying) {
        this.retrying = true;
        this.emit();
        return;
      }
      this.retrying = false;
      this.issue = null;
      this.offlineAttempt = 0;
      if (!result.session) {
        this.emit();
        if (requested) await this.signIn(requested);
        return;
      }
      await this.adopt(result.session, result.fresh);
    } catch (error) {
      this.handleAuthFailure(error, "atproto.restore");
    }
  }

  /** Ordnet einen Anmeldefehler ein und setzt Status, Meldung und gegebenenfalls eine Wiederholung. */
  private handleAuthFailure(error: unknown, where: string): void {
    const kind = error instanceof AuthError ? error.kind : classifyAuthError(error);
    console.warn("ATProto-Anmeldung", where, kind, error);
    reportError(error, where, { kind });
    this.retrying = false;
    if (kind === "expired") {
      this.session = null;
      this.handle = null;
      this.issue = "expired";
      this.error = t("account.error.expired");
    } else if (kind === "network") {
      this.session = null;
      this.issue = "offline";
      this.error = t("account.error.offline");
      this.scheduleOfflineRetry();
    } else {
      this.session = null;
      this.issue = "failed";
      this.error = t("account.error.restore", { detail: errorDetail(error) });
    }
    this.emit();
  }

  private scheduleOfflineRetry(): void {
    const delay = OFFLINE_RETRY_MS[this.offlineAttempt];
    if (delay === undefined) return;
    this.offlineAttempt += 1;
    this.offlineTimer = window.setTimeout(() => void this.restore(), delay);
  }

  /** Startet den Login (Weiterleitung zum PDS). Abbruch/Fehler werden als Meldung angezeigt. */
  async signIn(handle: string): Promise<void> {
    const clean = handle.trim().replace(/^@/, "");
    if (!clean) {
      this.error = t("account.error.noHandle");
      this.emit();
      return;
    }
    this.error = null;
    this.issue = null;
    this.emit();
    try {
      await signIn(clean);
    } catch (error) {
      const kind = classifyAuthError(error);
      console.warn("Login abgebrochen", kind, error);
      // „Zurück“ aus dem Login ist kein Fehler.
      if (kind === "cancelled") return;
      reportError(error, "atproto.signIn", { handle: clean, kind });
      this.error = t(kind === "network" ? "account.error.offline" : "account.error.signIn", { detail: errorDetail(error) });
      this.emit();
    }
  }

  /** Session beenden; lokale Ladder-Daten bleiben erhalten. */
  async signOut(): Promise<void> {
    const session = this.session;
    logLogout();
    this.session = null;
    this.handle = null;
    this.status = "idle";
    this.error = null;
    this.issue = null;
    this.emit();
    try {
      await session?.signOut();
    } catch (error) {
      console.warn("Abmelden fehlgeschlagen", error);
    }
  }

  /**
   * Nach einem beendeten Match: Records sofort in die Queue (synchron, übersteht auch Tab-Schließen),
   * danach best effort syncen.
   */
  onMatchFinished(result: MatchResult): void {
    const did = this.session?.sub;
    if (!did) return;
    this.queue.enqueue(did, matchRecordsForAccount(result, did, new Date().toISOString()));
    void this.sync();
  }

  /** Gleicht mit dem PDS ab; parallele Aufrufe werden zusammengefasst. */
  sync(): Promise<void> {
    if (this.busy) return this.busy;
    const session = this.session;
    if (!session) return Promise.resolve();
    this.status = "syncing";
    this.error = null;
    this.emit();
    this.busy = (async () => {
      try {
        const client = await createPdsClient(session);
        await withTimeout(
          syncAccount({ client, did: session.sub, name: this.handle ?? session.sub, store: this.store, queue: this.queue }),
          SYNC_TIMEOUT_MS,
          "Sync",
        );
        this.status = "ok";
      } catch (error) {
        console.warn("PDS-Sync fehlgeschlagen", error);
        reportError(error, "atproto.sync", { did: session.sub });
        if (classifyAuthError(error) === "expired") {
          // Sitzung ungültig: weiterspielen ohne Konto, Partien bleiben in der Warteschlange, Neu-Anmeldung anbieten.
          this.session = null;
          this.handle = null;
          this.status = "idle";
          this.issue = "expired";
          this.error = t("account.error.expired");
        } else {
          this.status = "error";
          this.error = t("account.error.sync");
        }
      } finally {
        this.busy = null;
        this.emit();
      }
    })();
    return this.busy;
  }

  private async adopt(session: AtSession, fresh: boolean): Promise<void> {
    this.session = session;
    let handle: string | null = null;
    let details: Record<string, unknown> = {};
    try {
      ({ handle, details } = await describeAccount(session));
    } catch (error) {
      reportError(error, "atproto.describe");
    }
    this.handle = handle ?? session.sub;
    this.store.bindAccount(session.sub, this.handle, ` ${t("account.nameSuffix")}`);
    this.emit();
    // Nur eine echte neue Anmeldung wird als Login geloggt; wiederhergestellte Sitzungen nur dem Nutzer zugeordnet.
    if (fresh) logLogin(session.sub, this.handle, details);
    else identify(session.sub, this.handle);
    await this.sync();
  }
}

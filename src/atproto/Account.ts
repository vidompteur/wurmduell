import type { LadderStore } from "../ladder/LadderStore";
import type { MatchResult } from "../types";
import { type AtSession, createPdsClient, loginAvailable, resolveHandle, restoreSession, signIn } from "./auth";
import { matchRecordsForAccount } from "./records";
import { SyncQueue, syncAccount } from "./sync";
import { t } from "../i18n";

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type SyncStatus = "idle" | "syncing" | "ok" | "error";

export interface AccountView {
  /** Angemeldetes Konto (DID) oder `null` im Offline-Modus. */
  did: string | null;
  handle: string | null;
  status: SyncStatus;
  /** Letzte Fehlermeldung (Login oder Sync). */
  error: string | null;
  /** Login ist hier überhaupt möglich (veröffentlichte https-Seite). */
  available: boolean;
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
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly store: LadderStore,
    private readonly queue: SyncQueue = new SyncQueue(),
  ) {}

  view(): AccountView {
    return { did: this.session?.sub ?? null, handle: this.handle, status: this.status, error: this.error, available: loginAvailable() };
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** Beim App-Start: Redirect verarbeiten bzw. Session wiederherstellen. Fehler → Offline-Modus. */
  async restore(): Promise<void> {
    if (!loginAvailable()) return;
    try {
      const session = await restoreSession();
      if (!session) return;
      await this.adopt(session);
    } catch (error) {
      console.warn("Keine gültige ATProto-Session", error);
      this.session = null;
      this.error = t("account.error.restore", { detail: errorDetail(error) });
      this.emit();
    }
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
    this.emit();
    try {
      await signIn(clean);
    } catch (error) {
      console.warn("Login abgebrochen", error);
      this.error = t("account.error.signIn", { detail: errorDetail(error) });
      this.emit();
    }
  }

  /** Session beenden; lokale Ladder-Daten bleiben erhalten. */
  async signOut(): Promise<void> {
    const session = this.session;
    this.session = null;
    this.handle = null;
    this.status = "idle";
    this.error = null;
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
        await syncAccount({ client, did: session.sub, name: this.handle ?? session.sub, store: this.store, queue: this.queue });
        this.status = "ok";
      } catch (error) {
        console.warn("PDS-Sync fehlgeschlagen", error);
        this.status = "error";
        this.error = t("account.error.sync");
      } finally {
        this.busy = null;
        this.emit();
      }
    })();
    return this.busy;
  }

  private async adopt(session: AtSession): Promise<void> {
    this.session = session;
    this.handle = (await resolveHandle(session)) ?? session.sub;
    this.store.bindAccount(session.sub, this.handle, ` ${t("account.nameSuffix")}`);
    this.emit();
    await this.sync();
  }
}

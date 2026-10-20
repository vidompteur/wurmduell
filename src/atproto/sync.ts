import type { LadderStore, StorageLike } from "../ladder/LadderStore";
import type { LadderEntry } from "../types";
import {
  COLLECTIONS,
  type MatchResultRecord,
  entryFromSummary,
  matchRecordKey,
  mergeLadder,
  summaryRecord,
} from "./records";

/** Minimale PDS-Schnittstelle, damit die Sync-Logik ohne Netzwerk testbar bleibt. */
export interface PdsClient {
  /** Mit festem `rkey` wiederholbar: gibt es den Record schon, ist das kein Fehler. */
  createRecord(collection: string, record: object, rkey?: string): Promise<void>;
  /** Liefert `null`, wenn der Record nicht existiert. `cid` dient der Konflikterkennung beim Schreiben. */
  getRecord(collection: string, rkey: string): Promise<{ value: unknown; cid?: string } | null>;
  /** Mit `swapCid` wird nur geschrieben, wenn der Record noch dieser Stand ist, sonst `SwapConflictError`. */
  putRecord(collection: string, rkey: string, record: object, swapCid?: string): Promise<void>;
}

/** Der Record wurde zwischen Lesen und Schreiben von jemand anderem geändert. */
export class SwapConflictError extends Error {
  constructor() {
    super("Record wurde zwischenzeitlich geändert");
    this.name = "SwapConflictError";
  }
}

/** Erkennt die PDS-Antwort „Record existiert schon“ (die Meldung ist je nach PDS unterschiedlich formuliert). */
export function isAlreadyExists(error: unknown): boolean {
  const e = error as { status?: unknown; error?: unknown; message?: unknown } | null;
  return e?.status === 409 || /already exist|duplicate|RecordAlreadyExists/i.test(`${String(e?.error ?? "")} ${String(e?.message ?? "")}`);
}

const MAX_SWAP_RETRIES = 3;

export const SYNC_QUEUE_KEY = "wurmduell.syncQueue.v1";

interface QueueFile {
  version: 1;
  /** DID → noch nicht geschriebene Match-Records */
  pending: Record<string, MatchResultRecord[]>;
}

/** Persistente Warteschlange für Matches, die noch nicht im PDS stehen (Spec 9.3, Schritt 7). */
export class SyncQueue {
  constructor(private readonly storage: StorageLike | null = safeStorage()) {}

  private load(): QueueFile {
    try {
      const raw = this.storage?.getItem(SYNC_QUEUE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as QueueFile;
        if (p.version === 1 && typeof p.pending === "object" && p.pending !== null) return p;
      }
    } catch {
      /* beschädigt → leer */
    }
    return { version: 1, pending: {} };
  }

  private save(q: QueueFile): void {
    try {
      this.storage?.setItem(SYNC_QUEUE_KEY, JSON.stringify(q));
    } catch {
      /* Speicher gesperrt: Queue geht verloren, lokale Ladder bleibt */
    }
  }

  pending(did: string): MatchResultRecord[] {
    return this.load().pending[did] ?? [];
  }

  enqueue(did: string, records: readonly MatchResultRecord[]): void {
    if (records.length === 0) return;
    const q = this.load();
    q.pending[did] = [...(q.pending[did] ?? []), ...records];
    this.save(q);
  }

  /** Entfernt die ersten `count` Einträge (bereits geschrieben). */
  drop(did: string, count: number): void {
    const q = this.load();
    const rest = (q.pending[did] ?? []).slice(count);
    if (rest.length > 0) q.pending[did] = rest;
    else delete q.pending[did];
    this.save(q);
  }
}

function safeStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export interface SyncOptions {
  client: PdsClient;
  did: string;
  /** Anzeigename (Handle) für Profil und lokale Ladder. */
  name: string;
  store: LadderStore;
  queue: SyncQueue;
}

/**
 * Vollständiger Abgleich mit dem PDS (Spec 9.3):
 * 1. Wartende `matchResult`-Records schreiben (bei Fehler abbrechen, Rest bleibt in der Queue).
 * 2. Remote-Summary lesen, mit der lokalen mergen, lokal speichern und zurückschreiben.
 * Wirft bei Netzwerk-/PDS-Fehlern; der Aufrufer zeigt „Sync fehlgeschlagen" und versucht es später erneut.
 */
export async function syncAccount(opts: SyncOptions): Promise<LadderEntry | null> {
  const { client, did, name, store, queue } = opts;

  const waiting = queue.pending(did);
  let written = 0;
  try {
    for (const record of waiting) {
      try {
        await client.createRecord(COLLECTIONS.matchResult, record, matchRecordKey(record));
      } catch (error) {
        // Bereits geschrieben (z. B. Antwort ging verloren): gilt als erledigt.
        if (!isAlreadyExists(error)) throw error;
      }
      written += 1;
    }
  } finally {
    if (written > 0) queue.drop(did, written);
  }

  for (let attempt = 0; ; attempt++) {
    const remoteRecord = await client.getRecord(COLLECTIONS.ladderSummary, "self");
    const local = store.entryFor(did);
    const remote = entryFromSummary(remoteRecord?.value ?? null, did, name);
    const merged = local && remote ? mergeLadder(local, remote) : (local ?? remote);
    if (!merged) return null;
    store.upsertEntry(merged);
    try {
      await client.putRecord(COLLECTIONS.ladderSummary, "self", summaryRecord(merged), remoteRecord?.cid);
      return merged;
    } catch (error) {
      // Zwei Geräte haben gleichzeitig geschrieben: neu lesen, neu mergen, noch einmal schreiben.
      if (error instanceof SwapConflictError && attempt < MAX_SWAP_RETRIES) continue;
      throw error;
    }
  }
}

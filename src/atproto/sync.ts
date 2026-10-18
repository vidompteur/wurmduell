import type { LadderStore, StorageLike } from "../ladder/LadderStore";
import type { LadderEntry } from "../types";
import {
  COLLECTIONS,
  type MatchResultRecord,
  type ProfileRecord,
  entryFromSummary,
  mergeLadder,
  summaryRecord,
} from "./records";

/** Minimale PDS-Schnittstelle, damit die Sync-Logik ohne Netzwerk testbar bleibt. */
export interface PdsClient {
  createRecord(collection: string, record: object): Promise<void>;
  /** Liefert `null`, wenn der Record nicht existiert. */
  getRecord(collection: string, rkey: string): Promise<unknown | null>;
  putRecord(collection: string, rkey: string, record: object): Promise<void>;
}

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
  now?: () => Date;
}

/**
 * Vollständiger Abgleich mit dem PDS (Spec 9.3):
 * 1. Profil anlegen, falls es fehlt.
 * 2. Wartende `matchResult`-Records schreiben (bei Fehler abbrechen, Rest bleibt in der Queue).
 * 3. Remote-Summary lesen, mit der lokalen mergen, lokal speichern und zurückschreiben.
 * Wirft bei Netzwerk-/PDS-Fehlern; der Aufrufer zeigt „Sync fehlgeschlagen" und versucht es später erneut.
 */
export async function syncAccount(opts: SyncOptions): Promise<LadderEntry | null> {
  const { client, did, name, store, queue } = opts;
  const now = opts.now ?? (() => new Date());

  const profile = await client.getRecord(COLLECTIONS.profile, "self");
  if (profile === null) {
    const record: ProfileRecord = { $type: COLLECTIONS.profile, displayName: name.slice(0, 64), createdAt: now().toISOString() };
    await client.putRecord(COLLECTIONS.profile, "self", record);
  }

  const waiting = queue.pending(did);
  let written = 0;
  try {
    for (const record of waiting) {
      await client.createRecord(COLLECTIONS.matchResult, record);
      written += 1;
    }
  } finally {
    if (written > 0) queue.drop(did, written);
  }

  const local = store.entryFor(did);
  const remote = entryFromSummary(await client.getRecord(COLLECTIONS.ladderSummary, "self"), did, name);
  const merged = local && remote ? mergeLadder(local, remote) : (local ?? remote);
  if (!merged) return null;
  store.upsertEntry(merged);
  await client.putRecord(COLLECTIONS.ladderSummary, "self", summaryRecord(merged));
  return merged;
}

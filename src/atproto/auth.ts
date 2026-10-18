import { CONFIG } from "../config";
import type { PdsClient } from "./sync";

/** Was wir von einer OAuth-Session brauchen (Teilmenge von `OAuthSession`). */
export interface AtSession {
  /** DID des Kontos – stabile Spieler-ID. */
  readonly sub: string;
  signOut(): Promise<void>;
}

type OAuthClient = {
  init(): Promise<{ session: AtSession } | undefined>;
  signIn(handle: string, options?: { state?: string }): Promise<unknown>;
};

let clientPromise: Promise<OAuthClient> | null = null;

/** OAuth-Login läuft nur auf der veröffentlichten Seite (https); lokal gibt es keine gültige `client_id`. */
export function loginAvailable(): boolean {
  if (!CONFIG.atproto.enabled) return false;
  const host = location.hostname;
  return location.protocol === "https:" && host !== "localhost" && host !== "127.0.0.1";
}

export function clientId(): string {
  return CONFIG.atproto.clientId || new URL("client-metadata.json", document.baseURI).href;
}

/** Lädt Client-Bibliothek erst bei Bedarf, damit sie den Spielstart nicht verlangsamt. */
function getOAuthClient(): Promise<OAuthClient> {
  clientPromise ??= import("@atproto/oauth-client-browser").then(
    ({ BrowserOAuthClient }) =>
      BrowserOAuthClient.load({
        clientId: clientId(),
        handleResolver: CONFIG.atproto.handleResolver,
      }) as unknown as Promise<OAuthClient>,
  );
  return clientPromise;
}

/** Verarbeitet einen OAuth-Redirect bzw. stellt eine gespeicherte Session wieder her. */
export async function restoreSession(): Promise<AtSession | null> {
  const client = await getOAuthClient();
  const result = await client.init();
  return result?.session ?? null;
}

/** Leitet zum OAuth-Server des PDS weiter; kehrt normalerweise nicht zurück. */
export async function signIn(handle: string): Promise<void> {
  const client = await getOAuthClient();
  await client.signIn(handle, { state: crypto.randomUUID() });
}

/** Handle zur DID (kann sich ändern, daher nur zur Anzeige). */
export async function resolveHandle(session: AtSession): Promise<string | null> {
  try {
    const { Agent } = await import("@atproto/api");
    const agent = new Agent(session as never);
    const res = await agent.com.atproto.repo.describeRepo({ repo: session.sub });
    return res.data.handle ?? null;
  } catch {
    return null;
  }
}

/** PDS-Zugriff über die angemeldete Session. */
export async function createPdsClient(session: AtSession): Promise<PdsClient> {
  const { Agent } = await import("@atproto/api");
  const agent = new Agent(session as never);
  const repo = session.sub;
  return {
    async createRecord(collection, record) {
      await agent.com.atproto.repo.createRecord({ repo, collection, record: record as Record<string, unknown>, validate: false });
    },
    async getRecord(collection, rkey) {
      try {
        const res = await agent.com.atproto.repo.getRecord({ repo, collection, rkey });
        return res.data.value;
      } catch (error) {
        const e = error as { error?: string; status?: number };
        if (e.error === "RecordNotFound" || (e.status === 400 && /not found/i.test(String((error as Error).message)))) return null;
        throw error;
      }
    },
    async putRecord(collection, rkey, record) {
      await agent.com.atproto.repo.putRecord({ repo, collection, rkey, record: record as Record<string, unknown>, validate: false });
    },
  };
}

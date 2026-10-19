import { CONFIG } from "../config";
import type { PdsClient } from "./sync";

/** Was wir von einer OAuth-Session brauchen (Teilmenge von `OAuthSession`). */
export interface AtSession {
  /** DID des Kontos – stabile Spieler-ID. */
  readonly sub: string;
  signOut(): Promise<void>;
  /** Token-Metadaten (Aussteller, PDS, Rechte, Ablauf); nur Information, nie das Token selbst. */
  getTokenInfo?(refresh?: boolean): Promise<{ iss?: string; aud?: string; scope?: string; expiresAt?: Date | string }>;
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
  clientPromise ??= import("@atproto/oauth-client-browser")
    .then(
      ({ BrowserOAuthClient }) =>
        BrowserOAuthClient.load({
          clientId: clientId(),
          handleResolver: CONFIG.atproto.handleResolver,
        }) as unknown as Promise<OAuthClient>,
    )
    .catch((error: unknown) => {
      // Ein fehlgeschlagenes Laden (z. B. kalter Start der Seite) darf nicht für immer gemerkt werden.
      clientPromise = null;
      throw error;
    });
  return clientPromise;
}

const CALLBACK_KEYS = ["code", "state", "iss", "error", "error_description"];

/** Entfernt OAuth-Rückgabeparameter (Query und Fragment) aus einer URL; alles andere bleibt. */
export function cleanCallbackUrl(href: string): string {
  const url = new URL(href);
  for (const key of CALLBACK_KEYS) url.searchParams.delete(key);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  if (CALLBACK_KEYS.some((k) => hash.has(k))) {
    for (const key of CALLBACK_KEYS) hash.delete(key);
    const rest = hash.toString();
    url.hash = rest ? `#${rest}` : "";
  }
  return url.toString();
}

let restorePromise: Promise<AtSession | null> | null = null;

async function restoreOnce(): Promise<AtSession | null> {
  const client = await getOAuthClient();
  try {
    return (await client.init())?.session ?? null;
  } catch (error) {
    // „Unknown authorization session“: Die Rückgabe wurde schon verarbeitet (doppelter Seitenaufruf oder
    // doppeltes init). Die Anmeldung steht dann meist bereits gespeichert; also Parameter entfernen
    // und die gespeicherte Session wiederherstellen, statt einen Fehler zu zeigen.
    if (!/Unknown authorization session/i.test(error instanceof Error ? error.message : String(error))) throw error;
    history.replaceState(history.state, "", cleanCallbackUrl(location.href));
    return (await client.init())?.session ?? null;
  }
}

/** Verarbeitet einen OAuth-Redirect bzw. stellt eine gespeicherte Session wieder her (pro Seitenaufruf nur einmal). */
export function restoreSession(): Promise<AtSession | null> {
  restorePromise ??= restoreOnce();
  return restorePromise;
}

/** Leitet zum OAuth-Server des PDS weiter; kehrt normalerweise nicht zurück. */
export async function signIn(handle: string): Promise<void> {
  // Der erste Versuch scheitert gelegentlich an kalten Caches (Handle-Auflösung, Client-Metadaten
  // beim PDS). Ein einziger automatischer zweiter Versuch fängt das ab.
  for (let attempt = 1; ; attempt++) {
    try {
      const client = await getOAuthClient();
      await client.signIn(handle, { state: crypto.randomUUID() });
      return;
    } catch (error) {
      if (attempt >= 2) throw error;
      console.warn("Login fehlgeschlagen, neuer Versuch", error);
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }
}

/** Konto-Details nach dem Login: Handle (nur zur Anzeige) und möglichst viele Metadaten für das Logging. */
export async function describeAccount(session: AtSession): Promise<{ handle: string | null; details: Record<string, unknown> }> {
  const details: Record<string, unknown> = { did: session.sub };
  let handle: string | null = null;
  try {
    const { Agent } = await import("@atproto/api");
    const agent = new Agent(session as never);
    const res = await agent.com.atproto.repo.describeRepo({ repo: session.sub });
    handle = res.data.handle ?? null;
    details.handle = handle;
    details.handleIsCorrect = res.data.handleIsCorrect;
    details.didDoc = res.data.didDoc;
    details.collections = res.data.collections;
  } catch (error) {
    details.describeRepoError = error instanceof Error ? error.message : String(error);
  }
  try {
    const info = await session.getTokenInfo?.(false);
    if (info) details.token = { issuer: info.iss, pds: info.aud, scope: info.scope, expiresAt: info.expiresAt instanceof Date ? info.expiresAt.toISOString() : info.expiresAt };
  } catch {
    /* Token-Infos sind optional */
  }
  return { handle, details };
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

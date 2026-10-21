import { CONFIG } from "../config";
import { logAuth } from "../telemetry";
import { AuthError, LoginMemory, classifyAuthError, cleanCallbackUrl, hasCallbackParams, withTimeout } from "./authFlow";
import { SwapConflictError, type PdsClient } from "./sync";

export { cleanCallbackUrl } from "./authFlow";

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
  return CONFIG.atproto.clientId || new URL("client-metadata.json", CONFIG.atproto.appUrl || document.baseURI).href;
}

/** Ist die Seite unter einer anderen Herkunft geöffnet als die veröffentlichte Adresse? (Dann ginge die Rückkehr vom Login verloren.) */
export function canonicalAppUrl(): string | null {
  const app = CONFIG.atproto.appUrl;
  if (!app) return null;
  try {
    return new URL(app).origin === location.origin ? null : app;
  } catch {
    return null;
  }
}

/** Liest und entfernt `?login=<handle>`: Anforderung, den Login nach dem Wechsel auf die veröffentlichte Adresse zu starten. */
export function takeLoginRequest(): string | null {
  const url = new URL(location.href);
  const handle = url.searchParams.get("login");
  if (handle === null) return null;
  url.searchParams.delete("login");
  history.replaceState(history.state, "", url.toString());
  return handle.trim() || null;
}

/** Umgebungsangaben für die Fehlersuche im Log (keine Geheimnisse). */
async function authContext(): Promise<Record<string, unknown>> {
  const pending = memory.pending();
  let persisted: boolean | undefined;
  try {
    persisted = await navigator.storage?.persisted?.();
  } catch {
    /* ignorieren */
  }
  return {
    origin: location.origin,
    path: location.pathname,
    paramKeys: [...new URLSearchParams(location.hash.replace(/^#/, "")).keys(), ...new URLSearchParams(location.search).keys()],
    referrer: document.referrer ? new URL(document.referrer).origin : undefined,
    clientId: clientId(),
    pending: pending ? { handle: pending.handle, autoRetries: pending.autoRetries, elapsedMs: Date.now() - pending.startedAt } : null,
    indexedDB: typeof indexedDB !== "undefined",
    storagePersisted: persisted,
    visibility: document.visibilityState,
  };
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

const memory = new LoginMemory();

/** Zuletzt benutzter Handle (für „Neu anmelden“ und das vorausgefüllte Eingabefeld). */
export const lastHandle = (): string | null => memory.lastHandle();

export interface RestoreResult {
  session: AtSession | null;
  /** Die Sitzung stammt aus einer gerade abgeschlossenen Anmeldung (nicht aus dem Speicher). */
  fresh: boolean;
  /** Der Login wurde nach einem Fehler automatisch neu gestartet; die Seite wird gleich weitergeleitet. */
  retrying?: boolean;
}

const LIMITS = { load: 20_000, init: 20_000 };

let restorePromise: Promise<RestoreResult> | null = null;

const detail = (error: unknown): Record<string, unknown> => ({
  kind: classifyAuthError(error),
  errorName: error instanceof Error ? error.name : typeof error,
  errorMessage: error instanceof Error ? error.message : String(error),
  cause: error instanceof Error && error.cause ? String(error.cause) : undefined,
});

async function restoreOnce(): Promise<RestoreResult> {
  const callback = hasCallbackParams(location.href);
  logAuth("restore", { callback, ...(await authContext()) });
  const client = await withTimeout(getOAuthClient(), LIMITS.load, "OAuth-Client laden");
  try {
    const result = await withTimeout(client.init(), LIMITS.init, "Sitzung prüfen");
    if (result?.session) {
      memory.clearPending();
      return { session: result.session, fresh: callback };
    }
    if (callback) throw new AuthError("Rückgabe ohne Sitzung", "callback");
    return { session: null, fresh: false };
  } catch (error) {
    const kind = classifyAuthError(error);
    logAuth("restore.error", { callback, ...detail(error), ...(await authContext()) }, "warn");
    if (!callback) {
      // Keine Rückgabe im Spiel: Netzwerk- und Ablauffehler getrennt melden (siehe Account).
      throw error instanceof AuthError ? error : new AuthError(error instanceof Error ? error.message : String(error), kind, error);
    }
    // Die Rückkehr vom Login ist fehlgeschlagen. Meist ist die Anmeldung beim PDS trotzdem gültig:
    // 1) Rückgabeparameter entfernen und eine schon gespeicherte Sitzung wiederherstellen,
    history.replaceState(history.state, "", cleanCallbackUrl(location.href));
    // Läuft dieselbe Rückgabe gleichzeitig in einem zweiten Fenster/Tab, ist deren Ergebnis gleich da:
    // kurz mehrmals nachsehen, bevor der Login neu gestartet wird.
    for (let i = 0; i < 4; i++) {
      try {
        const again = await withTimeout(client.init(), LIMITS.init, "Sitzung prüfen (2)");
        if (again?.session) {
          logAuth("restore.recovered", { poll: i });
          memory.clearPending();
          return { session: again.session, fresh: true };
        }
      } catch (second) {
        logAuth("restore.error2", { poll: i, ...detail(second) }, "warn");
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    // 2) sonst den Login einmal automatisch neu starten (der zweite Versuch gelingt erfahrungsgemäß).
    const pending = memory.takeAutoRetry();
    if (pending && kind !== "cancelled") {
      logAuth("autoRetry", { handle: pending.handle, attempt: pending.autoRetries });
      await startSignIn(pending.handle);
      return { session: null, fresh: false, retrying: true };
    }
    memory.clearPending();
    throw error instanceof AuthError ? error : new AuthError(error instanceof Error ? error.message : String(error), kind, error);
  }
}

/** Verarbeitet einen OAuth-Redirect bzw. stellt eine gespeicherte Session wieder her. Bei Fehlern kann es erneut aufgerufen werden. */
export function restoreSession(): Promise<RestoreResult> {
  restorePromise ??= restoreOnce().catch((error: unknown) => {
    restorePromise = null;
    throw error;
  });
  return restorePromise;
}

/** Eigentlicher Anmeldestart: Weiterleitung zum PDS; ein Netzwerkfehler vor der Weiterleitung wird einmal wiederholt. */
async function startSignIn(handle: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      const client = await withTimeout(getOAuthClient(), LIMITS.load, "OAuth-Client laden");
      logAuth("signIn", { handle, attempt, ...(await authContext()) });
      await client.signIn(handle, { state: crypto.randomUUID() });
      return;
    } catch (error) {
      const kind = classifyAuthError(error);
      // Nur Fehler *vor* der Weiterleitung wiederholen; „zurück“ und Abbruch nie.
      if (kind !== "network" || attempt >= 2) throw error instanceof AuthError ? error : new AuthError(error instanceof Error ? error.message : String(error), kind, error);
      logAuth("signIn.retry", { handle, ...detail(error) }, "warn");
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
}

/** Leitet zum OAuth-Server des PDS weiter; kehrt normalerweise nicht zurück. */
export async function signIn(handle: string): Promise<void> {
  const canonical = canonicalAppUrl();
  if (canonical) {
    // Anderer Ursprung als die registrierte Adresse: der Login muss dort starten, sonst geht der Anmeldevorgang verloren.
    logAuth("signIn.moveToCanonical", { from: location.origin, to: canonical });
    location.assign(`${canonical}?login=${encodeURIComponent(handle)}`);
    return;
  }
  memory.begin(handle);
  await startSignIn(handle);
}

/** Konto-Details nach dem Login: Handle (nur zur Anzeige) und möglichst viele Metadaten für das Logging. */
export async function describeAccount(session: AtSession): Promise<{ handle: string | null; details: Record<string, unknown> }> {
  const details: Record<string, unknown> = { did: session.sub };
  let handle: string | null = null;
  try {
    const { Agent } = await import("@atproto/api");
    const agent = new Agent(session as never);
    const res = await withTimeout(agent.com.atproto.repo.describeRepo({ repo: session.sub }), 10_000, "Konto abfragen");
    handle = res.data.handle ?? null;
    details.handle = handle;
    details.handleIsCorrect = res.data.handleIsCorrect;
    details.didDoc = res.data.didDoc;
    details.collections = res.data.collections;
  } catch (error) {
    details.describeRepoError = error instanceof Error ? error.message : String(error);
  }
  try {
    const info = await (session.getTokenInfo ? withTimeout(session.getTokenInfo(false), 10_000, "Token-Infos") : undefined);
    if (info) details.token = { issuer: info.iss, pds: info.aud, scope: info.scope, expiresAt: info.expiresAt instanceof Date ? info.expiresAt.toISOString() : info.expiresAt };
  } catch {
    /* Token-Infos sind optional */
  }
  return { handle, details };
}

/** Ordnet PDS-Fehler zu: Swap-Konflikt (anderer Stand) wird zu `SwapConflictError`. */
function mapPdsError(error: unknown): unknown {
  const e = error as { error?: unknown; status?: unknown; message?: unknown } | null;
  if (e?.error === "InvalidSwap" || /invalid.?swap|swap/i.test(String(e?.message ?? "")) || e?.status === 409) return new SwapConflictError();
  return error;
}

/** PDS-Zugriff über die angemeldete Session. */
export async function createPdsClient(session: AtSession): Promise<PdsClient> {
  const { Agent } = await import("@atproto/api");
  const agent = new Agent(session as never);
  const repo = session.sub;
  return {
    async createRecord(collection, record, rkey) {
      await agent.com.atproto.repo.createRecord({ repo, collection, ...(rkey ? { rkey } : {}), record: record as Record<string, unknown>, validate: false });
    },
    async getRecord(collection, rkey) {
      try {
        const res = await agent.com.atproto.repo.getRecord({ repo, collection, rkey });
        return { value: res.data.value, cid: res.data.cid };
      } catch (error) {
        const e = error as { error?: string; status?: number };
        if (e.error === "RecordNotFound" || (e.status === 400 && /not found/i.test(String((error as Error).message)))) return null;
        throw error;
      }
    },
    async putRecord(collection, rkey, record, swapCid) {
      try {
        await agent.com.atproto.repo.putRecord({ repo, collection, rkey, record: record as Record<string, unknown>, validate: false, ...(swapCid ? { swapRecord: swapCid } : {}) });
      } catch (error) {
        throw mapPdsError(error);
      }
    },
  };
}

/**
 * Reine Hilfen für den Login-Ablauf (ohne Bibliotheks-Import, daher gut testbar):
 * Fehlerklassifizierung, Zeitlimits, Merker für den laufenden Login.
 */
import type { StorageLike } from "../ladder/LadderStore";

export type AuthIssue = "cancelled" | "callback" | "expired" | "network" | "other";

/** Fehler des Login-Ablaufs mit eingeordneter Art. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly kind: AuthIssue,
    readonly original?: unknown,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Ordnet einen Fehler der OAuth-Bibliothek oder des Netzwerks ein. */
export function classifyAuthError(error: unknown): AuthIssue {
  if (error instanceof AuthError) return error.kind;
  const msg = messageOf(error);
  const name = error instanceof Error ? error.name : "";
  const e = error as { status?: unknown; error?: unknown } | null;
  if (/navigated back|user cancel|access_denied|cancell?ed/i.test(msg)) return "cancelled";
  if (/unknown authorization session|OAuthCallbackError|authorization session|state parameter|missing .?state/i.test(msg) || name === "OAuthCallbackError") return "callback";
  if (
    /^(TokenRefreshError|TokenRevokedError|TokenInvalidError|AuthMethodUnsatisfiableError)$/.test(name) ||
    /expired|revoked|invalid_grant|invalid.?token|refresh token|session .*(not found|deleted)|unauthorized/i.test(msg) ||
    e?.status === 401 ||
    e?.error === "ExpiredToken" ||
    e?.error === "InvalidToken"
  )
    return "expired";
  if (name === "NetworkError" || name === "TimeoutError" || name === "AbortError" || /failed to fetch|networkerror|load failed|network request failed|timed out|timeout|offline|ECONN|ENOTFOUND/i.test(msg)) return "network";
  return "other";
}

/** Bricht ein Versprechen nach `ms` mit einem Netzwerk-Zeitüberschreitungsfehler ab. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AuthError(`${label}: Zeitüberschreitung nach ${Math.round(ms / 1000)} s`, "network")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const CALLBACK_KEYS = ["code", "state", "iss", "error", "error_description"];

function callbackParams(href: string): URLSearchParams[] {
  const url = new URL(href);
  return [url.searchParams, new URLSearchParams(url.hash.replace(/^#/, ""))];
}

/** Enthält die URL eine OAuth-Rückgabe (state plus code oder error)? */
export function hasCallbackParams(href: string): boolean {
  return callbackParams(href).some((p) => p.has("state") && (p.has("code") || p.has("error")));
}

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

export interface PendingLogin {
  handle: string;
  startedAt: number;
  /** Wie oft wurde der Login nach einem Fehler automatisch neu gestartet. */
  autoRetries: number;
}

const PENDING_KEY = "wurmduell.pendingLogin.v1";
const LAST_HANDLE_KEY = "wurmduell.lastHandle.v1";
/** Ein hängengebliebener Login gilt nach dieser Zeit nicht mehr als „laufend“. */
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;
/** So oft wird ein fehlgeschlagener Login automatisch neu gestartet (der zweite Versuch gelingt erfahrungsgemäß). */
export const MAX_AUTO_RETRIES = 1;

function safeStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Merkt sich den laufenden Login (über die Weiterleitung hinweg) und den zuletzt benutzten Handle. */
export class LoginMemory {
  constructor(
    private readonly storage: StorageLike | null = safeStorage(),
    private readonly now: () => number = Date.now,
  ) {}

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string | null): void {
    try {
      if (value === null) this.storage?.removeItem(key);
      else this.storage?.setItem(key, value);
    } catch {
      /* Speicher gesperrt: dann gibt es eben keine automatische Wiederholung */
    }
  }

  /** Beginnt einen vom Menschen gestarteten Login. */
  begin(handle: string): void {
    this.write(LAST_HANDLE_KEY, handle);
    this.write(PENDING_KEY, JSON.stringify({ handle, startedAt: this.now(), autoRetries: 0 } satisfies PendingLogin));
  }

  pending(): PendingLogin | null {
    const raw = this.read(PENDING_KEY);
    if (!raw) return null;
    try {
      const p = JSON.parse(raw) as Partial<PendingLogin>;
      if (typeof p.handle !== "string" || typeof p.startedAt !== "number" || this.now() - p.startedAt > PENDING_MAX_AGE_MS) return null;
      return { handle: p.handle, startedAt: p.startedAt, autoRetries: typeof p.autoRetries === "number" ? p.autoRetries : 0 };
    } catch {
      return null;
    }
  }

  /** Zählt einen automatischen Neustart; `null`, wenn kein Login läuft oder das Limit erreicht ist. */
  takeAutoRetry(): PendingLogin | null {
    const p = this.pending();
    if (!p || p.autoRetries >= MAX_AUTO_RETRIES) return null;
    const next = { ...p, autoRetries: p.autoRetries + 1 };
    this.write(PENDING_KEY, JSON.stringify(next));
    return next;
  }

  clearPending(): void {
    this.write(PENDING_KEY, null);
  }

  lastHandle(): string | null {
    return this.read(LAST_HANDLE_KEY);
  }
}

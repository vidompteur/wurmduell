import { describe, expect, it } from "vitest";
import { AuthError, LoginMemory, MAX_AUTO_RETRIES, classifyAuthError, cleanCallbackUrl, hasCallbackParams, withTimeout } from "../src/atproto/authFlow";
import { MemoryStorage } from "./helpers";

describe("OAuth-Rückgabe", () => {
  it("entfernt Parameter aus dem Fragment und behält den Rest", () => {
    expect(cleanCallbackUrl("https://x.test/app/?debug#state=a&code=b&iss=c")).toBe("https://x.test/app/?debug=");
  });

  it("entfernt Parameter aus der Query", () => {
    expect(cleanCallbackUrl("https://x.test/app/?code=b&state=a&keep=1")).toBe("https://x.test/app/?keep=1");
  });

  it("lässt URLs ohne Rückgabeparameter unverändert", () => {
    expect(cleanCallbackUrl("https://x.test/app/")).toBe("https://x.test/app/");
  });

  it("erkennt Rückgaben in Fragment und Query", () => {
    expect(hasCallbackParams("https://x.test/app/#state=a&code=b")).toBe(true);
    expect(hasCallbackParams("https://x.test/app/?state=a&error=access_denied")).toBe(true);
    expect(hasCallbackParams("https://x.test/app/?state=a")).toBe(false);
    expect(hasCallbackParams("https://x.test/app/")).toBe(false);
  });
});

describe("Fehlerklassifizierung", () => {
  it("ordnet typische Fehler ein", () => {
    expect(classifyAuthError(new Error('Unknown authorization session "abc"'))).toBe("callback");
    expect(classifyAuthError(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifyAuthError(new Error("Load failed"))).toBe("network");
    expect(classifyAuthError(Object.assign(new Error("x"), { name: "TokenRefreshError" }))).toBe("expired");
    expect(classifyAuthError(new Error("invalid_grant"))).toBe("expired");
    expect(classifyAuthError({ status: 401 })).toBe("expired");
    expect(classifyAuthError(new Error("User navigated back"))).toBe("cancelled");
    expect(classifyAuthError(new Error("etwas ganz anderes"))).toBe("other");
    expect(classifyAuthError(new AuthError("t", "network"))).toBe("network");
  });
});

describe("Zeitlimit", () => {
  it("meldet ein hängendes Versprechen als Netzwerkfehler", async () => {
    let kind = "";
    try {
      await withTimeout(new Promise<never>(() => undefined), 20, "Test");
    } catch (e) {
      kind = classifyAuthError(e);
    }
    expect(kind).toBe("network");
  });

  it("gibt das Ergebnis eines rechtzeitigen Versprechens durch", async () => {
    expect(await withTimeout(Promise.resolve(42), 1000, "Test")).toBe(42);
  });
});

describe("Merker für den laufenden Login", () => {
  it("erlaubt genau eine automatische Wiederholung und merkt den Handle", () => {
    let now = 1_000;
    const m = new LoginMemory(new MemoryStorage(), () => now);
    expect(m.pending()).toBe(null);
    m.begin("anna.test");
    expect(m.lastHandle()).toBe("anna.test");
    expect(m.pending()?.autoRetries).toBe(0);
    for (let i = 0; i < MAX_AUTO_RETRIES; i++) expect(m.takeAutoRetry()?.handle).toBe("anna.test");
    expect(m.takeAutoRetry()).toBe(null);
    m.begin("anna.test");
    expect(m.takeAutoRetry() !== null).toBe(true);
    now += 11 * 60 * 1000;
    expect(m.pending()).toBe(null);
    expect(m.takeAutoRetry()).toBe(null);
  });

  it("vergisst den laufenden Login nach Erfolg, behält aber den Handle", () => {
    const m = new LoginMemory(new MemoryStorage());
    m.begin("anna.test");
    m.clearPending();
    expect(m.pending()).toBe(null);
    expect(m.lastHandle()).toBe("anna.test");
  });

  it("funktioniert auch ohne Speicher", () => {
    const m = new LoginMemory(null);
    m.begin("x");
    expect(m.pending()).toBe(null);
    expect(m.takeAutoRetry()).toBe(null);
    expect(m.lastHandle()).toBe(null);
  });
});

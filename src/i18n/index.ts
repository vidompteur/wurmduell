import deRaw from "./de.properties?raw";
import enRaw from "./en.properties?raw";

/**
 * Zentrale Texte der Oberfläche. Alle sichtbaren Texte stehen in `de.properties`;
 * im Code wird nur noch über `t("schluessel", { platzhalter })` darauf zugegriffen.
 */

export type TextParams = Record<string, string | number>;

/** Liest das Properties-Format: `schluessel=Text`, `#` für Kommentare, Leerzeilen erlaubt. */
export function parseProperties(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("!")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (key) out[key] = line.slice(eq + 1).trim();
  }
  return out;
}

export type Language = "de" | "en";

const bundles: Record<Language, Record<string, string>> = {
  de: parseProperties(deRaw),
  en: parseProperties(enRaw),
};

/**
 * Wählt die Sprache: ausdrückliche Vorgabe (`?lang=en`) vor den Browser-Sprachen (erste unterstützte gewinnt);
 * ohne passende Sprache bleibt es Deutsch.
 */
export function pickLanguage(browserLanguages: readonly string[], override?: string | null): Language {
  for (const candidate of [...(override ? [override] : []), ...browserLanguages]) {
    const base = candidate.toLowerCase().split(/[-_]/)[0];
    if (base === "de" || base === "en") return base;
  }
  return "de";
}

function detectLanguage(): Language {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "de"; // Tests, Skripte
  let override: string | null = null;
  try {
    override = new URLSearchParams(window.location.search).get("lang");
  } catch {
    /* ignorieren */
  }
  const list = navigator.languages?.length ? navigator.languages : [navigator.language ?? ""];
  return pickLanguage(list, override);
}

let language: Language = detectLanguage();

export function getLanguage(): Language {
  return language;
}

/** Für Tests: Sprache fest einstellen. */
export function setLanguage(next: Language): void {
  language = next;
}

/** Gebietsschema für Zahlen, Datum und Sortierung passend zur Sprache. */
export function locale(): string {
  if (language === "de") return "de-DE";
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  return /^en(-|$)/i.test(nav) ? nav : "en-GB";
}

/** Ersetzt `{name}`-Platzhalter; unbekannte Platzhalter bleiben stehen. */
export function format(template: string, params?: TextParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** Text zum Schlüssel; bei fehlendem Schlüssel wird der Schlüssel selbst angezeigt. */
export function t(key: string, params?: TextParams): string {
  const text = bundles[language][key] ?? bundles.de[key];
  if (text === undefined) {
    console.warn(`Text fehlt in de.properties: ${key}`);
    return key;
  }
  return format(text, params);
}

/** Kommagetrennte Liste (z. B. Wurmnamen). */
export function tList(key: string): string[] {
  return t(key)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

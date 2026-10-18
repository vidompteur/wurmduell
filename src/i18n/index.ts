import raw from "./de.properties?raw";

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

const texts = parseProperties(raw);

/** Ersetzt `{name}`-Platzhalter; unbekannte Platzhalter bleiben stehen. */
export function format(template: string, params?: TextParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** Text zum Schlüssel; bei fehlendem Schlüssel wird der Schlüssel selbst angezeigt. */
export function t(key: string, params?: TextParams): string {
  const text = texts[key];
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

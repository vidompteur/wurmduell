import { CONFIG } from "../config";

const HANDLE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/i;
const DID = /^did:[a-z]+:[A-Za-z0-9._:%-]+$/;

/**
 * Profil-Adresse für ein Konto (Handle oder DID): Vorlage je Handle-Domain (`profileUrlByDomain`, z. B. Eurosky → mu)
 * oder sonst `profileUrl` (`{id}` wird ersetzt).
 * Gibt `null` zurück, wenn die Vorlage fehlt, nicht mit https:// beginnt oder die Kennung ungültig aussieht –
 * die Rangliste zeigt dann nur den Namen.
 */
export function profileUrl(
  id: string | null | undefined,
  template: string = CONFIG.atproto.profileUrl,
  byDomain: Readonly<Record<string, string>> = CONFIG.atproto.profileUrlByDomain,
): string | null {
  if (!id) return null;
  const clean = id.trim().replace(/^@/, "");
  if (!HANDLE.test(clean) && !DID.test(clean)) return null;
  const lower = clean.toLowerCase();
  const domain = Object.keys(byDomain).find((d) => lower === d || lower.endsWith(`.${d}`));
  const chosen = domain ? byDomain[domain]! : template;
  if (!chosen.startsWith("https://") || !chosen.includes("{id}")) return null;
  return chosen.replace("{id}", encodeURIComponent(clean));
}

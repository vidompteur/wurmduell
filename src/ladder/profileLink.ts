import { CONFIG } from "../config";

const HANDLE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/i;
const DID = /^did:[a-z]+:[A-Za-z0-9._:%-]+$/;

/**
 * Profil-Adresse für ein Konto (Handle oder DID) nach der Vorlage `profileUrl` (`{id}` wird ersetzt).
 * Gibt `null` zurück, wenn die Vorlage fehlt, nicht mit https:// beginnt oder die Kennung ungültig aussieht –
 * die Rangliste zeigt dann nur den Namen.
 */
export function profileUrl(id: string | null | undefined, template: string = CONFIG.atproto.profileUrl): string | null {
  if (!id || !template.startsWith("https://") || !template.includes("{id}")) return null;
  const clean = id.trim().replace(/^@/, "");
  if (!HANDLE.test(clean) && !DID.test(clean)) return null;
  return template.replace("{id}", encodeURIComponent(clean));
}

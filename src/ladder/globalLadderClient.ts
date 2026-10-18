import { type GlobalLadderFile, parseGlobalLadder } from "./globalLadder";

/** Lädt die statische `ladder.json` neben der Seite (immer frisch, nie aus dem Cache). */
export async function loadGlobalLadder(): Promise<GlobalLadderFile> {
  const res = await fetch(new URL("ladder.json", document.baseURI), { cache: "no-cache" });
  if (!res.ok) throw new Error(`ladder.json: HTTP ${res.status}`);
  return parseGlobalLadder(await res.json());
}

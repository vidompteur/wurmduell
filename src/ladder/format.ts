/** Zeitpunkt des letzten Spiels („–“, wenn unbekannt). `updatedAt` wird nur beim Eintragen einer Partie gesetzt. */
export function lastPlayed(updatedAt: string): string {
  const time = Date.parse(updatedAt);
  if (!Number.isFinite(time) || time < Date.UTC(2020, 0, 1)) return "–";
  return new Date(time).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

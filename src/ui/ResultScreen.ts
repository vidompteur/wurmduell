import { accuracyOf } from "../game/MatchStats";
import type { MatchResult } from "../types";
import { clear, h } from "./dom";

export interface ResultOptions {
  onRematch(): void;
  onLadder(): void;
  onMenu(): void;
}

const pct = (v: number): string =>
  `${(v * 100).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} %`;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")} min`;
}

/** Ergebnisbildschirm nach Spielende. */
export function renderResult(root: HTMLElement, result: MatchResult, opts: ResultOptions): () => void {
  const [a, b] = result.teams;
  const winnerName = result.winner === null ? null : result.teams[result.winner]!.name;
  const headline = winnerName ? `${winnerName} gewinnt!` : "Unentschieden!";
  const sub =
    result.reason === "surrender"
      ? `${result.teams[1 - (result.winner ?? 0)]!.name} hat aufgegeben.`
      : winnerName
        ? "Alle gegnerischen Würmer wurden besiegt."
        : "Beide Teams wurden gleichzeitig ausgelöscht.";

  const row = (label: string, va: string, vb: string): HTMLElement =>
    h("tr", {}, h("th", { text: label, scope: "row" } as never), h("td", { class: "num", text: va }), h("td", { class: "num", text: vb }));

  const ladderNote = result.teams.some((t) => t.controller.kind === "human")
    ? "Das Ergebnis wurde in der Rangliste gespeichert."
    : "Computer gegen Computer – kein Eintrag in der Rangliste.";

  root.append(
    h(
      "section",
      { class: "panel wide result" },
      h("h2", { class: result.winner === null ? "" : `win-${result.winner}`, text: headline }),
      h("p", { class: "muted", text: sub }),
      h(
        "div",
        { class: "table-wrap" },
        h(
          "table",
          { class: "table" },
          h("thead", {}, h("tr", {}, h("th", { text: "" }), h("th", { class: `team-${0}`, text: a.name }), h("th", { class: `team-${1}`, text: b.name }))),
          h(
            "tbody",
            {},
            row("Schüsse", String(a.stats.shotsFired), String(b.stats.shotsFired)),
            row("Treffer", String(a.stats.shotsHit), String(b.stats.shotsHit)),
            row("Zielgenauigkeit", pct(accuracyOf(a.stats)), pct(accuracyOf(b.stats))),
            row("Schaden verursacht", String(a.stats.damageDealt), String(b.stats.damageDealt)),
            row("Schaden erhalten", String(a.stats.damageTaken), String(b.stats.damageTaken)),
            row("Würmer übrig", String(a.wormsAlive), String(b.wormsAlive)),
          ),
        ),
      ),
      h("p", { class: "muted small", text: `Dauer ${formatDuration(result.durationSeconds)} · Karte „${result.mapSeed}“ · ${ladderNote}` }),
      h(
        "div",
        { class: "row" },
        h("button", { class: "btn btn-primary", type: "button", text: "Revanche", onclick: opts.onRematch }),
        h("button", { class: "btn", type: "button", text: "Rangliste", onclick: opts.onLadder }),
        h("button", { class: "btn", type: "button", text: "Hauptmenü", onclick: opts.onMenu }),
      ),
    ),
  );
  return () => clear(root);
}

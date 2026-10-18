import { accuracyOf } from "../game/MatchStats";
import type { MatchResult } from "../types";
import { clear, h } from "./dom";
import { t } from "../i18n";

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
  const headline = winnerName ? t("result.winner", { team: winnerName }) : t("result.draw");
  const sub =
    result.reason === "surrender"
      ? t("result.surrendered", { team: result.teams[1 - (result.winner ?? 0)]!.name })
      : winnerName
        ? t("result.eliminated")
        : t("result.bothEliminated");

  const row = (label: string, va: string, vb: string): HTMLElement =>
    h("tr", {}, h("th", { text: label, scope: "row" } as never), h("td", { class: "num", text: va }), h("td", { class: "num", text: vb }));

  const ladderNote = result.teams.some((team) => team.controller.kind === "human")
    ? t("result.saved")
    : t("result.notSaved");

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
            row(t("result.shots"), String(a.stats.shotsFired), String(b.stats.shotsFired)),
            row(t("result.hits"), String(a.stats.shotsHit), String(b.stats.shotsHit)),
            row(t("result.accuracy"), pct(accuracyOf(a.stats)), pct(accuracyOf(b.stats))),
            row(t("result.damageDealt"), String(a.stats.damageDealt), String(b.stats.damageDealt)),
            row(t("result.damageTaken"), String(a.stats.damageTaken), String(b.stats.damageTaken)),
            row(t("result.wormsLeft"), String(a.wormsAlive), String(b.wormsAlive)),
          ),
        ),
      ),
      h("p", { class: "muted small", text: t("result.info", { duration: formatDuration(result.durationSeconds), seed: result.mapSeed, note: ladderNote }) }),
      h(
        "div",
        { class: "row" },
        h("button", { class: "btn btn-primary", type: "button", text: t("result.rematch"), onclick: opts.onRematch }),
        h("button", { class: "btn", type: "button", text: t("result.ladder"), onclick: opts.onLadder }),
        h("button", { class: "btn", type: "button", text: t("result.menu"), onclick: opts.onMenu }),
      ),
    ),
  );
  return () => clear(root);
}

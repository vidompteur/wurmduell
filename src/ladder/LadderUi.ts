import { clear, confirmDialog, h, promptDialog } from "../ui/dom";
import type { LadderStore } from "./LadderStore";
import { accuracy, winRate } from "./LadderStore";

const pct = (v: number): string =>
  `${(v * 100).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} %`;

export interface LadderUiOptions {
  onBack(): void;
}

/** Rangliste der lokalen Ladder. Gibt eine Aufräumfunktion zurück. */
export function renderLadder(root: HTMLElement, store: LadderStore, opts: LadderUiOptions): () => void {
  const body = h("div", { class: "ladder-body" });

  const draw = (): void => {
    clear(body);
    const entries = store.entries();
    if (entries.length === 0) {
      body.append(
        h("p", { class: "muted", text: "Noch keine Partien gespielt. Sobald ein Match beendet ist, erscheint hier die Rangliste." }),
      );
      return;
    }
    const head = ["Rang", "Name", "Siege", "Niederlagen", "Matches", "Winrate", "Zielgenauigkeit", "Schaden", "Beste Serie"];
    const rows = entries.map((e, i) =>
      h(
        "tr",
        {},
        h("td", { class: "num rank", text: String(i + 1) }),
        h(
          "td",
          { class: "name" },
          h("span", { text: e.name }),
          h("button", {
            class: "icon-btn",
            type: "button",
            title: "Umbenennen",
            text: "✎",
            onclick: () => void rename(e.playerId, e.name),
          }),
        ),
        h("td", { class: "num", text: String(e.wins) }),
        h("td", { class: "num", text: String(e.losses) }),
        h("td", { class: "num", text: String(e.matches) }),
        h("td", { class: "num", text: pct(winRate(e)) }),
        h("td", { class: "num", text: pct(accuracy(e)) }),
        h("td", { class: "num", text: String(e.damageDealt) }),
        h("td", { class: "num", text: String(e.bestWinStreak) }),
      ),
    );
    body.append(
      h(
        "div",
        { class: "table-wrap" },
        h("table", { class: "table" }, h("thead", {}, h("tr", {}, ...head.map((t) => h("th", { text: t })))), h("tbody", {}, ...rows)),
      ),
    );
  };

  const rename = async (playerId: string, current: string): Promise<void> => {
    const name = await promptDialog("Neuer Anzeigename (die Spieler-ID bleibt gleich):", current);
    if (name === null || name === current) return;
    if (!store.renamePlayer(playerId, name)) {
      await confirmDialog("Dieser Name ist bereits vergeben.", "OK", "Schließen");
      return;
    }
    draw();
  };

  const reset = async (): Promise<void> => {
    const ok = await confirmDialog(
      "Ladder wirklich zurücksetzen? Alle gespeicherten Siege, Niederlagen und Statistiken gehen verloren.",
      "Zurücksetzen",
    );
    if (ok) {
      store.reset();
      draw();
    }
  };

  draw();
  root.append(
    h(
      "section",
      { class: "panel wide" },
      h("h2", { text: "Ladder" }),
      h("p", { class: "muted", text: "Sortiert nach Siegen, dann Zielgenauigkeit, dann verursachtem Schaden. Gespeichert wird nur auf diesem Gerät." }),
      body,
      h(
        "div",
        { class: "row" },
        h("button", { class: "btn", type: "button", text: "Zurück zum Menü", onclick: opts.onBack }),
        h("button", { class: "btn btn-danger", type: "button", text: "Ladder zurücksetzen", onclick: () => void reset() }),
      ),
    ),
  );
  return () => clear(root);
}

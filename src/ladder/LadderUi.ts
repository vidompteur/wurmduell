import { clear, confirmDialog, h, promptDialog } from "../ui/dom";
import type { LadderStore } from "./LadderStore";
import { accuracy, winRate } from "./LadderStore";
import { loadGlobalLadder } from "./globalLadderClient";
import type { LadderEntry } from "../types";

const pct = (v: number): string =>
  `${(v * 100).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} %`;

export interface LadderUiOptions {
  onBack(): void;
}

/** Rangliste der lokalen Ladder. Gibt eine Aufräumfunktion zurück. */
export function renderLadder(root: HTMLElement, store: LadderStore, opts: LadderUiOptions): () => void {
  const body = h("div", { class: "ladder-body" });

  type Tab = "local" | "global";
  let tab: Tab = "local";

  const table = (entries: readonly LadderEntry[], canRename: boolean): HTMLElement => {
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
          canRename
            ? h("button", {
                class: "icon-btn",
                type: "button",
                title: "Umbenennen",
                text: "✎",
                onclick: () => void rename(e.playerId, e.name),
              })
            : "",
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
    return h(
      "div",
      { class: "table-wrap" },
      h("table", { class: "table" }, h("thead", {}, h("tr", {}, ...head.map((t) => h("th", { text: t })))), h("tbody", {}, ...rows)),
    );
  };

  const drawLocal = (): void => {
    const entries = store.entries();
    if (entries.length === 0) {
      body.append(
        h("p", { class: "muted", text: "Noch keine Partien gespielt. Sobald ein Match beendet ist, erscheint hier die Rangliste." }),
      );
      return;
    }
    body.append(table(entries, true));
  };

  const drawGlobal = (): void => {
    const status = h("p", { class: "muted", text: "Lade globale Ladder …" });
    body.append(status);
    void loadGlobalLadder().then(
      (file) => {
        if (tab !== "global") return;
        status.remove();
        if (file.entries.length === 0) {
          body.append(h("p", { class: "muted", text: "Die globale Ladder ist noch leer. Sie wird regelmäßig aus den Ladder-Daten angemeldeter Spieler erzeugt." }));
          return;
        }
        body.append(table(file.entries, false));
        const when = file.updatedAt ? new Date(file.updatedAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "unbekannt";
        body.append(h("p", { class: "muted small", text: `Stand: ${when} · wird stündlich aus den öffentlichen Ladder-Daten der Spieler aktualisiert.` }));
      },
      () => {
        if (tab !== "global") return;
        status.textContent = "Die globale Ladder ist gerade nicht erreichbar.";
      },
    );
  };

  const draw = (): void => {
    clear(body);
    if (tab === "global") drawGlobal();
    else drawLocal();
    tabs.local.classList.toggle("active", tab === "local");
    tabs.global.classList.toggle("active", tab === "global");
    resetButton.hidden = tab !== "local";
    intro.textContent =
      tab === "local"
        ? "Sortiert nach Siegen, dann Zielgenauigkeit, dann verursachtem Schaden. Gespeichert wird nur auf diesem Gerät."
        : "Alle Spieler, die sich angemeldet haben und teilnehmen. Gleiche Sortierung wie lokal.";
  };

  const tabBtn = (id: Tab, text: string): HTMLButtonElement =>
    h("button", {
      class: "tab",
      type: "button",
      text,
      onclick: () => {
        tab = id;
        draw();
      },
    });
  const tabs = { local: tabBtn("local", "Lokal"), global: tabBtn("global", "Global") };
  const intro = h("p", { class: "muted" });
  const resetButton = h("button", { class: "btn btn-danger", type: "button", text: "Ladder zurücksetzen", onclick: () => void reset() });

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
      h("div", { class: "tabs" }, tabs.local, tabs.global),
      intro,
      body,
      h(
        "div",
        { class: "row" },
        h("button", { class: "btn", type: "button", text: "Zurück zum Menü", onclick: opts.onBack }),
        resetButton,
      ),
    ),
  );
  return () => clear(root);
}

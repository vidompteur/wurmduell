import { clear, confirmDialog, h, promptDialog } from "../ui/dom";
import type { LadderStore } from "./LadderStore";
import { accuracy, winRate } from "./LadderStore";
import { loadGlobalLadder } from "./globalLadderClient";
import { lastPlayed } from "./format";
import { profileUrl } from "./profileLink";
import type { LadderEntry } from "../types";
import { t } from "../i18n";

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

  /** Name als Link zum Profil (Handle oder DID); ohne gültigen Link nur Text. */
  const profileLink = (e: LadderEntry & { handle?: string | null }): HTMLElement => {
    const url = profileUrl(e.handle ?? e.playerId);
    if (!url) return h("span", { text: e.name });
    const a = h("a", { text: e.name, title: t("ladder.profileLink", { name: e.name }) });
    a.setAttribute("href", url);
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
    return a;
  };

  const table = (entries: readonly (LadderEntry & { handle?: string | null })[], canRename: boolean, link = false): HTMLElement => {
    const head = ["rank", "name", "wins", "losses", "matches", "winrate", "accuracy", "damage", "streak", "last"].map((c) => t(`ladder.col.${c}`));
    const rows = entries.map((e, i) =>
      h(
        "tr",
        {},
        h("td", { class: "num rank", text: String(i + 1) }),
        h(
          "td",
          { class: "name" },
          link ? profileLink(e) : h("span", { text: e.name }),
          canRename
            ? h("button", {
                class: "icon-btn",
                type: "button",
                title: t("ladder.rename"),
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
        h("td", { class: "num when", text: lastPlayed(e.updatedAt) }),
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
        h("p", { class: "muted", text: t("ladder.empty") }),
      );
      return;
    }
    body.append(table(entries, true));
  };

  const drawGlobal = (): void => {
    const status = h("p", { class: "muted", text: t("ladder.global.loading") });
    body.append(status);
    void loadGlobalLadder().then(
      (file) => {
        if (tab !== "global") return;
        status.remove();
        if (file.entries.length === 0) {
          body.append(h("p", { class: "muted", text: t("ladder.global.empty") }));
          return;
        }
        body.append(table(file.entries, false, true));
        const when = file.updatedAt ? new Date(file.updatedAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : t("ladder.global.unknownDate");
        body.append(h("p", { class: "muted small", text: t("ladder.global.updated", { when }) }));
      },
      () => {
        if (tab !== "global") return;
        status.textContent = t("ladder.global.unavailable");
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
        ? t("ladder.intro.local")
        : t("ladder.intro.global");
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
  const tabs = { local: tabBtn("local", t("ladder.tab.local")), global: tabBtn("global", t("ladder.tab.global")) };
  const intro = h("p", { class: "muted" });
  const resetButton = h("button", { class: "btn btn-danger", type: "button", text: t("ladder.reset"), onclick: () => void reset() });

  const rename = async (playerId: string, current: string): Promise<void> => {
    const name = await promptDialog(t("ladder.renamePrompt"), current);
    if (name === null || name === current) return;
    if (!store.renamePlayer(playerId, name)) {
      await confirmDialog(t("ladder.nameTaken"), t("dialog.ok"), t("dialog.close"));
      return;
    }
    draw();
  };

  const reset = async (): Promise<void> => {
    const ok = await confirmDialog(
      t("ladder.resetConfirm"),
      t("ladder.resetAction"),
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
      h("h2", { text: t("ladder.title") }),
      h("div", { class: "tabs" }, tabs.local, tabs.global),
      intro,
      body,
      h(
        "div",
        { class: "row" },
        h("button", { class: "btn", type: "button", text: t("common.backToMenu"), onclick: opts.onBack }),
        resetButton,
      ),
    ),
  );
  return () => clear(root);
}

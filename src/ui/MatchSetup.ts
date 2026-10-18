import type { AccountView } from "../atproto/Account";
import { CONFIG } from "../config";
import type { LadderStore } from "../ladder/LadderStore";
import type { AiLevel, MatchConfig, MatchMode, Settings, TeamConfig } from "../types";
import { clear, h } from "./dom";
import { saveSettings } from "./settings";
import { t, tList } from "../i18n";


function shuffled<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Würfelt pro Team eigene Wurmnamen. */
export function pickWormNames(): [string[], string[]] {
  const names = shuffled(tList("setup.wormNames"));
  return [names.slice(0, 3), names.slice(3, 6)];
}

export interface SetupOptions {
  store: LadderStore;
  settings: Settings;
  /** Angemeldetes ATProto-Konto (dann ist Spieler 1 daran gebunden). */
  account: AccountView;
  onStart(config: MatchConfig): void;
  onBack(): void;
}

/** Match-Setup: Modus, KI-Stärke, Teamgröße, Spielernamen. */
export function renderSetup(root: HTMLElement, opts: SetupOptions): () => void {
  const last = opts.settings.lastSetup;
  const known = h("datalist", { id: "known-players" });
  for (const p of opts.store.players()) known.append(h("option", { value: p.name }));

  const mode = h("select", { id: "mode", class: "input" },
    h("option", { value: "vsAi", text: t("setup.mode.vsAi") }),
    h("option", { value: "hotseat", text: t("setup.mode.hotseat") }),
  );
  mode.value = last.mode;

  const ai = h("select", { id: "ai", class: "input" },
    ...(["easy", "normal", "hard"] as const).map((l) => h("option", { value: l, text: t(`setup.ai.${l}`) })),
  );
  ai.value = last.aiLevel;

  const size = h("select", { id: "size", class: "input" },
    h("option", { value: "2", text: t("setup.teamSize.2") }),
    h("option", { value: "3", text: t("setup.teamSize.3") }),
  );
  size.value = String(last.wormsPerTeam);

  const teleports = h("select", { id: "teleports", class: "input" },
    ...Array.from({ length: CONFIG.rules.teleportsMax + 1 }, (_, n) =>
      h("option", { value: String(n), text: n === 0 ? t("setup.teleports.0") : n === 1 ? t("setup.teleports.1") : t("setup.teleports.n", { n }) }),
    ),
  );
  teleports.value = String(last.teleports);

  const account = opts.account.did ? opts.account : null;
  const pure = h("input", { id: "pure", type: "checkbox", checked: last.pure });
  const pureField = h(
    "div",
    { class: "field check" },
    pure,
    h("label", { htmlFor: "pure", text: t("setup.pure") }),
  );
  const syncPure = (): void => {
    teleports.disabled = pure.checked;
  };
  pure.addEventListener("change", syncPure);
  syncPure();

  const name1 = h("input", { id: "name1", class: "input", type: "text", maxLength: 64, value: account ? `@${account.handle ?? account.did}` : last.names[0], list: "known-players", autocomplete: "off" });
  if (account) name1.readOnly = true;
  const name2 = h("input", { id: "name2", class: "input", type: "text", maxLength: 20, value: last.names[1], list: "known-players", autocomplete: "off" });
  const error = h("p", { class: "error", role: "alert" } as never);

  const aiField = h("div", { class: "field" }, h("label", { htmlFor: "ai", text: t("setup.aiLevel") }), ai);
  const name2Field = h("div", { class: "field" }, h("label", { htmlFor: "name2", text: t("setup.player2") }), name2);

  const sync = (): void => {
    const vsAi = mode.value === "vsAi";
    aiField.hidden = !vsAi;
    name2Field.hidden = vsAi;
  };
  mode.addEventListener("change", sync);
  sync();

  const start = (ev: Event): void => {
    ev.preventDefault();
    const m = mode.value as MatchMode;
    const n1 = name1.value.trim();
    let n2 = name2.value.trim();
    if (!n1) return void (error.textContent = t("setup.error.name1"));
    if (m === "hotseat") {
      if (!n2) return void (error.textContent = t("setup.error.name2"));
      if (n1.toLowerCase() === n2.toLowerCase()) return void (error.textContent = t("setup.error.sameNames"));
    }
    const level = ai.value as AiLevel;
    const wormsPerTeam = size.value === "2" ? 2 : 3;
    const teleportCount = Number(teleports.value);
    const [wormsA, wormsB] = pickWormNames();

    const p1 = account ? opts.store.bindAccount(account.did!, account.handle ?? account.did!, ` ${t("account.nameSuffix")}`) : opts.store.resolvePlayer(n1);
    const team1: TeamConfig = { name: p1.name, controller: { kind: "human", playerId: p1.id }, wormNames: wormsA };
    let team2: TeamConfig;
    if (m === "hotseat") {
      const p2 = opts.store.resolvePlayer(n2);
      if (p2.id === p1.id) return void (error.textContent = t("setup.error.sameNames"));
      n2 = p2.name;
      team2 = { name: p2.name, controller: { kind: "human", playerId: p2.id }, wormNames: wormsB };
    } else {
      team2 = { name: t("setup.computerName", { level: t(`setup.ai.${level}`) }), controller: { kind: "ai", level }, wormNames: wormsB };
    }

    opts.settings.lastSetup = { mode: m, aiLevel: level, wormsPerTeam, teleports: teleportCount, pure: pure.checked, names: [account ? last.names[0] : p1.name, n2 || last.names[1]] };
    saveSettings(opts.settings);
    opts.onStart({ mode: m, wormsPerTeam, teleports: teleportCount, pure: pure.checked, teams: [team1, team2] });
  };

  const help = h(
    "details",
    { class: "help" },
    h("summary", { text: t("help.title") }),
    h(
      "ul",
      {},
      h("li", { text: t("help.move") }),
      h("li", { text: t("help.aim") }),
      h("li", { text: t("help.fire") }),
      h("li", { text: t("help.weapons") }),
      h("li", { text: t("help.camera") }),
      h("li", { text: t("help.size") }),
      h("li", { text: t("help.pause") }),
    ),
  );

  root.append(
    h(
      "section",
      { class: "panel" },
      h("h2", { text: t("setup.title") }),
      h(
        "form",
        { onsubmit: start, class: "form" },
        h("div", { class: "field" }, h("label", { htmlFor: "mode", text: t("setup.mode") }), mode),
        aiField,
        h("div", { class: "field" }, h("label", { htmlFor: "size", text: t("setup.teamSize") }), size),
        pureField,
        h("div", { class: "field" }, h("label", { htmlFor: "teleports", text: t("setup.teleports") }), teleports),
        h("div", { class: "field" }, h("label", { htmlFor: "name1", text: account ? t("setup.player1.signedIn") : t("setup.player1") }), name1),
        name2Field,
        known,
        error,
        h(
          "div",
          { class: "row" },
          h("button", { class: "btn", type: "button", text: t("common.back"), onclick: opts.onBack }),
          h("button", { class: "btn btn-primary", type: "submit", text: t("setup.start") }),
        ),
      ),
      help,
    ),
  );
  return () => clear(root);
}

import { CONFIG } from "../config";
import type { LadderStore } from "../ladder/LadderStore";
import type { AiLevel, MatchConfig, MatchMode, Settings, TeamConfig } from "../types";
import { clear, h } from "./dom";
import { saveSettings } from "./settings";

const WORM_NAMES = [
  "Schlängel", "Ringelrudi", "Kriecher", "Würmchen", "Bohrer", "Glibber", "Madame Made", "Sir Ringel",
  "Dr. Humus", "Käpt'n Kompost", "Borstenbert", "Lurchi", "Tunnelheinz", "Fräulein Furche", "Erdi", "Wuppdi",
];

const AI_LABEL: Record<AiLevel, string> = { easy: "Einfach", normal: "Normal", hard: "Schwer" };

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
  const names = shuffled(WORM_NAMES);
  return [names.slice(0, 3), names.slice(3, 6)];
}

export interface SetupOptions {
  store: LadderStore;
  settings: Settings;
  onStart(config: MatchConfig): void;
  onBack(): void;
}

/** Match-Setup: Modus, KI-Stärke, Teamgröße, Spielernamen. */
export function renderSetup(root: HTMLElement, opts: SetupOptions): () => void {
  const last = opts.settings.lastSetup;
  const known = h("datalist", { id: "known-players" });
  for (const p of opts.store.players()) known.append(h("option", { value: p.name }));

  const mode = h("select", { id: "mode", class: "input" },
    h("option", { value: "vsAi", text: "Gegen Computer" }),
    h("option", { value: "hotseat", text: "Hotseat (2 Spieler)" }),
  );
  mode.value = last.mode;

  const ai = h("select", { id: "ai", class: "input" },
    ...(["easy", "normal", "hard"] as const).map((l) => h("option", { value: l, text: AI_LABEL[l] })),
  );
  ai.value = last.aiLevel;

  const size = h("select", { id: "size", class: "input" },
    h("option", { value: "2", text: "2 Würmer pro Team" }),
    h("option", { value: "3", text: "3 Würmer pro Team" }),
  );
  size.value = String(last.wormsPerTeam);

  const teleports = h("select", { id: "teleports", class: "input" },
    ...Array.from({ length: CONFIG.rules.teleportsMax + 1 }, (_, n) =>
      h("option", { value: String(n), text: n === 0 ? "Keine Teleports" : n === 1 ? "1 Teleport pro Team" : `${n} Teleports pro Team` }),
    ),
  );
  teleports.value = String(last.teleports);

  const name1 = h("input", { id: "name1", class: "input", type: "text", maxLength: 20, value: last.names[0], list: "known-players", autocomplete: "off" });
  const name2 = h("input", { id: "name2", class: "input", type: "text", maxLength: 20, value: last.names[1], list: "known-players", autocomplete: "off" });
  const error = h("p", { class: "error", role: "alert" } as never);

  const aiField = h("div", { class: "field" }, h("label", { htmlFor: "ai", text: "KI-Stärke" }), ai);
  const name2Field = h("div", { class: "field" }, h("label", { htmlFor: "name2", text: "Spieler 2" }), name2);

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
    if (!n1) return void (error.textContent = "Bitte gib einen Namen für Spieler 1 ein.");
    if (m === "hotseat") {
      if (!n2) return void (error.textContent = "Bitte gib einen Namen für Spieler 2 ein.");
      if (n1.toLowerCase() === n2.toLowerCase()) return void (error.textContent = "Die beiden Spieler brauchen verschiedene Namen.");
    }
    const level = ai.value as AiLevel;
    const wormsPerTeam = size.value === "2" ? 2 : 3;
    const teleportCount = Number(teleports.value);
    const [wormsA, wormsB] = pickWormNames();

    const p1 = opts.store.resolvePlayer(n1);
    const team1: TeamConfig = { name: p1.name, controller: { kind: "human", playerId: p1.id }, wormNames: wormsA };
    let team2: TeamConfig;
    if (m === "hotseat") {
      const p2 = opts.store.resolvePlayer(n2);
      n2 = p2.name;
      team2 = { name: p2.name, controller: { kind: "human", playerId: p2.id }, wormNames: wormsB };
    } else {
      team2 = { name: `Computer (${AI_LABEL[level]})`, controller: { kind: "ai", level }, wormNames: wormsB };
    }

    opts.settings.lastSetup = { mode: m, aiLevel: level, wormsPerTeam, teleports: teleportCount, names: [p1.name, n2 || last.names[1]] };
    saveSettings(opts.settings);
    opts.onStart({ mode: m, wormsPerTeam, teleports: teleportCount, teams: [team1, team2] });
  };

  const help = h(
    "details",
    { class: "help" },
    h("summary", { text: "Steuerung" }),
    h(
      "ul",
      {},
      h("li", { text: "← → oder A / D: laufen" }),
      h("li", { text: "↑ ↓ oder W / S: Winkel einstellen" }),
      h("li", { text: "Leertaste halten: Stärke aufladen, loslassen: feuern" }),
      h("li", { text: "1–5: Waffe wählen (Teleport: danach auf die Karte klicken)" }),
      h("li", { text: "Mausrad oder + / −: zoomen · Mittel-/Rechtsklick ziehen: Kamera verschieben" }),
      h("li", { text: "Zu klein? Die Standardgröße stellst du unter Einstellungen ein." }),
      h("li", { text: "ESC: Pause" }),
    ),
  );

  root.append(
    h(
      "section",
      { class: "panel" },
      h("h2", { text: "Neues Spiel" }),
      h(
        "form",
        { onsubmit: start, class: "form" },
        h("div", { class: "field" }, h("label", { htmlFor: "mode", text: "Modus" }), mode),
        aiField,
        h("div", { class: "field" }, h("label", { htmlFor: "size", text: "Teamgröße" }), size),
        h("div", { class: "field" }, h("label", { htmlFor: "teleports", text: "Teleports" }), teleports),
        h("div", { class: "field" }, h("label", { htmlFor: "name1", text: "Spieler 1" }), name1),
        name2Field,
        known,
        error,
        h(
          "div",
          { class: "row" },
          h("button", { class: "btn", type: "button", text: "Zurück", onclick: opts.onBack }),
          h("button", { class: "btn btn-primary", type: "submit", text: "Start" }),
        ),
      ),
      help,
    ),
  );
  return () => clear(root);
}

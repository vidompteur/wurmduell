import type { Game } from "../game/Game";
import type { GameEvent } from "../game/GameState";
import { h } from "../ui/dom";
import type { WeaponId } from "../types";
import { WEAPONS, WEAPON_ORDER } from "../weapons/weapons";

export interface HudCallbacks {
  onSelectWeapon(id: WeaponId): void;
  showLegend: boolean;
}

interface TeamChip {
  root: HTMLElement;
  name: HTMLElement;
  fill: HTMLElement;
  count: HTMLElement;
}

interface Slot {
  root: HTMLButtonElement;
  ammo: HTMLElement;
}

/**
 * DOM-Overlay über dem Canvas: Teams, aktiver Wurm, Zugzeit, Wind,
 * Schussstärke und Waffenleiste. Schreibt nur ins DOM, wenn sich Werte ändern.
 */
const LEGEND: ReadonlyArray<readonly [string, string]> = [
  ["← →", "laufen"],
  ["↑ ↓", "zielen"],
  ["Leertaste", "halten = laden, loslassen = feuern"],
  ["1–5", "Waffe"],
  ["+ −", "zoomen"],
  ["Esc", "Pause"],
];

function buildLegend(): HTMLElement {
  const list = h("ul", { class: "legend", title: "Steuerung" });
  for (const [key, text] of LEGEND) list.append(h("li", {}, h("kbd", { text: key }), h("span", { text })));
  return list;
}

export class Hud {
  readonly root: HTMLElement;
  private readonly teams: TeamChip[];
  private readonly timer: HTMLElement;
  private readonly active: HTMLElement;
  private readonly windLeft: HTMLElement;
  private readonly windRight: HTMLElement;
  private readonly windText: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly power: HTMLElement;
  private readonly powerFill: HTMLElement;
  private readonly slots = new Map<WeaponId, Slot>();
  private readonly cache = new Map<string, string>();
  private bannerTimer = 0;

  constructor(
    parent: HTMLElement,
    private readonly game: Game,
    callbacks: HudCallbacks,
  ) {
    const chip = (i: number): TeamChip => {
      const name = h("span", { class: "team-name" });
      const count = h("span", { class: "team-count" });
      const fill = h("i");
      const root = h("div", { class: `team-chip team-${i}` }, h("div", { class: "team-line" }, name, count), h("div", { class: "bar" }, fill));
      return { root, name, fill, count };
    };
    this.teams = [chip(0), chip(1)];
    this.timer = h("div", { class: "timer" });
    this.active = h("div", { class: "active-info" });
    this.windLeft = h("i", { class: "left" });
    this.windRight = h("i", { class: "right" });
    this.windText = h("span", { class: "wind-text" });
    this.banner = h("div", { class: "banner" });
    this.powerFill = h("i");
    this.power = h("div", { class: "power" }, this.powerFill);

    const weapons = h("div", { class: "weapons" });
    for (const id of WEAPON_ORDER) {
      const def = WEAPONS[id];
      const ammo = h("span", { class: "ammo" });
      const btn = h(
        "button",
        {
          class: "slot",
          type: "button",
          title: `${def.name} (Taste ${def.key})`,
          onclick: () => callbacks.onSelectWeapon(id),
        },
        h("span", { class: "key", text: def.key }),
        h("span", { class: "wname", text: def.name }),
        ammo,
      );
      // Leertaste darf einen fokussierten Button nicht „drücken“.
      btn.addEventListener("keydown", (ev) => ev.preventDefault());
      btn.tabIndex = -1;
      this.slots.set(id, { root: btn, ammo });
      weapons.append(btn);
    }

    this.root = h(
      "div",
      { class: "hud" },
      h(
        "div",
        { class: "hud-top" },
        this.teams[0]!.root,
        h("div", { class: "hud-center" }, this.timer, this.active),
        this.teams[1]!.root,
      ),
      h(
        "div",
        { class: "wind" },
        h("span", { class: "wind-label", text: "Wind" }),
        h("div", { class: "wind-bar" }, this.windLeft, this.windRight),
        this.windText,
      ),
      this.banner,
      this.power,
      weapons,
    );
    if (callbacks.showLegend) this.root.append(buildLegend());
    parent.append(this.root);
    this.teams.forEach((t, i) => (t.name.textContent = game.teams[i]!.name));
  }

  handleEvent(e: GameEvent): void {
    if (e.type === "turnStart") {
      const team = this.game.teams[e.team]!;
      const worm = this.game.worms[e.wormId]!;
      this.showBanner(`${team.name}: ${worm.name} ist dran`, e.team);
    }
  }

  showBanner(text: string, team = -1, ms = 2000): void {
    this.banner.textContent = text;
    this.banner.dataset.team = String(team);
    this.banner.classList.add("show");
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.banner.classList.remove("show"), ms);
  }

  update(): void {
    const g = this.game;

    this.teams.forEach((t, i) => {
      const worms = g.teamWorms(i);
      const hp = worms.reduce((sum, w) => sum + (w.alive ? w.hp : 0), 0);
      const pct = Math.round((hp / (worms.length * 100)) * 100);
      this.set(`team${i}`, String(pct), () => (t.fill.style.width = `${pct}%`));
      const alive = worms.filter((w) => w.alive).length;
      this.set(`count${i}`, String(alive), () => (t.count.textContent = `${alive}/${worms.length} 🪱`));
    });

    const worm = g.activeWorm;
    const team = g.activeTeam;
    const human = team.controller.kind === "human";
    this.set("active", `${worm.id}:${worm.hp}:${g.phase}`, () => {
      this.active.textContent = `${worm.name} · ${team.name} · ${worm.hp} HP`;
      this.active.dataset.team = String(team.index);
    });

    let time: string;
    if (g.phase === "turn") time = String(Math.ceil(g.turns.timeLeft));
    else if (g.phase === "retreat") time = String(Math.ceil(g.turns.retreatLeft));
    else time = "…";
    this.set("timer", `${time}:${g.phase}`, () => {
      this.timer.textContent = time;
      this.timer.classList.toggle("retreat", g.phase === "retreat");
      this.timer.classList.toggle("low", g.phase === "turn" && g.turns.timeLeft <= 5);
    });

    const w = g.wind;
    this.set("wind", w.toFixed(2), () => {
      this.windLeft.style.width = `${Math.max(0, -w) * 50}%`;
      this.windRight.style.width = `${Math.max(0, w) * 50}%`;
      const strength = Math.round(Math.abs(w) * 10);
      this.windText.textContent = strength === 0 ? "windstill" : `${w < 0 ? "◀" : "▶"} ${strength}`;
    });

    const showPower = g.weapon.chargeable && g.phase === "turn" && g.power > 0;
    this.set("power", `${showPower}:${Math.round(g.power * 100)}`, () => {
      this.power.classList.toggle("show", showPower);
      this.powerFill.style.width = `${Math.round(g.power * 100)}%`;
    });

    for (const id of WEAPON_ORDER) {
      const slot = this.slots.get(id)!;
      const def = WEAPONS[id];
      const left = team.ammo[id];
      const selected = team.selectedWeapon === id;
      let ammo: string;
      if (id === "shotgun" && selected) ammo = `×${g.shotsLeft}`;
      else ammo = Number.isFinite(left) ? `×${left}` : "∞";
      const disabled = left <= 0 || g.phase !== "turn" || !human;
      this.set(`slot:${id}`, `${ammo}:${selected}:${disabled}`, () => {
        slot.ammo.textContent = ammo;
        slot.root.classList.toggle("selected", selected);
        slot.root.classList.toggle("locked", disabled);
        slot.root.title = `${def.name} (Taste ${def.key})`;
      });
    }
  }

  dispose(): void {
    window.clearTimeout(this.bannerTimer);
    this.root.remove();
  }

  private set(key: string, signature: string, apply: () => void): void {
    if (this.cache.get(key) === signature) return;
    this.cache.set(key, signature);
    apply();
  }
}

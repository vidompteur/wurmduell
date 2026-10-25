import { Bot } from "../ai/Bot";
import type { Sound } from "../audio/Sound";
import { InputController } from "../input/InputController";
import type { LadderStore } from "../ladder/LadderStore";
import { Game, IDLE_INPUT } from "../game/Game";
import { GameLoop } from "../game/GameLoop";
import type { GameEvent } from "../game/GameState";
import { hashSeed, mulberry32, randomSeed } from "../game/rng";
import { Hud } from "../render/Hud";
import { PerfOverlay } from "./PerfOverlay";
import { Renderer } from "../render/Renderer";
import { generateMap } from "../terrain/MapGenerator";
import type { InputState, MatchConfig, MatchResult } from "../types";
import { clear, confirmDialog, h } from "./dom";
import { t } from "../i18n";

export interface MatchScreenOptions {
  config: MatchConfig;
  store: LadderStore;
  sound: Sound;
  /** Start-Zoom in Bildschirm-Pixeln pro Welt-Pixel (siehe Einstellungen). */
  zoom: number;
  /** Steuerungs-Legende einblenden. */
  showLegend: boolean;
  /** Ergebnis wurde soeben in der lokalen Ladder gespeichert (auch bei Abbruch/Aufgabe). */
  onRecorded?(result: MatchResult): void;
  /** Partie regulär beendet (Ergebnis ist bereits in der Ladder gespeichert). */
  onFinish(result: MatchResult): void;
  /** Spieler verlässt die Partie (zählt als Aufgabe; Ergebnis ist bereits in der Ladder). */
  onExit(): void;
}

export interface MatchHandle {
  game: Game;
  dispose(): void;
}

/**
 * Baut den Match-Bildschirm auf und verbindet Spiellogik, Rendering, Eingabe,
 * KI, HUD und Sound. `dispose()` räumt Listener, Timer und Canvas-Ressourcen auf.
 */
export function showMatch(root: HTMLElement, opts: MatchScreenOptions): MatchHandle {
  const seed = opts.config.seed ?? randomSeed();
  const map = generateMap(seed);
  map.terrain.attachCanvas();
  const rng = mulberry32(hashSeed(`${seed}:game`));

  const canvas = h("canvas", { class: "game-canvas" });
  const stage = h("div", { class: "stage" }, canvas);
  root.append(stage);

  let renderer: Renderer;
  let hud: Hud;
  let finishTimer = 0;
  let disposed = false;
  /** Spieler verlässt die Partie: Aufgabe wird gewertet, aber kein Ergebnisbildschirm gezeigt. */
  let leaving = false;

  const onEvent = (e: GameEvent): void => {
    renderer?.handleEvent(e);
    hud?.handleEvent(e);
    opts.sound.handleEvent(e);
    if (e.type === "matchEnd") {
      // Ladder sofort speichern, danach kurz das Ergebnis wirken lassen.
      opts.store.recordResult(e.result);
      opts.onRecorded?.(e.result);
      if (leaving) return;
      const winner = e.result.winner === null ? t("match.draw") : t("match.winner", { team: e.result.teams[e.result.winner]!.name });
      hud?.showBanner(winner, e.result.winner ?? -1, 3000);
      finishTimer = window.setTimeout(() => {
        if (!disposed) opts.onFinish(e.result);
      }, 2600);
    }
  };

  const game = new Game({ ...opts.config, seed }, rng, map, onEvent);
  renderer = new Renderer(canvas, game);
  hud = new Hud(stage, game, { onSelectWeapon: (id) => selectWeapon(id), showLegend: opts.showLegend });

  const bots = game.teams.map((t) => (t.controller.kind === "ai" ? new Bot(t.controller.level, rng) : null));
  const isHumanTurn = (): boolean => game.activeTeam.controller.kind === "human";

  const selectWeapon = (id: Parameters<Game["selectWeapon"]>[0]): void => {
    if (paused || !isHumanTurn()) return;
    game.selectWeapon(id);
  };

  const input = new InputController(canvas, renderer.camera, {
    onSelectWeapon: selectWeapon,
    onWorldClick: (x, y) => {
      if (paused || !isHumanTurn()) return;
      game.teleportTo(x, y);
    },
    onPauseToggle: () => togglePause(),
  });

  // ------------------------------------------------------------------ Pause
  let paused = false;
  let pauseOverlay: HTMLElement | null = null;
  let dialogOpen = false;

  const humanTeam = (): number => {
    if (isHumanTurn()) return game.activeTeam.index;
    const human = game.teams.find((t) => t.controller.kind === "human");
    return human ? human.index : game.activeTeam.index;
  };

  const closePause = (): void => {
    pauseOverlay?.remove();
    pauseOverlay = null;
    paused = false;
    loop.paused = false;
  };

  const togglePause = (): void => {
    if (game.over || dialogOpen) return;
    if (paused) {
      closePause();
      return;
    }
    paused = true;
    loop.paused = true;
    const ask = async (message: string, label: string, action: () => void): Promise<void> => {
      dialogOpen = true;
      const ok = await confirmDialog(message, label);
      dialogOpen = false;
      if (ok) action();
    };
    pauseOverlay = h(
      "div",
      { class: "overlay" },
      h(
        "div",
        { class: "dialog" },
        h("h2", { text: t("pause.title") }),
        h(
          "div",
          { class: "stack" },
          h("button", { class: "btn btn-primary", type: "button", text: t("pause.resume"), onclick: closePause }),
          h("button", {
            class: "btn",
            type: "button",
            text: t("pause.surrender"),
            onclick: () =>
              void ask(t("pause.surrenderConfirm"), t("pause.surrender"), () => {
                closePause();
                game.surrender(humanTeam());
              }),
          }),
          h("button", {
            class: "btn",
            type: "button",
            text: t("pause.toMenu"),
            onclick: () =>
              void ask(t("pause.toMenuConfirm"), t("pause.toMenuAction"), () => {
                // Wie Aufgeben: der aktive Mensch verliert, danach direkt ins Menü.
                leaving = true;
                game.surrender(humanTeam());
                opts.onExit();
              }),
          }),
        ),
      ),
    );
    stage.append(pauseOverlay);
  };

  // ------------------------------------------------------------------ Loop
  const perf = new URLSearchParams(location.search).has("perf") ? new PerfOverlay() : null;
  if (perf) stage.append(perf.el);
  let updateMs = 0;
  const update = (dt: number): void => {
    const t0 = perf ? performance.now() : 0;
    let state: InputState = IDLE_INPUT;
    if (!game.over) {
      const bot = bots[game.turns.activeTeam];
      state = bot ? bot.update(game) : input.state();
    }
    game.input = state;
    game.tick(dt);
    if (perf) updateMs += performance.now() - t0;
  };

  const render = (frameDt: number, alpha: number): void => {
    const t0 = perf ? performance.now() : 0;
    renderer.adaptQuality(frameDt);
    renderer.updateEffects(frameDt);
    const f = renderer.focusPoint();
    renderer.camera.follow(f.x, f.y, frameDt);
    renderer.render(alpha);
    hud.update();
    if (perf) {
      perf.frame(frameDt * 1000, updateMs, performance.now() - t0, canvas, renderer.dpr);
      updateMs = 0;
    }
  };

  const loop = new GameLoop(update, render);

  // Browser/Tab geschlossen oder Seite neu geladen: Partie wird gewertet.
  // pagehide ist dafür zuverlässiger als beforeunload; localStorage schreibt synchron.
  const onPageHide = (): void => {
    if (game.over || disposed) return;
    leaving = true;
    game.abandon(humanTeam());
  };
  window.addEventListener("pagehide", onPageHide);

  const onResize = (): void => renderer.resize();
  window.addEventListener("resize", onResize);
  renderer.resize();
  // Zoom ist in CSS-Pixeln gemeint: auf Retina-Displays entsprechend mehr Canvas-Pixel.
  renderer.camera.zoom = Math.max(renderer.camera.minZoom, opts.zoom * renderer.dpr);
  const first = renderer.focusPoint();
  renderer.camera.snapTo(first.x, first.y);
  loop.start();

  return {
    game,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      window.clearTimeout(finishTimer);
      loop.stop();
      input.dispose();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pagehide", onPageHide);
      hud.dispose();
      pauseOverlay?.remove();
      game.terrain.dispose();
      clear(root);
    },
  };
}

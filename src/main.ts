import "./styles.css";
import { Account } from "./atproto/Account";
import { initTelemetry, logMatch, logMatchStart } from "./telemetry";
import { Sound } from "./audio/Sound";
import { LadderStore } from "./ladder/LadderStore";
import { renderLadder } from "./ladder/LadderUi";
import { renderMenu, renderSettings } from "./ui/Menu";
import { renderSetup } from "./ui/MatchSetup";
import { showMatch } from "./ui/MatchScreen";
import type { MatchHandle } from "./ui/MatchScreen";
import { showMobileNoticeIfNeeded } from "./ui/MobileNotice";
import { renderResult } from "./ui/ResultScreen";
import { loadSettings } from "./ui/settings";
import type { AiLevel, MatchConfig, MatchResult } from "./types";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app fehlt");

const store = new LadderStore();
const settings = loadSettings();
const sound = new Sound(settings);
const account = new Account(store);

// Browser erlauben Audio erst nach einer Geste.
const unlock = (): void => sound.unlock();
window.addEventListener("pointerdown", unlock, { once: true });
window.addEventListener("keydown", unlock, { once: true });

let teardown: (() => void) | null = null;

function show(screen: () => () => void, cls = ""): void {
  teardown?.();
  app!.className = cls;
  teardown = screen();
}

function toMenu(): void {
  show(() => renderMenu(app!, { newGame: toSetup, ladder: toLadder, settings: toSettings }, account), "screen");
}

function toSetup(): void {
  show(() => renderSetup(app!, { store, settings, account: account.view(), onStart: toMatch, onBack: toMenu }), "screen");
}

function toLadder(): void {
  show(() => renderLadder(app!, store, { onBack: toMenu }), "screen");
}

function toSettings(): void {
  show(() => renderSettings(app!, settings, sound, toMenu), "screen");
}

let activeMatch: MatchHandle | null = null;

function toMatch(config: MatchConfig): MatchHandle {
  sound.unlock();
  logMatchStart(config);
  let handle!: MatchHandle;
  show(() => {
    handle = showMatch(app!, {
      config,
      store,
      sound,
      zoom: settings.zoom,
      showLegend: settings.showLegend,
      onRecorded: (result) => {
        account.onMatchFinished(result);
        logMatch(result);
      },
      onFinish: (result) => toResult(result, config),
      onExit: toMenu,
    });
    activeMatch = handle;
    return () => {
      handle.dispose();
      if (activeMatch === handle) activeMatch = null;
    };
  }, "match");
  return handle;
}

function toResult(result: MatchResult, config: MatchConfig): void {
  show(
    () =>
      renderResult(app!, result, {
        // Revanche: gleiche Teams, neue zufällige Karte.
        onRematch: () => toMatch({ ...config, seed: undefined }),
        onLadder: toLadder,
        onMenu: toMenu,
      }),
    "screen",
  );
}

toMenu();
showMobileNoticeIfNeeded();
// Optionales ATProto-Konto im Hintergrund wiederherstellen; das Spiel startet unabhängig davon.
void account.restore();
initTelemetry();

// Debug-/Testzugang nur mit ?debug in der URL.
if (new URLSearchParams(location.search).has("debug")) {
  const names: [string[], string[]] = [["A1", "A2", "A3"], ["B1", "B2", "B3"]];
  (window as unknown as Record<string, unknown>).__wurmduell = {
    store,
    /** Startet eine Partie Computer gegen Computer. */
    startAiMatch(a: AiLevel = "normal", b: AiLevel = "normal", seed?: string): MatchHandle {
      return toMatch({
        mode: "vsAi",
        wormsPerTeam: 3,
        seed,
        teams: [
          { name: `KI ${a}`, controller: { kind: "ai", level: a }, wormNames: names[0] },
          { name: `KI ${b}`, controller: { kind: "ai", level: b }, wormNames: names[1] },
        ],
      });
    },
    get match(): MatchHandle | null {
      return activeMatch;
    },
  };
}

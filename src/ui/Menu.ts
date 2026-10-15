import type { Sound } from "../audio/Sound";
import type { Settings } from "../types";
import { clear, h } from "./dom";
import { saveSettings } from "./settings";

export interface MenuNav {
  newGame(): void;
  ladder(): void;
  settings(): void;
}

const LOGO = `<svg viewBox="0 0 220 110" width="220" height="110" role="img" aria-label="Wurmduell-Logo">
  <path d="M14 92 C40 40, 70 110, 100 68 S160 36, 186 70" fill="none" stroke="#b8607a" stroke-width="26" stroke-linecap="round"/>
  <path d="M14 92 C40 40, 70 110, 100 68 S160 36, 186 70" fill="none" stroke="#f4a6b8" stroke-width="20" stroke-linecap="round"/>
  <circle cx="186" cy="62" r="17" fill="#f4a6b8" stroke="#b8607a" stroke-width="3"/>
  <rect x="170" y="48" width="32" height="8" fill="#ff5d6c"/>
  <circle cx="181" cy="63" r="6" fill="#fff"/><circle cx="194" cy="63" r="5.5" fill="#fff"/>
  <circle cx="183" cy="64" r="2.6" fill="#1b1b2b"/><circle cx="196" cy="64" r="2.4" fill="#1b1b2b"/>
  <rect x="196" y="78" width="34" height="9" rx="2" fill="#4b5a45" transform="rotate(-20 196 78)"/>
</svg>`;

export function renderMenu(root: HTMLElement, nav: MenuNav): () => void {
  const logo = h("div", { class: "logo" });
  logo.innerHTML = LOGO;
  const btn = (text: string, onclick: () => void, primary = false): HTMLButtonElement =>
    h("button", { class: primary ? "btn btn-primary btn-xl" : "btn btn-xl", type: "button", text, onclick });

  root.append(
    h(
      "section",
      { class: "panel menu" },
      logo,
      h("h1", { text: "Wurmduell" }),
      h("p", { class: "muted", text: "Rundenbasierte Wurmschlacht für zwei – oder gegen den Computer." }),
      h(
        "div",
        { class: "stack" },
        btn("Neues Spiel", nav.newGame, true),
        btn("Ladder", nav.ladder),
        btn("Einstellungen", nav.settings),
      ),
    ),
  );
  return () => clear(root);
}

export function renderSettings(root: HTMLElement, settings: Settings, sound: Sound, onBack: () => void): () => void {
  const volumeValue = h("span", { class: "muted", text: `${Math.round(settings.volume * 100)} %` });
  const sync = (): void => {
    saveSettings(settings);
    sound.applyVolume();
  };

  const enabled = h("input", { type: "checkbox", checked: settings.soundEnabled, id: "set-sound" });
  enabled.addEventListener("change", () => {
    settings.soundEnabled = enabled.checked;
    sync();
    sound.unlock();
    sound.uiClick();
  });
  const volume = h("input", { type: "range", min: "0", max: "100", step: "5", value: String(Math.round(settings.volume * 100)), id: "set-volume" });
  volume.addEventListener("input", () => {
    settings.volume = Number(volume.value) / 100;
    volumeValue.textContent = `${volume.value} %`;
    sync();
  });
  volume.addEventListener("change", () => {
    sound.unlock();
    sound.uiClick();
  });

  root.append(
    h(
      "section",
      { class: "panel" },
      h("h2", { text: "Einstellungen" }),
      h("div", { class: "field check" }, enabled, h("label", { htmlFor: "set-sound", text: "Ton aktiviert" })),
      h("div", { class: "field" }, h("label", { htmlFor: "set-volume", text: "Lautstärke" }), volume, volumeValue),
      h("div", { class: "row" }, h("button", { class: "btn", type: "button", text: "Zurück zum Menü", onclick: onBack })),
    ),
  );
  return () => clear(root);
}

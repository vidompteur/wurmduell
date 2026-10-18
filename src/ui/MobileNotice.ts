import { CONFIG } from "../config";
import { h } from "./dom";

/** Touch-Gerät ohne Maus/Tastatur-typische Eingabe (Handy, kleines Tablet). */
export function isTouchOnlyDevice(): boolean {
  try {
    if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) return true;
  } catch {
    /* matchMedia nicht verfügbar */
  }
  return /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
}

/** Zeigt beim Laden auf Handys einen schließbaren Hinweis. Rückgabe: Aufräumfunktion. */
export function showMobileNoticeIfNeeded(): () => void {
  if (!CONFIG.hud.mobileNotice || !isTouchOnlyDevice()) return () => {};
  const close = (): void => overlay.remove();
  const overlay = h(
    "div",
    { class: "overlay mobile-notice" },
    h(
      "div",
      { class: "dialog" },
      h("h2", { text: "Nur für den Desktop" }),
      h("p", { text: "Wurmduell ist für Computer gedacht und braucht eine Tastatur (Pfeiltasten und Leertaste). Auf dem Handy lässt es sich nicht richtig spielen." }),
      h("div", { class: "stack" }, h("button", { class: "btn btn-primary", type: "button", text: "Verstanden", onclick: close })),
    ),
  );
  document.body.append(overlay);
  return close;
}

import { CONFIG } from "../config";
import { h } from "./dom";
import { t } from "../i18n";

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
export const MOBILE_NOTICE_KEY = "wurmduell.mobileNoticeDismissed.v1";

function dismissedForever(): boolean {
  try {
    return localStorage.getItem(MOBILE_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function showMobileNoticeIfNeeded(): () => void {
  if (!CONFIG.hud.mobileNotice || !isTouchOnlyDevice() || dismissedForever()) return () => {};
  const close = (): void => overlay.remove();
  /** „Mir doch egal“: Hinweis schließen und nicht mehr anzeigen. */
  const ignore = (): void => {
    try {
      localStorage.setItem(MOBILE_NOTICE_KEY, "1");
    } catch {
      /* Speicher gesperrt: Hinweis erscheint beim nächsten Laden wieder */
    }
    close();
  };
  const overlay = h(
    "div",
    { class: "overlay mobile-notice" },
    h(
      "div",
      { class: "dialog" },
      h("h2", { text: t("mobile.title") }),
      h("p", { text: t("mobile.text") }),
      h(
        "div",
        { class: "stack" },
        h("button", { class: "btn btn-primary", type: "button", text: t("mobile.ok"), onclick: close }),
        h("button", { class: "btn", type: "button", text: t("mobile.ignore"), onclick: ignore }),
      ),
    ),
  );
  document.body.append(overlay);
  return close;
}

import type { Account, AccountView } from "../atproto/Account";
import { clear, h } from "./dom";

const STATUS_TEXT: Record<AccountView["status"], string> = {
  idle: "",
  syncing: "Synchronisiere …",
  ok: "Ladder synchronisiert",
  error: "Sync fehlgeschlagen",
};

/** Dezenter Login-/Statusbereich im Hauptmenü. Gibt Element und Aufräumfunktion zurück. */
export function createAccountBox(account: Account): { el: HTMLElement; dispose(): void } {
  const el = h("div", { class: "account" });

  const draw = (): void => {
    clear(el);
    const v = account.view();

    if (v.did) {
      el.append(
        h("p", { class: "account-line" }, h("span", { class: "muted", text: "Angemeldet als " }), h("strong", { text: `@${v.handle ?? v.did}` })),
        h(
          "p",
          { class: `account-status ${v.status}`, text: STATUS_TEXT[v.status] },
        ),
      );
      if (v.error) el.append(h("p", { class: "error", text: v.error }));
      el.append(
        h(
          "div",
          { class: "row" },
          v.status === "error" ? h("button", { class: "btn", type: "button", text: "Erneut versuchen", onclick: () => void account.sync() }) : "",
          h("button", { class: "btn", type: "button", text: "Abmelden", onclick: () => void account.signOut() }),
        ),
      );
      return;
    }

    if (!v.available) {
      el.append(h("p", { class: "muted small", text: "Anmeldung mit ATProto/Bluesky (optional): nur auf der veröffentlichten Seite verfügbar." }));
      return;
    }

    const input = h("input", {
      class: "input",
      type: "text",
      id: "login-handle",
      placeholder: "name.bsky.social",
      autocomplete: "username",
    });
    input.setAttribute("autocapitalize", "none");
    input.spellcheck = false;
    const submit = (ev: Event): void => {
      ev.preventDefault();
      void account.signIn(input.value);
    };
    el.append(
      h(
        "details",
        { class: "login" },
        h("summary", { text: "Mit Bluesky / ATProto anmelden (optional)" }),
        h(
          "form",
          { class: "login-form", onsubmit: submit },
          h("label", { htmlFor: "login-handle", class: "muted small", text: "Handle, DID oder PDS-URL" }),
          input,
          h("button", { class: "btn", type: "submit", text: "Anmelden" }),
        ),
        h("p", { class: "muted small", text: "Deine Ladder wird zusätzlich in deinem eigenen PDS gespeichert. Ohne Anmeldung bleibt alles lokal." }),
      ),
    );
    if (v.error) el.append(h("p", { class: "error", text: v.error }));
  };

  draw();
  const unsubscribe = account.subscribe(draw);
  return { el, dispose: unsubscribe };
}

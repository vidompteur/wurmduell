import type { Account, AccountView } from "../atproto/Account";
import { clear, h } from "./dom";
import { t } from "../i18n";

const STATUS_KEY: Record<AccountView["status"], string | null> = {
  idle: null,
  syncing: "account.status.syncing",
  ok: "account.status.ok",
  error: "account.status.error",
};

/** Dezenter Login-/Statusbereich im Hauptmenü. Gibt Element und Aufräumfunktion zurück. */
export function createAccountBox(account: Account): { el: HTMLElement; dispose(): void } {
  const el = h("div", { class: "account" });

  const draw = (): void => {
    clear(el);
    const v = account.view();

    if (v.did) {
      el.append(
        h("p", { class: "account-line" }, h("span", { class: "muted", text: `${t("account.signedInAs")} ` }), h("strong", { text: `@${v.handle ?? v.did}` })),
        h(
          "p",
          { class: `account-status ${v.status}`, text: STATUS_KEY[v.status] ? t(STATUS_KEY[v.status]!) : "" },
        ),
      );
      if (v.error) el.append(h("p", { class: "error", text: v.error }));
      el.append(
        h(
          "div",
          { class: "row" },
          v.status === "error" ? h("button", { class: "btn", type: "button", text: t("account.retry"), onclick: () => void account.sync() }) : "",
          h("button", { class: "btn", type: "button", text: t("account.signOut"), onclick: () => void account.signOut() }),
        ),
      );
      return;
    }

    if (v.retrying) {
      el.append(h("p", { class: "muted small", text: t("account.retrying") }));
      return;
    }

    if (v.issue === "offline") {
      el.append(
        h("p", { class: "error", text: v.error ?? t("account.error.offline") }),
        h("div", { class: "row" }, h("button", { class: "btn", type: "button", text: t("account.retry"), onclick: () => void account.restore() })),
      );
      return;
    }

    if (v.issue === "expired" && v.lastHandle) {
      el.append(
        h("p", { class: "error", text: v.error ?? t("account.error.expired") }),
        h("div", { class: "row" }, h("button", { class: "btn btn-primary", type: "button", text: t("account.reLogin"), onclick: () => void account.signIn(v.lastHandle!) })),
      );
      return;
    }

    if (!v.available) {
      el.append(h("p", { class: "muted small", text: t("account.unavailable") }));
      return;
    }

    const input = h("input", {
      class: "input",
      type: "text",
      id: "login-handle",
      placeholder: t("account.handlePlaceholder"),
      autocomplete: "username",
      value: v.lastHandle ?? "",
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
        { class: "login", open: Boolean(v.error) } as never,
        h("summary", { text: t("account.signInSummary") }),
        h(
          "form",
          { class: "login-form", onsubmit: submit },
          h("label", { htmlFor: "login-handle", class: "muted small", text: t("account.handleLabel") }),
          input,
          h("button", { class: "btn", type: "submit", text: t("account.signIn") }),
        ),
        h("p", { class: "muted small", text: t("account.info") }),
      ),
    );
    if (v.error) el.append(h("p", { class: "error", text: v.error }));
  };

  draw();
  const unsubscribe = account.subscribe(draw);
  return { el, dispose: unsubscribe };
}

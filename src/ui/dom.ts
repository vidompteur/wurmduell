import { t } from "../i18n";

type Child = Node | string | null | undefined | false;
type Props = Partial<{
  class: string;
  id: string;
  text: string;
  type: string;
  value: string;
  name: string;
  placeholder: string;
  title: string;
  checked: boolean;
  disabled: boolean;
  min: string;
  max: string;
  step: string;
  maxLength: number;
  htmlFor: string;
  list: string;
  autocomplete: string;
  onclick: (ev: MouseEvent) => void;
  oninput: (ev: Event) => void;
  onchange: (ev: Event) => void;
  onsubmit: (ev: SubmitEvent) => void;
  onkeydown: (ev: KeyboardEvent) => void;
}> & { dataset?: Record<string, string> };

/** Kleiner Hyperscript-Helfer für Vanilla-DOM. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { dataset, text, class: cls, htmlFor, ...rest } = props;
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  if (htmlFor) el.setAttribute("for", htmlFor);
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2), value as EventListener);
    } else if (key in el) {
      try {
        (el as unknown as Record<string, unknown>)[key] = value;
      } catch {
        // Nur lesbare Properties (z. B. `input.list`) laufen über das Attribut.
        el.setAttribute(key, String(value));
      }
    } else {
      el.setAttribute(key, String(value));
    }
  }
  if (dataset) for (const [k, v] of Object.entries(dataset)) el.dataset[k] = v;
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Modaler Bestätigungsdialog. Löst mit `true`, wenn bestätigt wurde. */
export function confirmDialog(message: string, confirmLabel = t("dialog.ok"), cancelLabel = t("dialog.cancel")): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (value: boolean): void => {
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
      resolve(value);
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        finish(false);
      }
    };
    const cancel = h("button", { class: "btn", type: "button", text: cancelLabel, onclick: () => finish(false) });
    const ok = h("button", { class: "btn btn-danger", type: "button", text: confirmLabel, onclick: () => finish(true) });
    const overlay = h(
      "div",
      { class: "overlay", role: "dialog" } as Props,
      h("div", { class: "dialog" }, h("p", { text: message }), h("div", { class: "row" }, cancel, ok)),
    );
    document.addEventListener("keydown", onKey, true);
    document.body.append(overlay);
    cancel.focus();
  });
}

/** Modaler Texteingabe-Dialog. Löst mit dem Text oder `null` bei Abbruch. */
export function promptDialog(message: string, initial: string, confirmLabel = t("dialog.save")): Promise<string | null> {
  return new Promise((resolve) => {
    const finish = (value: string | null): void => {
      overlay.remove();
      resolve(value);
    };
    const input = h("input", { type: "text", value: initial, maxLength: 24, class: "input" });
    const submit = (): void => finish(input.value.trim() || null);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") submit();
      if (ev.key === "Escape") finish(null);
      ev.stopPropagation();
    });
    const overlay = h(
      "div",
      { class: "overlay" },
      h(
        "div",
        { class: "dialog" },
        h("p", { text: message }),
        input,
        h(
          "div",
          { class: "row" },
          h("button", { class: "btn", type: "button", text: t("dialog.cancel"), onclick: () => finish(null) }),
          h("button", { class: "btn btn-primary", type: "button", text: confirmLabel, onclick: submit }),
        ),
      ),
    );
    document.body.append(overlay);
    input.focus();
    input.select();
  });
}

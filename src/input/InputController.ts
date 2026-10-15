import type { Camera } from "../render/Camera";
import type { InputState, WeaponId } from "../types";

export interface InputCallbacks {
  onSelectWeapon(id: WeaponId): void;
  /** Linksklick auf die Karte (Weltkoordinaten) – für den Teleport. */
  onWorldClick(x: number, y: number): void;
  onPauseToggle(): void;
}

const WEAPON_KEYS: Record<string, WeaponId> = {
  Digit1: "bazooka",
  Digit2: "grenade",
  Digit3: "dynamite",
  Digit4: "shotgun",
  Digit5: "teleport",
  Numpad1: "bazooka",
  Numpad2: "grenade",
  Numpad3: "dynamite",
  Numpad4: "shotgun",
  Numpad5: "teleport",
};

const PREVENT = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/**
 * Tastatur und Maus. Verwaltet alle Listener selbst und entfernt sie in `dispose()`.
 * Tastatur: Pfeile/WASD, Leertaste, 1–5, ESC. Maus: Rad = Zoom,
 * Mittel- oder Rechtsklick ziehen = Kamera, Linksklick = Teleportziel.
 */
export class InputController {
  private readonly down = new Set<string>();
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private readonly cleanups: Array<() => void> = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly callbacks: InputCallbacks,
  ) {
    this.listen(window, "keydown", this.onKeyDown as EventListener);
    this.listen(window, "keyup", this.onKeyUp as EventListener);
    this.listen(window, "blur", this.onBlur);
    this.listen(canvas, "wheel", this.onWheel as EventListener, { passive: false });
    this.listen(canvas, "pointerdown", this.onPointerDown as EventListener);
    this.listen(canvas, "pointermove", this.onPointerMove as EventListener);
    this.listen(canvas, "pointerup", this.onPointerUp as EventListener);
    this.listen(canvas, "pointercancel", this.onPointerUp as EventListener);
    this.listen(canvas, "contextmenu", ((ev: Event) => ev.preventDefault()) as EventListener);
  }

  /** Aktuelle Tasteneingabe als `InputState`. */
  state(): InputState {
    const left = this.down.has("ArrowLeft") || this.down.has("KeyA");
    const right = this.down.has("ArrowRight") || this.down.has("KeyD");
    const up = this.down.has("ArrowUp") || this.down.has("KeyW");
    const downKey = this.down.has("ArrowDown") || this.down.has("KeyS");
    return {
      move: left === right ? 0 : left ? -1 : 1,
      aim: up === downKey ? 0 : up ? 1 : -1,
      charge: this.down.has("Space"),
    };
  }

  dispose(): void {
    for (const fn of this.cleanups) fn();
    this.cleanups.length = 0;
    this.down.clear();
  }

  private listen(
    target: EventTarget,
    type: string,
    handler: EventListener,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options);
    this.cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  private readonly onKeyDown = (ev: KeyboardEvent): void => {
    const target = ev.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    if (PREVENT.has(ev.code)) ev.preventDefault();
    if (ev.code === "Escape") {
      if (!ev.repeat) this.callbacks.onPauseToggle();
      return;
    }
    const weapon = WEAPON_KEYS[ev.code];
    if (weapon) {
      this.callbacks.onSelectWeapon(weapon);
      return;
    }
    this.down.add(ev.code);
  };

  private readonly onKeyUp = (ev: KeyboardEvent): void => {
    this.down.delete(ev.code);
  };

  private readonly onBlur = (): void => {
    this.down.clear();
    this.dragging = false;
  };

  private canvasPoint(ev: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) * this.canvas.width) / Math.max(1, rect.width),
      y: ((ev.clientY - rect.top) * this.canvas.height) / Math.max(1, rect.height),
    };
  }

  private readonly onWheel = (ev: WheelEvent): void => {
    ev.preventDefault();
    const p = this.canvasPoint(ev);
    this.camera.zoomAt(p.x, p.y, Math.exp(-ev.deltaY * 0.0015));
  };

  private readonly onPointerDown = (ev: PointerEvent): void => {
    if (ev.button === 1 || ev.button === 2) {
      ev.preventDefault();
      this.dragging = true;
      this.lastX = ev.clientX;
      this.lastY = ev.clientY;
      this.canvas.setPointerCapture(ev.pointerId);
    } else if (ev.button === 0) {
      const p = this.canvasPoint(ev);
      const w = this.camera.screenToWorld(p.x, p.y);
      this.callbacks.onWorldClick(w.x, w.y);
    }
  };

  private readonly onPointerMove = (ev: PointerEvent): void => {
    if (!this.dragging) return;
    const rect = this.canvas.getBoundingClientRect();
    const scale = this.canvas.width / Math.max(1, rect.width);
    this.camera.pan((ev.clientX - this.lastX) * scale, (ev.clientY - this.lastY) * scale);
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
  };

  private readonly onPointerUp = (ev: PointerEvent): void => {
    if (this.dragging && this.canvas.hasPointerCapture(ev.pointerId)) this.canvas.releasePointerCapture(ev.pointerId);
    this.dragging = false;
  };
}

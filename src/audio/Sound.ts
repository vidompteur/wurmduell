import type { GameEvent } from "../game/GameState";
import type { Settings } from "../types";

type SoundSettings = Pick<Settings, "soundEnabled" | "volume">;

/**
 * Prozedural erzeugte Geräusche über WebAudio – keine Audio-Assets.
 * Der AudioContext wird erst nach einer Benutzeraktion (`unlock`) angelegt.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastExplosion = 0;

  constructor(private readonly settings: SoundSettings) {}

  /** Muss aus einem Klick/Tastendruck aufgerufen werden. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(this.ctx);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.applyVolume();
  }

  /** Nach Änderung der Einstellungen aufrufen. */
  applyVolume(): void {
    if (this.master) this.master.gain.value = this.settings.soundEnabled ? this.settings.volume : 0;
  }

  dispose(): void {
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.master = null;
  }

  handleEvent(e: GameEvent): void {
    if (!this.ready()) return;
    switch (e.type) {
      case "explosion":
        this.explosion(e.radius);
        break;
      case "shoot":
        if (e.weapon === "bazooka") this.whoosh();
        else if (e.weapon === "shotgun") this.bang();
        else this.click(520, 0.06);
        break;
      case "bounce":
        this.click(260, 0.05);
        break;
      case "splash":
        this.noiseBurst(0.35, "highpass", 1500, 4000, 0.22);
        break;
      case "damage":
        this.tone(520, 260, 0.14, "triangle", 0.18);
        break;
      case "died":
        this.tone(360, 80, 0.55, "sawtooth", 0.16);
        break;
      case "countdown":
        this.tone(880, 880, 0.08, "square", 0.08);
        break;
      case "teleport":
        this.tone(250, 1500, 0.35, "sine", 0.2);
        break;
      case "turnStart":
        this.tone(660, 660, 0.12, "sine", 0.12);
        break;
      case "matchEnd":
        this.jingle();
        break;
      default:
        break;
    }
  }

  /** Kurzer Klick für Menüs. */
  uiClick(): void {
    if (this.ready()) this.click(700, 0.04);
  }

  private ready(): boolean {
    return Boolean(this.ctx && this.master && this.settings.soundEnabled && this.settings.volume > 0);
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, gain: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseBurst(dur: number, filter: BiquadFilterType, f0: number, f1: number, gain: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const flt = ctx.createBiquadFilter();
    flt.type = filter;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private explosion(radius: number): void {
    const now = performance.now();
    if (now - this.lastExplosion < 40) return;
    this.lastExplosion = now;
    const big = Math.min(1.4, Math.max(0.4, radius / 45));
    this.noiseBurst(0.35 + 0.5 * big, "lowpass", 1400, 90, 0.5);
    this.tone(95, 32, 0.4 + 0.3 * big, "sine", 0.55);
  }

  private whoosh(): void {
    this.noiseBurst(0.35, "bandpass", 900, 300, 0.25);
  }

  private bang(): void {
    this.noiseBurst(0.12, "highpass", 3000, 800, 0.35);
    this.tone(180, 60, 0.12, "square", 0.12);
  }

  private click(freq: number, dur: number): void {
    this.tone(freq, freq * 0.6, dur, "square", 0.07);
  }

  private jingle(): void {
    const ctx = this.ctx!;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      window.setTimeout(() => {
        if (this.ctx === ctx && this.ready()) this.tone(f, f, 0.22, "triangle", 0.18);
      }, i * 130);
    });
  }
}

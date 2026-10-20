/**
 * Zentrale Standardwerte für alles, was Spieler:innen einstellen können.
 * Hier anpassen, um Defaults zu ändern; gespeicherte Einstellungen im Browser
 * (localStorage) haben weiterhin Vorrang.
 *
 * Physik- und Regelkonstanten (Zugzeit, Schwerkraft, Wurmgröße, …) liegen
 * bewusst in `game/constants.ts`, weil Tests und KI davon abhängen.
 */
import type { AiLevel, MatchMode } from "./types";

export const CONFIG = {
  view: {
    /** Start-Ansichtsgröße in Bildschirm-Pixeln pro Welt-Pixel (Retina-bereinigt). */
    zoomDefault: 1.4,
    zoomMin: 1,
    zoomMax: 3,
    /** Schrittweite des Reglers in den Einstellungen. */
    zoomSliderStep: 0.2,
    /** Faktor pro Tastendruck (+ / −) im Spiel. */
    zoomKeyFactor: 1.15,
    /** Obergrenze für die Pixeldichte, damit Retina/4K nicht unnötig viel rendert. */
    maxDpr: 2,
  },
  audio: {
    enabled: true,
    volume: 0.6,
  },
  hud: {
    /** Dezente Steuerungs-Legende im Spiel anzeigen. */
    showLegend: true,
    /** Hinweis beim Laden auf Touch-Geräten: Wurmduell ist für Desktop mit Tastatur gedacht. */
    mobileNotice: true,
  },
  rules: {
    /**
     * Bazooka-Reichweite relativ zum Ursprungswert (1 = original, 1.3 = 30 % weiter).
     * Die Reichweite wächst mit dem Quadrat der Abschussgeschwindigkeit, daher Wurzel.
     */
    bazookaRange: 1.6,
    /** Teleports pro Team und Partie (im Match-Setup einstellbar). */
    teleports: 1,
    /** „Wurmduell pure“: nur Bazooka, keine weiteren Waffen (im Match-Setup wählbar). */
    pure: false,
    /** Höchstwert, der im Match-Setup angeboten wird. */
    teleportsMax: 3,
  },
  atproto: {
    /** ATProto-Login/-Sync anbieten (das Spiel bleibt ohne Konto voll spielbar). */
    enabled: true,
    /** Löst Handles beim Login auf. */
    handleResolver: "https://bsky.social",
    /**
     * Leer = wird aus der aktuellen Seiten-URL abgeleitet (`client-metadata.json` neben der index.html).
     * Muss exakt zur `client_id` in `public/client-metadata.json` passen.
     */
    clientId: "",
  },
  logs: {
    /**
     * Better Stack Logs (HTTP-Ingest): „Ingesting host“ der Quelle (z. B. `s123456.eu-nbg-2.betterstackdata.com`)
     * und Source-Token. Host leer = kein Logging (nichts wird gesendet). Der Token steht öffentlich im Code,
     * er erlaubt nur das Einliefern von Logzeilen.
     */
    host: "s2801996.us-west-2a.betterstackdata.com" as string,
    token: "8Ytn3XWPzsbJ4Ts9TqGf41BU" as string,
    /**
     * Dienst, der IP-Adresse und ungefähren Ort des Clients liefert (JSON, z. B. ipwho.is oder ipapi.co).
     * Der Browser kennt seine öffentliche IP nicht selbst. Leer = keine IP-/Ortsangabe in den Logs.
     * Achtung: Der Dienst sieht dabei die IP der Spieler:innen.
     */
    geoLookupUrl: "https://ipwho.is/" as string,
  },
  setup: {
    mode: "vsAi" as MatchMode,
    aiLevel: "normal" as AiLevel,
    wormsPerTeam: 2 as 2 | 3,
    names: ["Spieler 1", "Spieler 2"] as [string, string],
  },
} as const;

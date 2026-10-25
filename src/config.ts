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
    maxDpr: 1.5,
    /** Auflösung bei zu niedriger Bildrate automatisch senken (bis 1 Pixel pro CSS-Pixel). */
    adaptiveQuality: true,
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
     * Veröffentlichte Adresse der Seite (inkl. abschließendem `/`), identisch mit `redirect_uris` in
     * `public/client-metadata.json`. Die Anmeldung gehört zu dieser Adresse (Browser-Speicher gilt pro Herkunft):
     * Wird das Spiel unter einer anderen Herkunft geöffnet, geht der Login zuerst auf diese Adresse.
     * Leer = Adresse wird aus der aktuellen Seite abgeleitet.
     */
    appUrl: "https://wurmduell.wisp.place/" as string,
    /**
     * Leer = `client-metadata.json` unter `appUrl` (bzw. neben der aktuellen Seite).
     * Muss exakt zur `client_id` in `public/client-metadata.json` passen.
     */
    clientId: "",
    /**
     * Profil-Link in der globalen Rangliste; `{id}` wird durch Handle (bzw. DID) ersetzt.
     * Leer = keine Links. Eurosky-/Bluesky-Konten sind über bsky.app erreichbar.
     */
    profileUrl: "https://bsky.app/profile/{id}" as string,
    /**
     * Eigene Profil-Vorlage je Handle-Domain (Handle endet auf die Domain). Eurosky-Konten gehen zu mu,
     * dem Web-Client von Eurosky; alle anderen Handles und DIDs nutzen `profileUrl`.
     */
    profileUrlByDomain: { "eurosky.social": "https://mu.social/profile/{id}" } as Record<string, string>,
  },
  about: {
    /** Links im Hinweis „Open Source“ im Hauptmenü; leer = Link entfällt. */
    sourceUrl: "https://github.com/vidompteur/wurmduell" as string,
    atprotoUrl: "https://atproto.com" as string,
    hostUrl: "https://wisp.place" as string,
  },
  ladder: {
    /**
     * Aktuelle globale Rangliste direkt aus dem Repository (vom stündlichen Workflow gepflegt), damit sie
     * ohne neues Deployment aktuell ist. Leer oder nicht erreichbar = die mitgelieferte `ladder.json`.
     */
    url: "https://raw.githubusercontent.com/vidompteur/wurmduell/main/public/ladder.json" as string,
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

# Wurmduell — Implementierungsspezifikation

Eine statische TypeScript-SPA: rundenbasiertes 2D-Artillery-Spiel im Stil klassischer Worms-Spiele, mit Hotseat-Multiplayer, KI-Gegner, lokaler Ladder und optionaler ATProto-/PDS-Synchronisierung.

Das Spiel wird als statischer Build auf [wisp.place](https://wisp.place) deployt. Es gibt kein Pflicht-Backend.

---

## 1. Projektziele

- Ein vollständiges, sofort spielbares Worms-artiges Spiel im Browser.
- Hotseat-Modus für zwei menschliche Spieler am selben Gerät.
- KI-Gegner als Alternative zum zweiten menschlichen Spieler.
- Zerstörbares 2D-Terrain, Wind, Wasser und rundenbasierte Kämpfe.
- Ladder mit Siegen, Niederlagen und Zielgenauigkeit.
- Optional: ATProto-Login und Speicherung der persönlichen Ladder im PDS des Spielers.
- Deployment als statische Seite über wisp.place.

## 2. Technische Vorgaben

| Bereich | Vorgabe |
|---|---|
| Sprache | TypeScript, `strict: true` |
| Build-Tool | Vite |
| UI | Vanilla DOM, kein React/Vue erforderlich |
| Rendering | HTML5 Canvas 2D |
| Game Loop | Feste 50 Ticks pro Sekunde |
| Physik | Eigene einfache 2D-Physik, keine schwere Physics-Engine |
| Terrain | Pixelbasiertes, zerstörbares Terrain auf Offscreen-Canvas |
| Persistenz | `localStorage` für lokale Ladder und Einstellungen |
| Optional Auth | `@atproto/oauth-client-browser` |
| Optional API | `@atproto/api` |
| Deployment | `npm run build` erzeugt `dist/`; Deploy mit `wispctl deploy` |
| Assets | Prozedural erzeugte Grafik und WebAudio; keine fremden Spiel-Assets |

### Verboten

- Keine Original-Worms-Assets, -Sounds, -Stimmen, -Sprites oder -Branding von Team17.
- Kein Online-Multiplayer im MVP.
- Kein Pflicht-Backend.
- Keine Accounts ohne ATProto.
- Keine Abhängigkeit von externen Grafik- oder Sound-Assets.

## 3. Ordnerstruktur

```text
src/
  main.ts
  styles.css
  game/
    Game.ts
    GameState.ts
    TurnManager.ts
    MatchStats.ts
  terrain/
    Terrain.ts
    MapGenerator.ts
  entities/
    Worm.ts
    Projectile.ts
  weapons/
    Weapon.ts
    weapons.ts
  ai/
    Bot.ts
    ShotSimulator.ts
  render/
    Renderer.ts
    Camera.ts
    Hud.ts
  input/
    InputController.ts
  ladder/
    LadderStore.ts
    LadderUi.ts
  auth/
    atprotoAuth.ts
    ladderSync.ts
  ui/
    Menu.ts
    MatchSetup.ts
    ResultScreen.ts
  audio/
    Sound.ts
  types/
    index.ts
public/
  client-metadata.json
```

Die Ordner `auth/` und die ATProto-Teile werden erst implementiert, wenn das optionale Feature aktiviert wird.

---

## 4. Spielumfang

### 4.1 Karte

- Zufällig generierte Inselkarte, Standardgröße 2560 × 1440 Welt-Pixel.
- Kamera mit Zoom und Verschieben.
- Terrain besteht aus Himmel, festem Boden und Wasser.
- Terrain wird als Bitmap gespeichert.
- Ein Pixel gilt als solide, wenn sein Alpha-Wert größer als 0 ist.
- Explosionen entfernen Terrain in einem Kreis.
- Würmer können durch Explosionen in Löcher oder Wasser fallen.
- Jede neue Partie verwendet eine neue zufällige Karte.
- Der Map-Seed wird erzeugt und im Match-Ergebnis gespeichert.

### 4.2 Teams und Würmer

- Standard: zwei Teams mit je drei Würmern.
- Teamgröße 2 oder 3 ist im Match-Setup wählbar.
- Jeder Wurm hat 100 HP.
- Ein Wurm stirbt bei 0 HP oder bei Kontakt mit Wasser.
- Ein Team verliert, wenn alle seine Würmer tot sind.
- Würmer haben einen Namen, ein Team, eine Position, HP und Blickrichtung.

### 4.3 Zugsystem

- Würmer ziehen reihum.
- Innerhalb eines Teams rotiert der aktive Wurm.
- Zugzeitlimit: 45 Sekunden.
- Nach einem Angriff: 3 Sekunden Rückzugsphase.
- Wind wird pro Zug zufällig festgelegt und im HUD angezeigt.
- Nach Ablauf des Zuges wechselt die Kontrolle zum nächsten lebenden Team.
- Das Spiel endet, wenn nur noch ein Team lebt.

### 4.4 Waffen

| Waffe | Verhalten |
|---|---|
| Bazooka | Winkel und Stärke, Gravitation, Wind, Explosion bei Treffer |
| Granate | Wurf, Bounce, 3-Sekunden-Timer, Explosion |
| Dynamit | Wird abgelegt, 5-Sekunden-Timer, große Explosion |
| Shotgun | Bis zu zwei direkte Schüsse |
| Teleport | Klick auf freie Terrainfläche versetzt den aktiven Wurm |

Bazooka und Granate müssen vollständig implementiert sein. Die übrigen Waffen können einfacher sein, müssen aber stabil funktionieren.

### 4.5 Schaden

- Explosionsschaden nimmt mit der Entfernung zum Explosionszentrum ab.
- Explosionsradius und Maximalschaden sind pro Waffe konfigurierbar.
- Fallschaden beginnt ab etwa 60 Pixel Fallhöhe und skaliert mit der Höhe.
- Explosionen können Würmer wegstoßen.
- Wasser tötet einen Wurm sofort.

---

## 5. Steuerung

| Aktion | Eingabe |
|---|---|
| Bewegen | Pfeiltasten links/rechts oder A/D |
| Winkel ändern | Pfeiltasten hoch/runter oder W/S |
| Schussstärke aufladen | Leertaste gedrückt halten |
| Feuern | Leertaste loslassen |
| Waffe wählen | Tasten 1–5 |
| Zoomen | Mausrad |
| Kamera verschieben | Mittelklick oder Ziehen mit gedrückter rechter Maustaste |
| Pause | ESC |

Desktop-Tastatur und Maus sind Priorität. Touch-Steuerung ist optional.

---

## 6. KI-Gegner

Die KI ist pragmatisch, nicht perfekt.

### Ablauf pro Zug

1. Wähle den aktiven Wurm.
2. Bewerte alle gegnerischen Würmer als Ziele.
3. Simuliere mehrere Bazooka-Schüsse mit unterschiedlichen Winkeln und Stärken.
4. Berücksichtige Gravitation und aktuellen Wind.
5. Wähle den Schuss mit dem besten erwarteten Schaden.
6. Wenn kein sinnvoller Schuss möglich ist: bewege den Wurm oder nutze Teleport.
7. Führe den gewählten Schuss mit derselben Physik aus wie ein menschlicher Spieler.

### Bewertung eines simulierten Schusses

- Direkter Treffer: hoher Bonus.
- Nähe zum Ziel: Bonus.
- Schaden an eigenen Würmern: starker Malus.
- Risiko, selbst ins Wasser zu fallen: starker Malus.
- Treffer auf Terrain ohne Gegnerschaden: neutral bis leicht negativ.

Die KI muss innerhalb von maximal 1,5 Sekunden pro Zug entscheiden. Die Simulation nutzt eine vereinfachte Kopie der Schussphysik, nicht die Rendering-Logik.

### KI-Stufen

| Stufe | Verhalten |
|---|---|
| Einfach | Weniger Simulationen, größere Streuung, häufiger Fehler |
| Normal | Ausgewogen |
| Schwer | Mehr Simulationen, bessere Zielauswahl, weniger Eigenrisiko |

---

## 7. Ladder

Die Ladder misst, wer die meisten Kämpfe gewonnen hat und wie zielgenau gespielt wurde.

### 7.1 Lokale Speicherung

Ohne ATProto-Login wird die Ladder ausschließlich lokal gespeichert.

localStorage-Keys:

```ts
const LADDER_KEY = "wurmduell.ladder.v1";
const PLAYER_IDS_KEY = "wurmduell.playerIds.v1";
```

### 7.2 Datenmodell

```ts
type LadderEntry = {
  playerId: string;
  name: string;
  matches: number;
  wins: number;
  losses: number;
  shotsFired: number;
  shotsHit: number;
  damageDealt: number;
  damageTaken: number;
  bestWinStreak: number;
  currentWinStreak: number;
  updatedAt: string;
};

type Ladder = {
  version: 1;
  entries: LadderEntry[];
};
```

### 7.3 Spieler-Identität

- Jeder menschliche Spieler erhält eine stabile `playerId`.
- Die ID wird lokal gespeichert und bei weiteren Partien wiederverwendet.
- Der Anzeigename kann geändert werden, ohne die ID zu ändern.
- KI-Gegner erhalten feste IDs wie `ai:easy`, `ai:normal` oder `ai:hard`.
- KI-Gegner werden nicht als eigene Ladder-Teilnehmer gewertet.

### 7.4 Zielgenauigkeit

```ts
accuracy = shotsHit / shotsFired;
```

Regeln:

- Ein Schuss zählt als Treffer, wenn er mindestens 1 Schaden an einem gegnerischen Wurm verursacht.
- Selbstverschaden zählt nicht als Treffer.
- Bazooka, Granate, Dynamit und Shotgun zählen als Schüsse.
- Teleport zählt nicht als Schuss.
- Bei `shotsFired = 0` ist die Genauigkeit 0.

### 7.5 Rangliste

Standard-Sortierung:

1. `wins` absteigend
2. `accuracy` absteigend
3. `damageDealt` absteigend
4. Name aufsteigend

Angezeigte Spalten:

| Spalte | Inhalt |
|---|---|
| Rang | Position |
| Name | Spielername |
| Siege | `wins` |
| Niederlagen | `losses` |
| Matches | `matches` |
| Winrate | `wins / matches` |
| Zielgenauigkeit | `accuracy` in Prozent |
| Schaden | `damageDealt` |
| Beste Serie | `bestWinStreak` |

Die Ladder ist über das Hauptmenü erreichbar und enthält einen Reset-Button mit Bestätigungsdialog.

### 7.6 Match-Auswertung

Nach Spielende:

- `matches` für beide menschlichen Spieler erhöhen.
- `wins` für den Gewinner erhöhen.
- `losses` für den Verlierer erhöhen.
- `shotsFired`, `shotsHit`, `damageDealt` und `damageTaken` aktualisieren.
- Win-Streaks aktualisieren.
- Ladder sofort speichern.
- Ergebnisbildschirm mit Schüssen, Treffern, Genauigkeit und Schaden anzeigen.

Bei Hotseat werden beide menschlichen Profile aktualisiert. Gegen die KI wird nur das menschliche Profil aktualisiert.

---

## 8. Optionales Feature: ATProto-Login

Dieses Feature ist optional. Das Spiel muss ohne Login vollständig spielbar sein.

### 8.1 Ziel

- Anmeldung mit einem bestehenden ATProto-/Eurosky-Account.
- Stabile Spieleridentität über die DID.
- Speicherung der persönlichen Ladder im PDS des Spielers.
- Geräteübergreifende Verfügbarkeit der eigenen Statistik.
- Grundlage für eine spätere globale Ladder.

### 8.2 Pakete

```bash
npm install @atproto/oauth-client-browser @atproto/api
```

### 8.3 Client-Metadata

Lege `public/client-metadata.json` an. Die URLs müssen exakt zur finalen wisp-URL passen.

```json
{
  "client_id": "https://sites.wisp.place/<HANDLE>/wurmduell/client-metadata.json",
  "client_name": "Wurmduell",
  "client_uri": "https://sites.wisp.place/<HANDLE>/wurmduell/",
  "redirect_uris": [
    "https://sites.wisp.place/<HANDLE>/wurmduell/"
  ],
  "scope": "atproto",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "application_type": "web",
  "dpop_bound_access_tokens": true
}
```

Die Datei muss unter genau der URL erreichbar sein, die in `client_id` steht.

### 8.4 OAuth-Client

```ts
import {
  BrowserOAuthClient,
  type OAuthSession,
} from "@atproto/oauth-client-browser";

const CLIENT_ID =
  "https://sites.wisp.place/<HANDLE>/wurmduell/client-metadata.json";

let clientPromise: Promise<BrowserOAuthClient> | null = null;

export function getOAuthClient(): Promise<BrowserOAuthClient> {
  clientPromise ??= BrowserOAuthClient.load({
    clientId: CLIENT_ID,
    handleResolver: "https://bsky.social",
  });

  return clientPromise;
}

export async function restoreSession(): Promise<OAuthSession | null> {
  const client = await getOAuthClient();
  const result = await client.init();

  return result?.session ?? null;
}

export async function signIn(handle: string): Promise<void> {
  const client = await getOAuthClient();
  await client.signIn(handle, {
    state: crypto.randomUUID(),
  });
}

export async function signOut(session: OAuthSession): Promise<void> {
  await session.signOut();
}
```

### 8.5 App-Start

```ts
import { restoreSession } from "./auth/atprotoAuth";
import { renderLogin } from "./ui/Login";
import { renderMenu } from "./ui/Menu";

const app = document.querySelector<HTMLDivElement>("#app")!;

async function bootstrap() {
  try {
    const session = await restoreSession();

    if (session) {
      renderMenu(app, session);
      return;
    }
  } catch (error) {
    console.warn("Keine gültige ATProto-Session", error);
  }

  renderLogin(app);
}

void bootstrap();
```

### 8.6 Login-Verhalten

- Der Spieler gibt Handle, DID oder PDS-URL ein.
- Die SPA leitet zum OAuth-Server des PDS weiter.
- Nach erfolgreicher Zustimmung kehrt der Browser zur App zurück.
- `client.init()` verarbeitet den Redirect und stellt die Session wieder her.
- `session.sub` enthält die DID und wird als stabile Spieler-ID verwendet.
- Handles können sich ändern; daher niemals den Handle als primäre ID verwenden.

### 8.7 Fehlerfälle

- Abgebrochener Login: dezente Fehlermeldung, kein Absturz.
- Ungültige oder abgelaufene Session: Fallback auf Offline-Modus.
- PDS nicht erreichbar: lokale Speicherung und spätere Synchronisierung.
- Logout: Session beenden, lokale Ladder-Daten behalten.

---

## 9. Optionales Feature: Ladder-Sync über PDS

### 9.1 Prinzip

Die persönliche Ladder bleibt lokal vorhanden und wird zusätzlich in den PDS des angemeldeten Spielers geschrieben.

```text
Wurmduell-SPA
   │ OAuth über ATProto
   ▼
PDS des Spielers
   ├─ de.wurmduell.profile
   ├─ de.wurmduell.ladderSummary
   └─ de.wurmduell.matchResult
```

Der PDS ist der persönliche Datenspeicher des Spielers, nicht ein zentraler Game-Server.

### 9.2 Record-Typen

#### Profil

```json
{
  "lexicon": 1,
  "id": "de.wurmduell.profile",
  "defs": {
    "main": {
      "type": "record",
      "description": "Öffentliches Wurmduell-Profil",
      "key": "literal:self",
      "record": {
        "type": "object",
        "required": ["displayName", "createdAt"],
        "properties": {
          "displayName": { "type": "string", "maxLength": 64 },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

#### Ladder-Zusammenfassung

```json
{
  "lexicon": 1,
  "id": "de.wurmduell.ladderSummary",
  "defs": {
    "main": {
      "type": "record",
      "key": "literal:self",
      "record": {
        "type": "object",
        "required": [
          "matches",
          "wins",
          "losses",
          "shotsFired",
          "shotsHit",
          "damageDealt",
          "damageTaken",
          "bestWinStreak",
          "currentWinStreak",
          "updatedAt"
        ],
        "properties": {
          "matches": { "type": "integer", "minimum": 0 },
          "wins": { "type": "integer", "minimum": 0 },
          "losses": { "type": "integer", "minimum": 0 },
          "shotsFired": { "type": "integer", "minimum": 0 },
          "shotsHit": { "type": "integer", "minimum": 0 },
          "damageDealt": { "type": "integer", "minimum": 0 },
          "damageTaken": { "type": "integer", "minimum": 0 },
          "bestWinStreak": { "type": "integer", "minimum": 0 },
          "currentWinStreak": { "type": "integer", "minimum": 0 },
          "updatedAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

#### Match-Ergebnis

```json
{
  "lexicon": 1,
  "id": "de.wurmduell.matchResult",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["mode", "outcome", "opponent", "stats", "createdAt"],
        "properties": {
          "mode": {
            "type": "string",
            "knownValues": ["hotseat", "vsAi"]
          },
          "outcome": {
            "type": "string",
            "knownValues": ["win", "loss", "draw"]
          },
          "opponent": {
            "type": "object",
            "required": ["kind", "name"],
            "properties": {
              "kind": {
                "type": "string",
                "knownValues": ["human", "ai"]
              },
              "did": { "type": "string", "format": "did" },
              "name": { "type": "string" }
            }
          },
          "stats": {
            "type": "object",
            "required": [
              "shotsFired",
              "shotsHit",
              "damageDealt",
              "damageTaken"
            ],
            "properties": {
              "shotsFired": { "type": "integer", "minimum": 0 },
              "shotsHit": { "type": "integer", "minimum": 0 },
              "damageDealt": { "type": "integer", "minimum": 0 },
              "damageTaken": { "type": "integer", "minimum": 0 }
            }
          },
          "durationSeconds": { "type": "integer", "minimum": 0 },
          "mapSeed": { "type": "string" },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

### 9.3 Sync-Logik

Nach jedem Match:

1. Match lokal speichern.
2. Prüfen, ob eine ATProto-Session existiert.
3. Wenn ja: `matchResult` per `createRecord` schreiben.
4. Aktuelle `ladderSummary` lesen.
5. Werte mit dem neuen Match mergen.
6. Aktualisierte Summary per `putRecord` mit `rkey: "self"` schreiben.
7. Bei Fehler: Match in einer lokalen Sync-Queue behalten.

### 9.4 Merge-Regel

Die PDS-Summary ist für angemeldete Geräte die bevorzugte Quelle. Lokale Werte werden nur verwendet, wenn sie neuer oder höher sind.

```ts
function mergeLadder(local: LadderEntry, remote: LadderEntry): LadderEntry {
  return {
    ...remote,
    matches: Math.max(local.matches, remote.matches),
    wins: Math.max(local.wins, remote.wins),
    losses: Math.max(local.losses, remote.losses),
    shotsFired: Math.max(local.shotsFired, remote.shotsFired),
    shotsHit: Math.max(local.shotsHit, remote.shotsHit),
    damageDealt: Math.max(local.damageDealt, remote.damageDealt),
    damageTaken: Math.max(local.damageTaken, remote.damageTaken),
    bestWinStreak: Math.max(local.bestWinStreak, remote.bestWinStreak),
    currentWinStreak:
      remote.updatedAt > local.updatedAt
        ? remote.currentWinStreak
        : local.currentWinStreak,
    updatedAt:
      remote.updatedAt > local.updatedAt
        ? remote.updatedAt
        : local.updatedAt
  };
}
```

### 9.5 Globale Ladder

Eine globale Ladder gehört **nicht** in den privaten PDS eines einzelnen Spielers.

Empfohlene Entwicklung:

1. MVP: nur lokale Ladder.
2. Optional: persönliche Ladder im PDS.
3. Kleine Community: client-seitige Aggregation über eine Opt-in-Liste von Spieler-DIDs.
4. Größere Community: eigener Ladder-Indexer bzw. AppView-light, der öffentliche `de.wurmduell.*`-Records liest und eine globale Rangliste bereitstellt.

Der Ladder-Dienst ist read-only aus Sicht der Spieler. Er indexiert öffentliche Records, berechnet die Rangliste und stellt eine API bereit. Spieler behalten weiterhin die Hoheit über ihre eigenen Match-Daten.

---

## 10. UI

### 10.1 Bildschirme

1. **Hauptmenü**
   - Neues Spiel
   - Ladder
   - Einstellungen
   - Optional: Anmelden / Abmelden

2. **Match-Setup**
   - Modus: Hotseat oder gegen Computer
   - KI-Stärke: Einfach, Normal, Schwer
   - Teamgröße: 2 oder 3 Würmer
   - Spielernamen
   - Start-Button

3. **Match**
   - Canvas
   - HUD: aktiver Wurm, HP, Team, Wind, Zug-Timer, Waffenleiste
   - Pause-Menü: Fortsetzen, Aufgeben, Zurück zum Menü

4. **Ergebnisbildschirm**
   - Sieger
   - Statistiken beider Seiten
   - Schüsse, Treffer, Genauigkeit
   - Verursachter Schaden
   - Buttons: Revanche, Ladder, Hauptmenü

5. **Ladder**
   - Tabelle
   - Optionaler Sync-Status
   - Reset-Button
   - Zurück zum Menü

### 10.2 HUD

Das HUD muss mindestens zeigen:

- Aktiven Wurm und Team
- HP des aktiven Wurms
- Verbleibende Zugzeit
- Aktuelle Windrichtung und -stärke
- Ausgewählte Waffe
- Verbleibende Munition, falls eine Waffe begrenzt ist

---

## 11. Qualitätsanforderungen

- TypeScript strict mode aktiv.
- Keine `any`-Typen ohne begründeten Kommentar.
- Trennung von Spiellogik, Rendering, Input und UI.
- Game-Logik manipuliert kein DOM direkt.
- Deterministische Spiellogik, soweit möglich.
- Zufall über einen injizierbaren RNG.
- KI nutzt dieselbe Physik-Implementierung wie der Spieler.
- Event-Listener, Timer und Canvas-Ressourcen werden bei Matchende aufgeräumt.
- Läuft in aktuellen Chrome-, Firefox- und Safari-Versionen.
- Die App funktioniert ohne Internetverbindung im Offline-/Hotseat-Modus.

---

## 12. Deployment

### 12.1 Scripts

In `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "deploy": "npm run build && wispctl deploy <HANDLE> --path ./dist --site wurmduell"
  }
}
```

### 12.2 Workflow

```bash
npm run dev      # lokale Entwicklung
npm run build    # Produktions-Build nach dist/
npm run deploy   # Build erstellen und auf wisp.place veröffentlichen
```

Die Seite ist danach unter folgender URL erreichbar:

```text
https://sites.wisp.place/<HANDLE>/wurmduell/
```

### 12.3 Deploy-Reihenfolge

1. Statische Basis-App deployen.
2. Finale URL prüfen.
3. `client-metadata.json` nur hinzufügen, wenn ATProto-Login implementiert wird.
4. `client_id` und `redirect_uris` exakt an die finale URL anpassen.
5. Erneut deployen.
6. ATProto-Login testen.

---

## 13. Akzeptanzkriterien

Die Implementierung gilt als fertig, wenn:

1. `npm run dev` eine spielbare lokale Version startet.
2. `npm run build` einen funktionierenden statischen Build in `dist/` erzeugt.
3. Zwei Menschen ein vollständiges Hotseat-Match spielen können.
4. Ein Mensch gegen die KI spielen kann.
5. Terrain durch Explosionen sichtbar zerstört wird.
6. Würmer durch Explosionen in Löcher oder Wasser fallen können.
7. Bazooka und Granate mit Wind und Gravitation funktionieren.
8. Nach Spielende die lokale Ladder korrekt aktualisiert wird.
9. Die Ladder Siege, Niederlagen, Matches, Winrate, Zielgenauigkeit, Schaden und beste Siegesserie zeigt.
10. Ladder-Daten einen Seiten-Reload überleben.
11. `npm run deploy` eine funktionsfähige Version auf wisp.place veröffentlicht.

### Optionale Akzeptanzkriterien

Wenn ATProto-Login und Ladder-Sync implementiert sind:

12. Ein Spieler kann sich mit Handle, DID oder PDS-URL anmelden.
13. Nach Reload bleibt die Session erhalten.
14. Die DID wird als stabile Spieler-ID verwendet.
15. Nach einem Match wird ein `matchResult` im PDS erzeugt.
16. Die `ladderSummary` im PDS wird korrekt aktualisiert.
17. Ohne Verbindung funktioniert das Spiel weiterhin lokal.
18. Fehlgeschlagene Syncs werden lokal vorgehalten und später wiederholt.

---

## 14. Umsetzungsreihenfolge

Implementiere in dieser Reihenfolge. Nach jeder Phase muss ein lauffähiger Stand entstehen.

1. Vite/TypeScript-Projekt, Canvas, Game Loop, Kamera.
2. Terrain-Generierung und zerstörbares Terrain.
3. Würmer, Bewegung, Kollision, Fall- und Wasserschaden.
4. Zugmanager, Timer, Wind und Teamwechsel.
5. Bazooka und Granate mit Explosionen und Schaden.
6. Match-Ende und Ergebnisbildschirm.
7. Lokale Ladder und Ladder-UI.
8. KI-Gegner mit Schuss-Simulation.
9. Weitere Waffen, Sound und Polish.
10. Produktions-Build und wisp-Deployment.
11. Optional: ATProto-Login.
12. Optional: Ladder-Sync über PDS.

---

## 15. Bewusst nicht Teil des MVP

- Online-Multiplayer
- WebSocket-Server
- Replay-System
- Globale Ladder mit eigenem Indexer
- Benutzerkonten ohne ATProto
- Mobile Touch-Steuerung
- Anti-Cheat-Mechanismen
- Original-Worms-Assets oder -Branding

# wurmduell
Ein Spiel wie Worms in dem zwei Würmer gegeneinander kämpfen und aufeinander schießen.

# Spielen

Rundenbasiertes Artillerie-Spiel für zwei Teams (2–3 Würmer pro Team): im Hotseat gegeneinander oder gegen den Computer (Einfach, Normal, Schwer). Das Gelände ist zerstörbar, Wind beeinflusst Bazooka-Schüsse, wer ins Wasser fällt, ertrinkt. Ergebnisse landen in einer lokalen Rangliste (im Browser gespeichert).

## Steuerung

| Taste | Aktion |
|---|---|
| `←` `→` oder `A` `D` | laufen |
| `↑` `↓` oder `W` `S` | Winkel einstellen |
| `Leertaste` halten | Stärke aufladen, loslassen feuert |
| `1`–`5` | Waffe wählen (Bazooka, Granate, Dynamit, Shotgun, Teleport; beim Teleport danach auf die Karte klicken) |
| Mausrad oder `+` `−` | zoomen |
| Mittel-/Rechtsklick ziehen | Kamera verschieben |
| `Esc` | Pause (Fortsetzen, Aufgeben, Zurück zum Menü; beides zählt als Niederlage) |

Verlässt du eine laufende Partie (Browser oder Tab schließen, Seite neu laden), wird sie gewertet: Es verliert das Team mit weniger Rest-Lebenspunkten, bei Gleichstand das Team, das geht. „Zurück zum Menü“ zählt immer als Niederlage.

**Original Modus:** Im Match-Setup lässt sich die Checkbox „Original Modus (nur Bazooka, keine anderen Waffen)“ aktivieren. Dann gibt es weder Granate, Dynamit, Shotgun noch Teleport; die Waffenleiste zeigt nur die Bazooka. Standard in `src/config.ts` unter `rules.pure`.

**Handys:** Beim Laden auf Touch-Geräten erscheint ein Hinweis, dass Wurmduell für den Desktop gedacht ist und eine Tastatur braucht. Mit „Verstanden“ verschwindet er nur für diesen Besuch, mit „Mir doch egal“ wird er nicht mehr angezeigt (gemerkt im Browser). Ganz abschaltbar über `hud.mobileNotice` in `src/config.ts`.

Im Spiel blendet oben links eine dezente Legende diese Tasten ein.

## Einstellungen

Unter **Einstellungen** im Hauptmenü (werden im Browser gespeichert):

- **Ansichtsgröße:** Start-Zoom, 1,0× bis 3,0×. Größer heißt größere Würmer. Gilt ab dem nächsten Spiel; im Spiel zoomst du mit Mausrad oder `+` / `−`.
- **Ton** und **Lautstärke**
- **Steuerungs-Legende im Spiel anzeigen**

## Standardwerte konfigurieren

Alle Defaults stehen zentral in [`src/config.ts`](src/config.ts):

| Bereich | Werte |
|---|---|
| `view` | Standard-Zoom (`zoomDefault`, aktuell 1,4), Zoom-Min/-Max, Reglerschritt, Zoom-Faktor pro Tastendruck, maximale Pixeldichte |
| `audio` | Ton an/aus, Lautstärke |
| `hud` | Steuerungs-Legende an/aus, Handy-Hinweis an/aus |
| `rules` | Teleports pro Team (`teleports`, Standard 1), Bazooka-Reichweite (`bazookaRange`, 1,3× Original) |
| `setup` | Vorbelegung im Match-Setup (Modus, KI-Stärke, Teamgröße, Spielernamen) |

Bereits im Browser gespeicherte Einstellungen haben Vorrang vor diesen Defaults; zum Testen den localStorage-Eintrag `wurmduell.settings.v1 löschen. Regel- und Physikkonstanten (Zugzeit, Schwerkraft, Wurmgröße, Waffenschaden) liegen in `src/game/constants.ts` bzw. `src/weapons/weapons.ts`.

## Optional: Anmeldung und Ranglisten-Sync (ATProto)

Das Spiel ist ohne Konto vollständig spielbar. Wer sich im Hauptmenü mit einem ATProto-/Eurosky-Account anmeldet, bekommt seine Rangliste zusätzlich im eigenen PDS gespeichert und sieht sie auf jedem Gerät.

- **Nur auf der veröffentlichten Seite:** Die Anmeldung läuft über OAuth und braucht die öffentliche `client-metadata.json` (siehe „Handle konfigurieren"). Lokal mit `npm run dev` zeigt das Menü nur einen Hinweis.
- **Identität:** Spieler 1 ist dann an die DID gebunden (nicht an den Handle) und im Match-Setup gesperrt.
- **Gespeicherte Records** im PDS (Lexicons unter `lexicons/`): `de.wurmduell.ladderSummary` (ein Eintrag, `rkey: self`) und pro Partie `de.wurmduell.matchResult`.
- **Offline-sicher:** Jede Partie wird zuerst lokal gespeichert und in eine Sync-Queue gelegt. Schlägt der PDS-Zugriff fehl, bleibt sie dort und wird beim nächsten Start oder Spiel nachgeschickt. Auch Abbruch (Tab schließen) landet in der Queue.
- **Abmelden** beendet die Session, die lokale Rangliste bleibt.
- **Scope (angefragte Rechte):** Nur `atproto` plus Anlegen/Ändern der eigenen `ladderSummary` und Anlegen von `matchResult`-Records, jeweils nur in diesen beiden `de.wurmduell.*`-Collections und ohne Löschrecht (`public/client-metadata.json`). Es gibt keinen Zugriff auf Bluesky-Posts, Follows oder Nachrichten. Falls der Login mit „invalid scope“ scheitert, ist das die erste Stelle zum Prüfen.

Code: `src/atproto/` (`auth.ts` OAuth, `Account.ts` Zustand, `sync.ts` Abgleich und Queue, `records.ts` Records und Merge-Regel).

## Logging mit Better Stack (optional)

Das Spiel kann Logzeilen an [Better Stack Logs](https://betterstack.com/docs/logs/ingesting-data/http/logs/) schicken (einfacher HTTP-POST, kein SDK). In `src/config.ts` unter `logs` den **Ingesting host** und den **Source-Token** der Quelle eintragen; ohne Host wird nichts gesendet.

Jede Zeile ist ein JSON-Objekt mit `dt`, `level`, `message`, Sitzungs-ID und, nach dem Login, dem Nutzer (`user.did`, `user.handle`). Das Feld `event` unterscheidet:

- `pageview`: Seite geladen, mit Browser-/Gerätedaten (User-Agent, Sprache, Zeitzone, Bildschirm, Touch, Verbindung, URL, Referrer).
- `login` / `logout`: DID, Handle, DID-Dokument, PDS und Token-Metadaten (Aussteller, Rechte, Ablauf – nie das Token selbst).
- `match`: Modus, Sieger, Dauer, Karten-Seed und Statistik beider Teams (Namen, Spieler-ID/DID bzw. KI-Stufe).
- `error`: unbehandelte Fehler sowie abgefangene Login-, Session- und Sync-Fehler (`where`, z. B. `atproto.signIn`).

Der Token steht öffentlich im Code und erlaubt nur das Einliefern; jemand könnte also Zeilen vortäuschen. Pro Seitenaufruf werden höchstens 100 Zeilen gesendet. **Datenschutz:** Namen, DIDs und Ergebnisse sind personenbezogene Daten; weise Spieler:innen darauf hin und prüfe die Aufbewahrungsdauer bei Better Stack. Code: `src/telemetry.ts`.

## Globale Rangliste

Unter **Rangliste → Global** steht die Rangliste aller teilnehmenden Spieler. Sie ist eine statische Datei (`public/ladder.json`), die ein Skript aus den öffentlichen `de.wurmduell.ladderSummary`-Records der Spieler erzeugt (Spieler müssen dafür mindestens einmal angemeldet gespielt haben).

**Mitmachen:** Einfach im Spiel anmelden und eine Partie spielen. Das Skript fragt den Bluesky-Relay (`com.atproto.sync.listReposByCollection`) nach allen Konten mit einer `de.wurmduell.ladderSummary` und nimmt sie bei der nächsten Aktualisierung automatisch auf. Zusätzlich kannst du in `public/players.json` Konten von Hand eintragen (`players`) oder sperren (`blocked`, Handle oder DID):

```json
{ "players": ["nils.bsky.social"], "blocked": ["did:plc:abc123"] }
```

Antwortet der Relay nicht, nutzt das Skript nur `players.json` (steht im Log als „Relay-Fehler“).

**Aktualisieren:**

- Von Hand: `npm run ladder:build` (braucht Netzwerk), danach `npm run deploy`. Die Datei wird nur umgeschrieben, wenn sich etwas geändert hat.
- Automatisch: Der Workflow `.github/workflows/ladder.yml` läuft stündlich und per „Run workflow". Er committet eine geänderte `ladder.json` auf `main` und veröffentlicht sie auf wisp.place. Dafür im Repository hinterlegen: Variable `WISP_HANDLE` (z. B. `deinname.bsky.social`) und Secret `WISPCTL_APP_PASSWORD` (App-Passwort des Accounts). Fehlen sie, wird nur committet und eine Warnung ausgegeben.

**Hinweise:** Die Summaries schreiben die Spieler selbst und sie lassen sich daher fälschen; das Skript verwirft nur offensichtlich unplausible Werte (z. B. mehr Treffer als Schüsse). Antwortet ein PDS nicht, bleibt der alte Stand des Spielers erhalten. GitHub pausiert geplante Workflows in Repositories ohne Aktivität nach 60 Tagen.

## Texte ändern

Alle sichtbaren Texte der Oberfläche stehen zentral in [`src/i18n/de.properties`](src/i18n/de.properties) (Format `schluessel=Text`, `#` für Kommentare, Platzhalter wie `{name}`). Im Code werden sie über `t("schluessel", { name: "…" })` abgerufen. Dort änderst du Beschriftungen, Meldungen, Waffennamen, Wurmnamen (kommagetrennt, `setup.wormNames`) und die Steuerungs-Legende. Fehlt ein Schlüssel, erscheint er selbst als Text und eine Warnung in der Browser-Konsole; der Test `tests/i18n.test.ts` prüft das Format und die dynamisch gebildeten Schlüssel.

Nicht in der Datei stehen die statischen Texte in `index.html` (Seitentitel, Beschreibung) sowie Log-Ausgaben für Entwickler (Konsole, Skript `ladder:build`).

## Projektstruktur

```text
src/config.ts      Standardwerte (siehe oben)
src/i18n/          zentrale Texte (de.properties) und t()-Funktion
src/telemetry.ts   optionales Logging an Better Stack (Fehler, Login, Match-Ergebnisse)
src/game/          Spiellogik ohne DOM (Game, TurnManager, Konstanten, RNG)
src/terrain/       Kartengenerator und zerstörbares Gelände
src/entities/      Würmer und Projektile
src/weapons/       Waffendefinitionen und Schadensmodell
src/ai/            Computergegner (nutzt dieselbe Physik wie das Spiel)
src/render/        Canvas-Renderer, Kamera, HUD
src/ui/            Menü, Setup, Match-Bildschirm, Einstellungen
src/ladder/        lokale Rangliste (localStorage)
tests/             Vitest-Tests (Physik, Spiellogik, Rangliste)
```

Tests laufen mit `npm test`.

# Dev Guide 

Dieses Kapitel erklärt, wie du die Entwicklungsumgebung einrichtest, das Spiel lokal startest und als statische Seite auf wisp.place veröffentlichst. Node.js und npm brauchst du nur auf deinem Entwicklungsrechner; die fertige Seite läuft im Browser und benötigt kein Node auf dem Gerät der Spieler. [docs.npmjs](https://docs.npmjs.com/cli/v11/configuring-npm/install/)

## Voraussetzungen

Du brauchst:

- Ein Terminal
- Git, falls du das Projekt aus einem Repository klonst
- Node.js inklusive npm
- Einen ATProto-/Eurosky-Account für wisp.place
- Optional: IntelliJ oder WebStorm mit Coding-Agent

Prüfe zuerst, ob Node und npm bereits installiert sind:

```bash
node -v
npm -v
```

Wenn beide Befehle Versionsnummern ausgeben, kannst du direkt mit dem Projekt starten. npm empfiehlt ausdrücklich die Installation über einen Node-Version-Manager wie nvm; das vermeidet typische Berechtigungsprobleme bei global installierten Paketen.

## Voraussetzungen

Du brauchst Node.js/npm und Git (falls geklonst). Installiere Node.js über einen Version-Manager wie nvm (empfohlen durch npm), um Berechtigungsprobleme zu vermeiden.

```bash
# Prüfen
node -v && npm -v

# Projekt klonen & installieren
cd wurmduell && npm install

# Entwicklermodus starten
npm run dev  # läuft auf http://localhost:5173/

## Lokal entwickeln

Starte den Entwicklungsserver:

```bash
npm run dev
```

Vite zeigt dir anschließend eine lokale Adresse an, normalerweise:

```text
http://localhost:5173/
```

Öffne diese Adresse im Browser. Bei Änderungen an TypeScript, CSS oder HTML lädt Vite die Seite automatisch neu.

Beende den Dev-Server mit `Ctrl + C`.

## Wichtige npm-Befehle

| Befehl | Zweck |
|---|---|
| `npm install` | Abhängigkeiten installieren |
| `npm run dev` | Entwicklungsserver starten |
| `npm run build` | Produktions-Build nach `dist/` erzeugen |
| `npm run preview` | Den fertigen Build lokal testen |
| `npm test` | Unit-Tests (Vitest) ausführen |
| `npm run ladder:build` | Globale Rangliste (`public/ladder.json`) neu erzeugen |
| `npx wispctl --help` | wisp-CLI ohne globale Installation ausführen |

`npm run build` kompiliert TypeScript und erzeugt die statischen Dateien in `dist/`. Diese Dateien sind später genau das, was wisp.place ausliefert. 

## Handle konfigurieren

Ersetze vor dem ersten Deployment `<HANDLE>` durch deinen ATProto-/Eurosky-Handle, zum Beispiel `steini7.eurosky.social`.

Betroffene Dateien:

```text
package.json
public/client-metadata.json
```

Automatisch ersetzen:

```bash
sed -i 's/<HANDLE>/deinname.bsky.social/g' package.json public/client-metadata.json
```

Danach sollte in `package.json` etwa stehen:

```json
{
  "scripts": {
    "deploy": "npm run build && wispctl deploy deinname.bsky.social --path ./dist --site wurmduell"
  }
}
```

Und in `public/client-metadata.json`:

```json
{
  "client_id": "https://sites.wisp.place/deinname.bsky.social/wurmduell/client-metadata.json",
  "client_uri": "https://sites.wisp.place/deinname.bsky.social/wurmduell/",
  "redirect_uris": [
    "https://sites.wisp.place/deinname.bsky.social/wurmduell/"
  ]
}
```

Die `client_id` muss exakt der URL entsprechen, unter der `client-metadata.json` später erreichbar ist.

## Bei wisp.place anmelden

Melde dich einmalig bei wisp an:

```bash
npx wispctl login deinname.bsky.social
```

Der Browser öffnet sich zur Authentifizierung. Nach erfolgreichem Login kann wispctl in diesem Account deployen. Alternativ kannst du dich direkt beim Deploy authentifizieren und wispctl unterstützt auch die Verwendung eines App-Passworts über `WISPCTL_APP_PASSWORD`.

## Erstmals deployen

```bash
npm run deploy
```

Das Script macht Folgendes:

1. TypeScript prüfen bzw. kompilieren.
2. Vite-Build nach `dist/` erzeugen.
3. `wispctl deploy` starten.
4. Den Inhalt von `dist/` in deinen PDS hochladen.
5. Die Seite über wisp.place veröffentlichen.

Danach ist das Spiel erreichbar unter:

```text
https://sites.wisp.place/deinname.bsky.social/wurmduell/
```

wispctl kann mit `--path ./dist --site wurmduell` direkt aus dem Projekt heraus deployen; der Login erfolgt einmalig über den Browser. [blog.wisp](https://blog.wisp.place/posts/wispctl-1-3-1/)

## Weitere Updates deployen

Nach Änderungen genügt:

```bash
npm run deploy
```

Der Build wird neu erzeugt und die aktuelle Version veröffentlicht. Du musst dich normalerweise nicht erneut anmelden, solange die wisp-Session gültig ist. [blog.wisp](https://blog.wisp.place/posts/wispctl-1-3-1/)

## Build lokal testen

Bevor du deployst, kannst du den fertigen Build prüfen:

```bash
npm run build
npm run preview
```

Vite startet dann einen lokalen Server für den Inhalt von `dist/`. Das ist sinnvoll, um Probleme zu finden, die nur im Produktions-Build auftreten.

## Git-Workflow

Empfohlene `.gitignore`-Einträge:

```text
node_modules/
dist/
.env
.env.*
*.local
```

Typischer Ablauf:

```bash
git status
git add .
git commit -m "feat: terrain generator and destructible map"
git push
```

`node_modules/` enthält installierte Pakete und sollte nie ins Repository. `dist/` ist ein Build-Artefakt und wird bei jedem Deploy neu erzeugt.

## Troubleshooting

| Problem | Lösung |
|---|---|
| `npm: command not found` | Node.js/npm installieren oder Terminal neu starten |
| `node: command not found` | nvm laden: `source ~/.nvm/nvm.sh`, dann `nvm use --lts` |
| `EACCES` beim globalen npm-Install | nvm verwenden statt `sudo npm install -g` |
| Vite startet nicht | `rm -rf node_modules package-lock.json && npm install` |
| Deploy schlägt fehl | `npx wispctl login deinname.bsky.social` erneut ausführen |
| Falsche OAuth-Redirect-URL | `<HANDLE>` in `public/client-metadata.json` und `package.json` prüfen |
| Änderungen erscheinen nicht online | Cache prüfen, `npm run build` ausführen und erneut deployen |

npm rät von globalen Installationen über System-Installer ab, weil daraus häufig Berechtigungsfehler entstehen; ein Version-Manager wie nvm ist die robustere Lösung. [docs.npmjs](https://docs.npmjs.com/cli/v11/configuring-npm/install/)

## Kurzcheckliste

```bash
# 1. Node und npm prüfen
node -v
npm -v

# 2. Projekt vorbereiten
cd wurmduell
npm install

# 3. Handle setzen
sed -i 's/<HANDLE>/deinname.bsky.social/g' package.json public/client-metadata.json

# 4. Lokal testen
npm run dev

# 5. Bei wisp anmelden
npx wispctl login deinname.bsky.social

# 6. Veröffentlichen
npm run deploy
```

Danach ist dein aktueller Stand unter `https://sites.wisp.place/deinname.bsky.social/wurmduell/` verfügbar.

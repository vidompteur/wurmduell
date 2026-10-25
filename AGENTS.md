# AGENTS.md – Wurmduell

Rundenbasiertes 2D-Artillery-Spiel (Worms-artig) als statische TypeScript-SPA: Vite 7, strict TypeScript, Canvas 2D, Vitest, kein Framework (DOM über `h()` in `src/ui/dom.ts`). Optionale Anmeldung per ATProto-OAuth, Veröffentlichung auf wisp.place. Open Source (MIT).

## Arbeitsweise

- Kleine, überprüfbare Schritte; nur Dateien ändern, die für die Aufgabe relevant sind.
- Vor Dateiänderungen gezielt suchen (`grep` oder die Such-Tools des Agents), keine breiten `find`-Aufrufe.
- Vor Änderungen `git status` und `git diff` prüfen, nach Änderungen den Diff zeigen und committen.
- Keine Force-Pushes, keine History-Rewrites, kein `git clean`.

## Befehle

- `npm ci` (oder `npm install`): Abhängigkeiten
- `npm run dev`: Dev-Server auf http://localhost:5173/
- `npm test`: Vitest (`tests/**`)
- `npm run build`: `tsc` plus Vite-Build nach `dist/`
- `npm run ladder:build`: `public/ladder.json` neu erzeugen (braucht Netzwerk)

**Vor jedem Commit müssen `npm test` und `npm run build` fehlerfrei laufen.** Neue Logik bekommt einen Test in `tests/`.

## Konventionen

- **Sprache:** Antworten, Commit-Messages, Doku und UI-Texte auf Deutsch.
- **UI-Texte** nur in `src/i18n/de.properties`, Zugriff über `t("schluessel", { param })`. Keine Texte im Code. Neue Schlüssel prüft `tests/i18n.test.ts`.
- **Standardwerte und URLs** zentral in `src/config.ts`, nicht verstreut im Code. Regel-/Physikkonstanten in `src/game/constants.ts` und `src/weapons/weapons.ts`.
- **Spiellogik** (`src/game/`, `src/entities/`, `src/weapons/`, `src/ai/`, `src/terrain/`) ist DOM-frei und deterministisch (Seed-RNG in `src/game/rng.ts`), damit sie testbar bleibt. Der Bot nutzt dieselbe Physik wie das Spiel.
- TypeScript strict; keine `any`-Abkürzungen, keine neuen Abhängigkeiten ohne Grund.
- Keine Original-Worms-Assets, -Sounds oder -Branding.
- Neue Anzeigeoptionen und Konfigurationsschlüssel in der README (Kapitel „Standardwerte konfigurieren“) nachtragen.

## Architektur in Kürze

```text
src/config.ts       Defaults, URLs, Logging-Host
src/i18n/           Texte und t()
src/game/ ...       Spiellogik ohne DOM
src/render/         Canvas-Renderer, Kamera, HUD
src/ui/             Menü, Setup, Match, Konto-Box
src/ladder/         lokale und globale Rangliste
src/atproto/        OAuth-Login (auth.ts, authFlow.ts), Konto-Zustand, PDS-Sync, Records
src/telemetry.ts    Logging an Better Stack (nur im Browser, nicht auf localhost)
scripts/            build-ladder.ts (globale Rangliste)
lexicons/           ATProto-Schemas de.wurmduell.*
public/             client-metadata.json, ladder.json, players.json
```

## ATProto und Login (heikel)

- Die Seite muss unter `atproto.appUrl` (`https://wurmduell.wisp.place/`) geöffnet werden. Der Browser speichert den OAuth-Zustand pro Domain; `public/client-metadata.json` und `appUrl` müssen übereinstimmen, sonst: „Unknown authorization session“.
- Der Scope in `public/client-metadata.json` ist bewusst minimal (nur `de.wurmduell.*`, kein Löschrecht). Vor Erweiterungen prüfen.
- Spieler sind über ihre **DID** identifiziert, nicht über den Handle.
- Schreibzugriffe aufs PDS müssen wiederholbar sein (fester `rkey` für `matchResult`, `swapRecord` bei `ladderSummary`).

## Globale Rangliste und Workflow

- `public/ladder.json` wird von `.github/workflows/ladder.yml` **stündlich** auf `main` committet und auf wisp.place veröffentlicht. Deshalb ist `main` ständig in Bewegung.
- **Nie force-pushen.** Vor dem Push `git fetch && git merge origin/main`.
- `ladder.json` nicht von Hand ändern; Spieler in `public/players.json` (`players`, `blocked`) pflegen.

## Logging und Datenschutz

`src/telemetry.ts` sendet Fehler, Logins, Spielstarts und Ergebnisse (inkl. IP/Ort, Handle) an Better Stack. Das Source-Token steht öffentlich in `src/config.ts` (im Browser nicht vermeidbar). Keine weiteren personenbezogenen Daten ohne Absprache loggen, niemals Zugangs-Tokens oder Passwörter.

## Deploy

`npm run deploy` (baut und lädt `dist/` per `wispctl` hoch). Hinweise zur CLI: `skills/wisp-place/SKILL.md`. Zugangsdaten (App-Passwort, GitHub-Token) nie committen, nie in Logs oder Antworten ausgeben.

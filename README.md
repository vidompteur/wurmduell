# wurmduell
Ein Spiel wie Worms in dem zwei Würmer gegeneinander kämpfen und aufeinander schießen.

# Dev Guide 

Dieses Kapitel erklärt, wie du die Entwicklungsumgebung einrichtest, das Spiel lokal startest und als statische Seite auf wisp.place veröffentlichst. Node.js und npm brauchst du nur auf deinem Entwicklungsrechner; die fertige Seite läuft im Browser und benötigt kein Node auf dem Gerät der Spieler. [docs.npmjs](https://docs.npmjs.com/cli/v11/configuring-npm/install/)

## Voraussetzungen

Du brauchst:

- Ein Terminal
- Git, falls du das Projekt aus einem Repository klonst
- Node.js inklusive npm
- Einen ATProto-/Bluesky-Account für wisp.place
- Optional: IntelliJ oder WebStorm mit Coding-Agent

Prüfe zuerst, ob Node und npm bereits installiert sind:

```bash
node -v
npm -v
```

Wenn beide Befehle Versionsnummern ausgeben, kannst du direkt mit dem Projekt starten. npm empfiehlt ausdrücklich die Installation über einen Node-Version-Manager wie nvm; das vermeidet typische Berechtigungsprobleme bei global installierten Paketen.

## Node.js und npm installieren

### Linux mit nvm — empfohlen

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
```

Terminal schließen und neu öffnen, dann:

```bash
nvm install --lts
nvm use --lts
```

Prüfen:

```bash
node -v
npm -v
```

nvm installiert Node.js und npm und ermöglicht es, mehrere Node-Versionen parallel zu verwalten. Die LTS-Version ist für dieses Projekt die richtige Wahl.

### Debian/Ubuntu ohne nvm

```bash
sudo apt update
sudo apt install -y nodejs npm
```

Prüfen:

```bash
node -v
npm -v
```

Auf Debian/Ubuntu kann npm als separates Paket erforderlich sein; NodeSource-Installationen bringen npm in der Regel bereits mit. [github](https://github.com/linode/docs/blob/develop/docs/guides/development/nodejs/how-to-install-nodejs/index.md)

### Windows

Am einfachsten:

1. Node.js-Installer von [nodejs.org](https://nodejs.org) herunterladen.
2. Installer ausführen und Standardoptionen übernehmen.
3. Neue PowerShell oder Eingabeaufforderung öffnen.
4. Prüfen:

```powershell
node -v
npm -v
```

Für eine Linux-ähnliche Entwicklungsumgebung unter Windows ist WSL2 mit Ubuntu eine gute Alternative; dort kannst du denselben nvm-Workflow verwenden. [learn.microsoft](https://learn.microsoft.com/en-us/windows/dev-environment/javascript/nodejs-on-wsl)

## Projekt einrichten

Wenn du das Shell-Script bereits verwendet hast:
git clone dieses Projekt

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
| `npx wispctl --help` | wisp-CLI ohne globale Installation ausführen |

`npm run build` kompiliert TypeScript und erzeugt die statischen Dateien in `dist/`. Diese Dateien sind später genau das, was wisp.place ausliefert. 

## Handle konfigurieren

Ersetze vor dem ersten Deployment `<HANDLE>` durch deinen ATProto-/Bluesky-Handle, zum Beispiel `deinname.bsky.social`.

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

Der Browser öffnet sich zur Authentifizierung. Nach erfolgreichem Login kann wispctl in diesem Account deployen. [blog.wisp](https://blog.wisp.place/posts/wispctl-1-3-1/)

Alternativ kannst du dich direkt beim Deploy authentifizieren; wispctl unterstützt auch die Verwendung eines App-Passworts über die Umgebungsvariable `WISPCTL_APP_PASSWORD`. [blog.wisp](https://blog.wisp.place/posts/wispctl-1-3-1/)

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

Danach ist dein aktueller Stand unter `https://sites.wisp.place/deinname.bsky.social/wurmduell/` verfügbar. [blog.wisp](https://blog.wisp.place/posts/wispctl-1-3-1/)

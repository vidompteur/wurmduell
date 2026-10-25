# wisp-place Skill

**Verwendung:** Verwende diesen Skill wenn deployed, pullen oder statische Seiten auf wisp.place hosten soll werden.

## Wispplace CLI (wispctl) für static site hosting on AT Protocol

### Grundlegende Verwendung

- deploy a site: `wispctl deploy handle --path ./dist --site my-site`
- pull a site: `wispctl pull handle --site my-site --path ./my-site`
- serve locally: `wispctl serve handle --site my-site --port 8080`

### Wichtige Befehle und Optionen

**deploy:**
- `--path`: lokales Verzeichnis zum veröffentlichen
- `--site`: Name der Site (default: basename des Verzeichnisses)
- `--spa`: SPA Mode (`index.html` für alle Routen zurückgeben)
- `--directory`: Directory listing enabled
- `--force-gzip`: gzip Kompression erzwingen
- `--yes`: Bestätigung überspringen

**pull:**
- liest `place.wisp.fs` Record expandiert SubFS Records, fetch blobs, dekomprimieren

**serve:**
- downloadet/cachtet die Site lokal, serviert über HTTP, beobachtet firehose auf Änderungen

### Domain Management

```bash
# custom domain claim
wispctl domain claim handle --domain example.com --site my-site

# wisp subdomain (claim-subdomain only the label)
wispctl domain claim-subdomain handle --subdomain alice --site my-site

# status check
wispctl domain status handle --domain example.com

# map domain to site
wispctl domain add-site handle --domain example.com --site my-site

# dns verification for custom domains
wispctl domain verify handle --domain example.com

# delete domain
wispctl domain delete handle --domain example.com
```

### List und Delete Sites

```bash
wispctl list domains handle
wispctl list sites handle
wispctl site delete handle --site my-site --yes
```

### Login/Logout

```bash
wispctl login handle          # oauth session für current directory
wispctl logout                # current directory session clear
wispctl logout --all          # alle accounts forget
```

### Authentication

- `wispctl` verwendet oauth standardmäßig
- für ci/headless: pass ein app password mit `--password` oder `WISPCTL_APP_PASSWORD`
- global option: `wispctl --quiet ...` (suppresses progress output)

### Site Modellierung

**place.wisp.fs** (root manifest):
- collection: `place.wisp.fs`
- record key: site name (e.g., `my-site`)
- required campos: `site`, `root`, `createdAt`
- one record = one site
- files point at pds blobs, subfs point at `place.wisp.subfs`

**place.wisp.subfs** (subtree):
- collection: `place.wisp.subfs`
- no `site` field
- stores a directory root
- used for large sites when one manifest is too big
- `flat: true`: merge entries into parent directory (default)
- `flat: false`: place in subdirectory with entry name

**place.wisp.settings** (optional config):
- collection: `place.wisp.settings`
- record key: same as site rkey
- optional settings:
  - `directoryListing`: enable directory listing mode
  - `spaMode`: path for SPA routing (e.g., `index.html`)
  - `custom404`: custom 404 error page path
  - `indexFiles`: ordered filenames to try (default: `['index.html']`)
  - `cleanUrls`: enable clean URL routing (`/about` tries `/about.html`)
  - `headers`: custom HTTP headers

### File Content Handling

- blob bytes können gzip-komprimiert sein wenn `encoding: "gzip"`
- blob bytes können base64 text sein wenn `base64: true`
- wenn beides present, decode base64 first, dann gunzip
- serve response mit original `mimeType`

### TypeScript Interfaces für Agents

**FsMain** (place.wisp.fs):
```ts
interface FsMain {
  $type: 'place.wisp.fs'
  site: string
  root: FsDirectory
  fileCount?: number
  createdAt: string
}
```

**FsFile**:
```ts
interface FsFile {
  $type?: 'place.wisp.fs#file'
  type: 'file'
  blob: BlobRef
  encoding?: 'gzip'
  mimeType?: string
  base64?: boolean
}
```

**Fdirectory**:
```ts
interface FsDirectory {
  $type?: 'place.wisp.fs#directory'
  type: 'directory'
  entries: FsEntry[]
}
```

**Settings** (place.wisp.settings):
```ts
interface SettingsMain {
  $type: 'place.wisp.settings'
  directoryListing?: boolean
  spaMode?: string
  custom404?: string
  indexFiles?: string[]
  cleanUrls?: boolean
  headers?: CustomHeader[]
}

interface CustomHeader {
  name: string
  value: string
  path?: string // glob pattern or empty for all paths
}
```

### Lexicon IDs

- `place.wisp.fs` - Virtual filesystem manifest for a Wisp site
- `place.wisp.subfs` - Subtree referenced by place.wisp.fs records
- `place.wisp.settings` - Configuration settings for static sites

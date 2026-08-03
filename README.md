# Wavz

**Wavz** is a free, open-source internet radio player that gives you instant access to **50,000+ live radio stations** from every corner of the planet — streamed through an interactive 3D globe.

Built with **Tauri v2**, **React 19**, **TypeScript**, and **Rust** — fast, lightweight (~10 MB installer), and cross-platform: **Windows, macOS, Linux, and Android**.

---

## Screenshots

| Station Grid | 3D Globe | Player Bar |
|---|---|---|
| Browse & filter 50 000+ stations | Explore stations on a live globe | Persistent mini-player with controls |

---

## Features

### Discovery
- **50 000+ stations** — full index sourced from the community-run [radio-browser.info](https://radio-browser.info) directory
- **Interactive 3D Globe** — stations plotted by real coordinates; click a dot to listen instantly
- **Full-text search** — press `Ctrl+K` / `Cmd+K` anywhere, search by name, country, genre, or language
- **Smart filters** — filter by continent, country, tag/genre, or favorites
- **Top charts** — stations ordered by real click-count popularity

### Playback
- Gapless **play / pause / next / previous** with a persistent player bar
- **Stall recovery** — automatically retries flaky streams (3 attempts) and reconnects
- **Sleep timer** — auto-stop after 15 / 30 / 60 min
- Volume slider + mute
- Resume your last station on launch

### Data & Performance
- **Offline-first** — full station catalog cached locally (IndexedDB in browser, SQLite FTS5 on desktop/Android)
- **Background sync** — catalog refreshes automatically every 24 h
- **Web Worker filtering** — search & filter run off the main thread; the UI never stutters, even with 50 K rows
- **Virtualized grid** — smooth scrolling through thousands of station cards
- **Favicon cache** — station logos stored locally with 7-day TTL + LRU eviction
- **Favorites** — one-tap heart, persisted across sessions

### Privacy
- No accounts, no tracking, no ads
- All data stays on your device
- Streams connect directly to each station's server (HTTPS only)

---

## Tech Stack

| Layer | Technology |
|---|---|
| App shell | [Tauri v2](https://v2.tauri.app) (Rust + system WebView) |
| UI | [React 19](https://react.dev) + TypeScript (strict) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) + hand-tuned CSS variables |
| 3D globe | [react-globe.gl](https://github.com/vasturiano/react-globe.gl) (Three.js / WebGL) |
| State | [Zustand](https://zustand.docs.pmnd.rs) |
| Offline DB (native) | SQLite via [rusqlite](https://github.com/rusqlite/rusqlite) with FTS5 full-text index |
| Offline cache (web) | [IndexedDB](https://developer.mozilla.org/docs/Web/API/IndexedDB_API) via `idb` |
| Async runtime | [Tokio](https://tokio.rs) |
| Build | [Vite 8](https://vite.dev) |

---

## Project Structure

```
Radio-Global/
├── index.html                 # Web entry point
├── package.json               # npm scripts & dependencies
├── vite.config.ts             # Vite + Tailwind + React plugins
├── tsconfig.json
│
├── public/
│   ├── favicon.svg
│   └── icons.svg              # SVG sprite
│
├── src/                       # React frontend
│   ├── main.tsx               # React bootstrap
│   ├── App.tsx                # Root: boot, filtering orchestration, player glue
│   ├── index.css              # Global styles (Tailwind + design tokens)
│   │
│   ├── components/
│   │   ├── Header.tsx         # Logo, sync, favorites, on-air badge
│   │   ├── FilterBar.tsx      # Search box, continent/tag chips, country select
│   │   ├── StationGrid.tsx    # Virtualized card grid + progress bar
│   │   ├── StationCard.tsx    # Single station card
│   │   ├── GlobeView.tsx      # 3D globe, tooltips, now-playing marker
│   │   ├── PlayerBar.tsx      # Transport controls, volume, sleep timer
│   │   ├── SearchModal.tsx    # ⌘K quick-search overlay
│   │   └── Toast.tsx          # Notification toasts
│   │
│   ├── lib/
│   │   ├── api.ts             # radio-browser.info client, normalizers, continent mapping
│   │   ├── fetchStations.ts   # Batch downloader (4 mirrors, 1 000/batch, ≤ 50 K)
│   │   ├── audioEngine.ts     # Custom audio engine w/ stall recovery & reconnect
│   │   ├── stationCache.ts    # IndexedDB station persistence
│   │   ├── imageCache.ts      # IndexedDB favicon cache (LRU, 7-day TTL)
│   │   ├── storage.ts         # localStorage helpers (favorites, last-played)
│   │   ├── tauriApi.ts        # Tauri IPC wrapper + browser fallback
│   │   └── utils.ts           # escapeHtml, flags, highlight helpers
│   │
│   ├── store/store.ts         # Zustand global store
│   ├── types/index.ts         # Shared TypeScript types
│   └── workers/filter.worker.ts  # Off-main-thread filtering
│
├── src-tauri/                 # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json        # App identity, window, CSP, bundle
│   ├── build.rs
│   ├── capabilities/default.json
│   ├── icons/                 # Windows / macOS / iOS / Android icon sets
│   └── src/
│       ├── main.rs            # Entry point
│       └── lib.rs             # SQLite + FTS5, 11 Tauri commands, daily auto-sync
│
└── src.old/                   # Legacy vanilla-JS version (reference only)
```

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| [Node.js](https://nodejs.org) | ≥ 20 | Frontend toolchain |
| [Rust](https://rustup.rs) | stable (≥ 1.77) | Tauri backend |
| Tauri CLI | `npm i -D @tauri-apps/cli` v2 | Build & dev commands |

### For Android builds additionally

| Tool | Version |
|---|---|
| JDK (Temurin / OpenJDK) | 17 |
| Android SDK Command-line Tools | latest |
| Android Platform | **android-36** (Android 16) |
| Android NDK | r27+ |
| Rust Android targets | `aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android` |

---

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2a. Run in the browser (pure web mode, no Rust needed)
npm run dev
# → http://localhost:5173

# 2b. Run as a desktop app (requires Rust toolchain)
npm run tauri dev
```

---

## Building

### Desktop — Windows / macOS / Linux

```bash
npm run tauri build
```

Bundles land in `src-tauri/target/release/bundle/`:
- Windows → `.msi`, `.exe` (NSIS)
- macOS → `.app`, `.dmg`
- Linux → `.AppImage`, `.deb`

### Android — APK / AAB (Android 16, API 36)

One-time setup:

```powershell
# Rust Android targets
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android

# Point the CLI at your SDK / NDK
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME     = "$env:ANDROID_HOME\ndk\<version>"

# Generate the Android project (once)
npm run tauri android init
```

Debug APK (fast, for testing):

```bash
npm run tauri android build -- --apk
```

Release APK (optimized):

```bash
npm run tauri android build -- --apk --release
```

Outputs:

```
src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
```

> **Target SDK** is set to **36 (Android 16)** in `src-tauri/gen/android/app/build.gradle.kts`; minimum SDK 24 (Android 7.0).
> Release APKs are signed with the debug keystore by default — generate your own keystore with `keytool` and configure it in `build.gradle.kts` for Play Store distribution.

---

## Android Permissions

Declared automatically / manually in `AndroidManifest.xml`:

| Permission | Why |
|---|---|
| `INTERNET` | Streaming audio & fetching the station directory |
| `ACCESS_NETWORK_STATE` | Detect connectivity loss for auto-reconnect |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Keep audio alive with the screen off |

---

## Configuration

| File | What it controls |
|---|---|
| `src-tauri/tauri.conf.json` | App id (`com.wavz.app`), window size, CSP, bundle icons |
| `src/index.css` | Design tokens (colors, shadows, radii) |
| `src/lib/fetchStations.ts` | Mirror list, batch size, station cap |

**Content Security Policy** (desktop):

```
default-src 'self';
connect-src 'self' https://*.api.radio-browser.info https://raw.githubusercontent.com;
media-src  'self' https:;
img-src    'self' blob: data: https:;
```

---

## Data Source

All station metadata comes from **[radio-browser.info](https://www.radio-browser.info)** — a free, community-driven wiki of internet radio stations.
- Catalog fetched from 4 rotating mirrors (`de1`, `nl1`, `fr1`, `at1`)
- Only `https://` streams with passing health checks are kept
- Streams connect directly to broadcasters; Wavz never proxies audio

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Ctrl / Cmd + K` | Open quick search |
| `Esc` | Close dialogs |
| `Space` | Play / pause |
| `←` / `→` | Previous / next station |

---

## License

MIT — see `LICENSE`.

Station metadata © radio-browser.info contributors (open data).
Audio streams © their respective broadcasters.

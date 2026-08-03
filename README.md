<p align="center">
  <img src="src-tauri/icons/icon.png" alt="Nostu Wavzz" width="120" />
</p>

<h1 align="center">Nostu Wavzz</h1>

<p align="center">
  <strong>Rediscover the magic of radio.</strong><br />
  50,000+ live stations from every corner of the planet, streaming freely.<br />
  No account. No ads. Just you and the dial.
</p>

<p align="center">
  <a href="https://github.com/sreyassanker/NostuWavzz/releases">
    <img src="https://img.shields.io/badge/Download-APK-ff4d6d?style=for-the-badge" alt="Download APK" />
  </a>
  <a href="#license">
    <img src="https://img.shields.io/badge/License-MIT-7a766a?style=for-the-badge" alt="MIT License" />
  </a>
  <a href="https://github.com/sreyassanker">
    <img src="https://img.shields.io/badge/Author-@sreyassanker-1c1c18?style=for-the-badge" alt="Author" />
  </a>
</p>

---

## What is Nostu Wavzz?

Nostu Wavzz is a free, open-source internet radio player that brings back the nostalgia of radio — that feeling of tuning in to a distant city, discovering a new station, and letting the music carry you away.

Built with **Tauri v2**, **React 19**, **TypeScript**, and **Rust** — fast, lightweight (~10 MB installer), and cross-platform: **Windows, macOS, Linux, and Android**.

---

## Features

### Discovery
- **50,000+ stations** — full index sourced from the community-run [radio-browser.info](https://radio-browser.info) directory
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
- **Background sync** — catalog refreshes automatically every 24h
- **Web Worker filtering** — search & filter run off the main thread; the UI never stutters, even with 50K rows
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
NostuWavzz/
├── index.html                 # Web entry point
├── package.json               # npm scripts & dependencies
├── vite.config.ts             # Vite + Tailwind + React plugins
├── tsconfig.json
│
├── src/                       # React frontend
│   ├── main.tsx               # React bootstrap
│   ├── App.tsx                # Root: boot, filtering, player logic
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
│   │   ├── fetchStations.ts   # Batch downloader (4 mirrors, 1K/batch, ≤50K)
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
│   ├── icons/                 # App icons (all platforms)
│   └── src/
│       ├── main.rs            # Entry point
│       └── lib.rs             # SQLite + FTS5, 11 Tauri commands, daily auto-sync
│
└── docs/                      # Landing page
    └── index.html             # Professional marketing site
```

---

## Getting Started

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| [Node.js](https://nodejs.org) | ≥ 20 | Frontend toolchain |
| [Rust](https://rustup.rs) | stable (≥ 1.77) | Tauri backend |
| Tauri CLI | `npm i -D @tauri-apps/cli` v2 | Build & dev commands |

### Run in Browser

```bash
npm install
npm run dev
# → http://localhost:5173
```

### Run as Desktop App

```bash
npm install
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

### Android

One-time setup:

```bash
# Rust Android targets
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android

# Set environment variables
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/<version>"

# Generate the Android project
npm run tauri android init
```

Build APK:

```bash
# Debug
npm run tauri android build -- --apk

# Release
npm run tauri android build -- --apk --release
```

> **Target SDK:** 36 (Android 16) | **Min SDK:** 24 (Android 7.0)

---

## Configuration

| File | Description |
|---|---|
| `src-tauri/tauri.conf.json` | App id, window size, CSP, bundle icons |
| `src/index.css` | Design tokens (colors, shadows, radii) |
| `src/lib/fetchStations.ts` | Mirror list, batch size, station cap |

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

[MIT](LICENSE) — Copyright © 2026 Nostu Wavzz

Station metadata © [radio-browser.info](https://www.radio-browser.info) contributors (open data).  
Audio streams © their respective broadcasters.

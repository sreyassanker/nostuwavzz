# Nostu Wavzz v0.2.0

**Second public release of Nostu Wavzz** — global internet radio player with an interactive 3D globe.

**50,000+ live stations** | **No account, no ads, no tracking** | **MIT licensed**

---

## 📥 Download

| Platform | File | Size |
|---|---|---|
| **Android 7.0+** (arm64) | [nostu-wavzz-v0.2.0.apk](./nostu-wavzz-v0.2.0.apk) | 18 MB |

### Install on Android
1. Download the APK above.
2. On your phone, open the file → Allow "Install from unknown sources" → Install.
3. First launch will sync the 50K-station catalog in seconds.

> **Note:** Uninstall any older version first — the signing key changed between v0.1.0 and v0.2.0.

---

## What's new in v0.2.0

- **Lock-screen & notification controls** — native Android media notification with play/pause/next/previous, station artwork, and hardware-button support (`tauri-plugin-media-session`)
- **Crossfade** — a smooth 1.2-second volume fade when switching stations
- **Sleep timer survives restarts** — the countdown is restored if you relaunch the app
- **Faster globe** — texture-based rendering with smart point subsampling, zero lag with 50K stations
- **Fixed playback on release builds** — cleartext (`http://`) radio streams now play on Android
- **Data saver mode** — skip station-logo downloads on cellular connections
- **Light & dark themes** — follow your system, or pick manually

## What's inside

- **50,000+ live radio stations** from [radio-browser.info](https://radio-browser.info) — updated daily
- **Interactive 3D globe** — spin the Earth and tap any station dot to listen instantly
- **Full-text search (⌘K)** — find any station in < 50 ms
- **Offline-first** — SQLite FTS5 catalog cached locally, works offline
- **Smart stall recovery** — auto-retries up to 3 times, reconnects silently
- **Sleep timer** — auto-stop after 15 / 30 / 60 min
- **Prev/next + volume slider**
- **6 continental filters** — North America, South America, Europe, Africa, Asia Pacific, Middle East
- **188 countries, 100+ languages**

---

## For developers

| Stack | Description |
|---|---|
| Frontend | React 19 + TypeScript + Vite v8 |
| Styling | Tailwind CSS v4 |
| 3D globe | react-globe.gl (Three.js/WebGL) |
| State | Zustand |
| Offline DB | SQLite via rusqlite (FTS5 full-text search) |
| Native media controls | tauri-plugin-media-session |
| Async runtime | Tokio |
| Android | Tauri v2 → APK, arm64 |
| Audio | Custom engine with crossfade + stall recovery |

```bash
# Run in browser
npm install && npm run dev

# Desktop dev
npm run tauri dev

# Desktop build
npm run tauri build

# Android release APK (see README for prerequisites)
npx tauri android build --target aarch64
```

---

## Verification

| | |
|---|---|
| **APK SHA-256** | `0FC8B709ADE478CFF5796C60B570FF78D638662D0FEA68254C34C5D8FE59CEC7` |
| **Min SDK** | 24 (Android 7.0) |
| **Target SDK** | 36 (Android 16) |
| **ABIs** | `arm64-v8a` |
| **Permissions** | INTERNET, POST_NOTIFICATIONS, FOREGROUND_SERVICE, FOREGROUND_SERVICE_MEDIA_PLAYBACK, WAKE_LOCK |

> **Security note:** APK is self-signed with our release key (RSA-2048, SHA-256). Verify the fingerprint above matches after download. Never sideload from mirror sites.

---

**Contributions welcome!** Open an issue if a station is broken or missing.

# Nostu Wavzz v3.0.0

**Third public release of Nostu Wavzz** — global internet radio player with an interactive 3D globe.

**50,000+ live stations** | **No account, no ads, no tracking** | **MIT licensed**

---

## 📥 Download

| Platform | File | Size |
|---|---|---|
| **Android 7.0+** (arm64) | [nostu-wavzz-v3.0.0.apk](./nostu-wavzz-v3.0.0.apk) | 12.5 MB |

### Install on Android
1. Download the APK above.
2. On your phone, open the file → Allow "Install from unknown sources" → Install.
3. First launch will sync the 50K-station catalog in seconds.

> **Note:** v3.0.0 keeps the same signing key as v0.2.0, so it installs as an in-place update over v0.2.0 (versionCode 3000000 > 2000). If you're on v0.1.0, uninstall first.

---

## What's new in v3.0.0

### Playback engine rebuild
- **Crossfade is now cancellable** — switching stations, pausing, or stopping mid-fade no longer lets the old stream "resume" after a stop or sleep timer fires
- **Volume is honored during crossfade** — the fade never jumps to 100% volume anymore
- **Stall recovery actually gives up** — a dead stream retries a bounded number of times, then shows "Station unavailable" instead of reconnecting forever
- **Pause really pauses** — lock-screen / Bluetooth pause cancels pending reconnects so audio can't restart on its own
- **Accurate play state** — the UI and lock screen no longer claim "playing" when a stream failed
- **Pause & resume** — tapping play/pause now pauses your current station instead of tearing it down; resume works from the mini player, full player, and lock screen
- **Recently played only records real plays** — failed stations no longer pollute the recent list
- **Media session initialized on Android** — native lock-screen events now actually connect (`tauri-plugin-media-session`)
- **Playback teardown on unmount** — no leaked timers or duplicate boots in dev (StrictMode-safe)

### Sleep timer
- Timer state clears after it fires, persisted timers survive page reloads without drifting, and timers are cleaned up on unmount

### UI / layering
- **Station Info panel fixed** — it's now portaled above everything (was painted *behind* the player and clipped by the virtual grid)
- **Card ⋯ menu fixed** — portaled + smartly positioned; no longer clipped or hidden under the mini player
- **Mini-player drag dead-zone fixed** — a short horizontal drag on the artwork now opens the full player instead of doing nothing
- **Full player gestures** — swipe down to dismiss, swipe left/right to change stations
- **Full player overflow** — sheet is scrollable on short/landscape screens instead of clipping
- **Escape closes** the full player and info modal; full-player sleep menu closes on outside tap
- **Settings & globe legend** no longer hidden behind the mini player on mobile; toasts no longer block taps
- **Responsive station grid** — column count adapts to the panel width (2–4), and row height scales with the compact/normal/cozy density setting

### Data & robustness
- Completed syncs no longer wipe your active filters
- Fixed stale-closure bugs in the "network restored" toast and boot completion state
- Safer `localStorage` reads (private-mode safe) and consistent sleep-timer boot state

---

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

- **Bottom-sheet player** — persistent mini pill that expands into a full player; swipe left/right to switch stations
- **Lock-screen & notification controls** — native Android media notification with play/pause/next/previous, station artwork, and hardware-button support (`tauri-plugin-media-session`)
- **Audio focus + auto-resume** — pauses when a call or other app takes audio; resumes when you reconnect Bluetooth or headphones
- **Dynamic accent from station art** — the app tints itself with the artwork of the currently playing station
- **Pure black (AMOLED) mode** — deep-black backgrounds in dark mode
- **Recently played row** — one-tap access to your latest stations
- **Searchable settings** — find any setting instantly, with compact/normal/cozy density
- **Crossfade (adjustable)** — optional smooth fade between stations, 0.5–3s, on by default
- **Sleep timer fades out** — gently lowers the volume before stopping; countdown survives restarts
- **Buffering indicator** — inline banner while a stream stalls
- **Faster globe** — texture-based rendering with smart point subsampling, zero lag with 50K stations
- **Fixed playback on release builds** — cleartext (`http://`) radio streams now play on Android
- **Data saver mode** — skip station-logo downloads on cellular connections

## What's inside

- **50,000+ live radio stations** from [radio-browser.info](https://radio-browser.info) — updated daily
- **Interactive 3D globe** — spin the Earth and tap any station dot to listen instantly
- **Full-text search (⌘K)** — find any station in < 50 ms
- **Offline-first** — SQLite FTS5 catalog cached locally, works offline
- **Smart stall recovery** — auto-retries up to 3 times, reconnects silently
- **Sleep timer** — auto-stop after 15 / 30 / 60 min, with a gentle fade-out
- **Bottom-sheet player** — swipe to switch stations, volume slider, sleep timer
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
| **APK SHA-256** | `CF922F5D8FB44B5DC7317F4391FEAAEB89A7B6945C46EBC82A87BC2DF6BFF6AE` |
| **Min SDK** | 24 (Android 7.0) |
| **Target SDK** | 36 (Android 16) |
| **ABIs** | `arm64-v8a` |
| **Signing** | APK Signature Scheme v2 + v3 |
| **Permissions** | INTERNET, POST_NOTIFICATIONS, FOREGROUND_SERVICE, FOREGROUND_SERVICE_MEDIA_PLAYBACK, WAKE_LOCK |

> **Security note:** APK is self-signed with our release key (RSA-2048, SHA-256). Verify the fingerprint above matches after download. Never sideload from mirror sites.

---

**Contributions welcome!** Open an issue if a station is broken or missing.

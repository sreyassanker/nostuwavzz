# Nostu Wavzz v0.1.0

**First public release of Nostu Wavzz** — global internet radio player with an interactive 3D globe.

**50,000+ live stations** | **No account, no ads, no tracking** | **MIT licensed**

---

## 📥 Download

| Platform | File | Size |
|---|---|---|
| **Android 7.0+** (arm64) | [nostu-wavzz-v0.1.0-arm64.apk](./nostu-wavzz-v0.1.0-arm64.apk) | 17.8 MB |

### Install on Android
1. Download the APK above.
2. On your phone, open the file → Allow "Install from unknown sources" → Install.
3. First launch will sync the 50K-station catalog in seconds.

---

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
| Async runtime | Tokio |
| Android | Tauri v2 → APK, arm64 |
| Audio | Custom stall-recovery engine |

```bash
# Run in browser
npm install && npm run dev

# Desktop dev
npm run tauri dev

# Desktop build
npm run tauri build

# Android APK (see README for full prerequisites)
npm run tauri android build -- --apk
```

---

## Verification

| | |
|---|---|
| **APK SHA-256** | `35A703B85C8DDB2A6A12A9E2C7C73F61F28FD25B0769AECCF3A60ED4ABA3F1A6` |
| **Min SDK** | 24 (Android 7.0) |
| **Target SDK** | 36 (Android 16) |
| **ABIs** | `arm64-v8a` |
| **Permissions** | INTERNET, FOREGROUND_SERVICE, ACCESS_NETWORK_STATE |

> **Security note:** APK is self-signed with our release key (RSA-2048, SHA-256). Verify the fingerprint above matches after download. Never sideload from mirror sites.

---

**Contributions welcome!** Open an issue if a station is broken or missing.

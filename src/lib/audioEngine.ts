import type { Station } from '../types';
import { useStore, EQ_FREQUENCIES } from '../store/store';
import {
  updateState,
  onAction,
  clear,
  initialize as initNativeSession,
  isTauriAndroid as useNativeMediaSession,
} from './mediaSession';

export type MediaActionHandler = () => void;

const CROSSFADE_STEPS = 24;
const VOLUME_KEY = 'radio.volume';
const EQ_Q = 1;

function loadSavedVolume(): number {
  try {
    const saved = localStorage.getItem(VOLUME_KEY);
    if (saved) {
      const v = parseFloat(saved);
      if (!isNaN(v) && v >= 0 && v <= 1) return v;
    }
  } catch {}
  return 1;
}

declare global {
  interface HTMLMediaElement {
    __nostuGen?: number;
  }
}

export class AudioEngine extends EventTarget {
  private audio: HTMLAudioElement;
  private oldAudio: HTMLAudioElement | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private currentUrl: string | null = null;
  private lastStationUuid: string | null = null;
  private reconnectTimers: ReturnType<typeof setTimeout>[] = [];
  private crossfadeInterval: ReturnType<typeof setInterval> | null = null;
  private reconnecting = false;
  private generation = 0;
  private onNext: MediaActionHandler | null = null;
  private onPrev: MediaActionHandler | null = null;
  private isFadingOut = false;
  private playbackActive = false;
  private everPlayed = false;
  private failedDispatched = false;
  private volume = loadSavedVolume();
  private nativeListener: Awaited<ReturnType<typeof onAction>> | null = null;

  // Web Audio graph
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private bassNode: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private panner: StereoPannerNode | null = null;
  private webAudioEnabled = false;

  private crossfadeMs(): number {
    const { crossfadeDuration } = useStore.getState();
    return crossfadeDuration * 1000;
  }

  private crossfadeEnabled(): boolean {
    return useStore.getState().crossfade;
  }

  private bufferStallMs(): number {
    const preset = useStore.getState().bufferPreset;
    if (preset === 'low') return this.everPlayed ? 1500 : 2500;
    if (preset === 'high') return this.everPlayed ? 6000 : 8000;
    return this.everPlayed ? 3000 : 4500;
  }

  constructor() {
    super();
    this.audio = this.createAudioElement();
    this.audio.volume = this.volume;
    this.setupMediaSession();
    if (useNativeMediaSession) {
      this.setupNativeSession();
    }
  }

  // ── Web Audio helpers ──────────────────────────────────────

  private async ensureAudioContext(): Promise<void> {
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') {
        try { await this.audioCtx.resume(); } catch {}
      }
      return;
    }
    try {
      const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      if (!Ctx) return;
      this.audioCtx = new Ctx();
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.volume;
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.78;
      this.analyser.connect(this.audioCtx.destination);
      // gain -> analyser already? We'll connect chain later
      this.gainNode.connect(this.analyser);
      // EQ filters
      this.eqFilters = EQ_FREQUENCIES.map((freq) => {
        const f = this.audioCtx!.createBiquadFilter();
        f.type = 'peaking';
        f.frequency.value = freq;
        f.Q.value = EQ_Q;
        f.gain.value = 0;
        return f;
      });
      // Bass boost (low shelf at 120 Hz)
      this.bassNode = this.audioCtx.createBiquadFilter();
      this.bassNode.type = 'lowshelf';
      this.bassNode.frequency.value = 120;
      this.bassNode.gain.value = 0;
      // Compressor (night mode)
      this.compressor = this.audioCtx.createDynamicsCompressor();
      this.compressor.threshold.value = -24;
      this.compressor.knee.value = 30;
      this.compressor.ratio.value = 8;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;
      // Stereo panner (spatial)
      try {
        this.panner = this.audioCtx.createStereoPanner();
      } catch {
        this.panner = null;
      }
      this.applyEqGains();
      this.applyBassBoost();
      this.webAudioEnabled = true;
    } catch {
      this.webAudioEnabled = false;
    }
  }

  private attachWebAudio(el: HTMLAudioElement): void {
    if (!this.webAudioEnabled && !this.audioCtx) {
      this.ensureAudioContext();
    }
    if (!this.audioCtx || !this.gainNode || !this.analyser) return;
    // Resume if suspended (user gesture context)
    if (this.audioCtx.state === 'suspended') void this.audioCtx.resume().catch(() => {});
    // Disconnect previous source
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch {}
      this.sourceNode = null;
    }
    try {
      // Must set crossOrigin before source creation / playback
      el.crossOrigin = 'anonymous';
      this.sourceNode = this.audioCtx.createMediaElementSource(el);
      this.rebuildGraph();
    } catch {
      // CORS or already connected — disable Web Audio for this element
      this.webAudioEnabled = false;
      if (this.sourceNode) { try { this.sourceNode.disconnect(); } catch {} this.sourceNode = null; }
    }
  }

  private rebuildGraph(): void {
    if (!this.audioCtx || !this.sourceNode || !this.gainNode || !this.analyser) return;
    try { this.sourceNode.disconnect(); } catch {}
    this.eqFilters.forEach((f) => { try { f.disconnect(); } catch {} });
    if (this.bassNode) try { this.bassNode.disconnect(); } catch {}
    if (this.compressor) try { this.compressor.disconnect(); } catch {}
    if (this.panner) try { this.panner.disconnect(); } catch {}
    try { this.gainNode.disconnect(); } catch {}

    const { eqEnabled, bassBoost, nightMode, spatialEnabled } = useStore.getState();
    let last: AudioNode = this.sourceNode;

    // EQ chain
    if (eqEnabled && this.eqFilters.length) {
      for (let i = 0; i < this.eqFilters.length; i++) {
        last.connect(this.eqFilters[i]);
        last = this.eqFilters[i];
      }
    }

    // Bass boost
    if (bassBoost && this.bassNode) {
      last.connect(this.bassNode);
      last = this.bassNode;
    }

    // Night mode compressor
    if (nightMode && this.compressor) {
      last.connect(this.compressor);
      last = this.compressor;
    }

    // Spatial — subtle stereo widening via panner
    if (spatialEnabled && this.panner) {
      // Slight pan modulation left/right based on time? Static 0 keeps chain but enables future LFO
      last.connect(this.panner);
      last = this.panner;
    }

    last.connect(this.gainNode);
    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);
    // Keep element volume at 1 when routed via graph (element volume not reflected in MediaElementSource)
    // Volume now controlled via gainNode
    this.gainNode.gain.value = this.volume;
  }

  private detachWebAudio(): void {
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch {}
      this.sourceNode = null;
    }
  }

  private applyEqGains(): void {
    const gains = useStore.getState().eqGains;
    this.eqFilters.forEach((f, i) => {
      f.gain.value = gains[i] ?? 0;
    });
  }

  private applyBassBoost(): void {
    if (!this.bassNode) return;
    this.bassNode.gain.value = useStore.getState().bassBoost ? 10 : 0;
  }

  // Public controls for UI
  getAnalyser(): AnalyserNode | null {
    return this.analyser && this.webAudioEnabled ? this.analyser : null;
  }

  isWebAudioActive(): boolean {
    return this.webAudioEnabled && !!this.analyser;
  }

  setEqGains(gains: number[]): void {
    gains.forEach((v, i) => {
      if (this.eqFilters[i]) this.eqFilters[i].gain.value = v;
    });
  }

  setEqGain(index: number, value: number): void {
    if (this.eqFilters[index]) this.eqFilters[index].gain.value = value;
  }

  setEqEnabled(enabled: boolean): void {
    this.rebuildGraph();
    void enabled;
  }

  setBassBoost(): void { this.rebuildGraph(); }
  setSpatialEnabled(): void { this.rebuildGraph(); }
  setNightMode(): void { this.rebuildGraph(); }

  setVisualizerEnabled(enabled: boolean): void {
    if (!enabled) this.analyser = null;
    else if (!this.analyser && this.audioCtx) {
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.78;
      this.rebuildGraph();
    }
  }

  private createAudioElement(): HTMLAudioElement {
    const el = new Audio();
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';

    el.addEventListener('stalled', () => this.handleStall(el));
    el.addEventListener('waiting', () => this.handleStall(el));
    el.addEventListener('playing', () => this.handlePlaying(el));
    el.addEventListener('canplay', () => this.clearStall());
    el.addEventListener('error', () => this.handleError(el.error?.code));
    el.addEventListener('ended', () => this.handleEnded());
    el.addEventListener('loadstart', () => {
      this.dispatchEvent(new CustomEvent('loading', { detail: { url: this.currentUrl } }));
    });

    return el;
  }

  setCallbacks(onNext: MediaActionHandler, onPrev: MediaActionHandler) {
    this.onNext = onNext;
    this.onPrev = onPrev;
  }

  private setupMediaSession() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => this.mediaPlay());
    navigator.mediaSession.setActionHandler('pause', () => this.mediaPause());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.onNext?.());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.onPrev?.());
    navigator.mediaSession.setActionHandler('seekto', null);
    navigator.mediaSession.setActionHandler('seekbackward', null);
    navigator.mediaSession.setActionHandler('seekforward', null);
  }

  private setupNativeSession() {
    initNativeSession().catch(() => {});
    onAction((event) => {
      switch (event.action) {
        case 'play':
          this.mediaPlay();
          break;
        case 'pause':
          this.mediaPause();
          break;
        case 'next':
          this.onNext?.();
          break;
        case 'previous':
          this.onPrev?.();
          break;
        case 'stop':
          this.stop();
          break;
        default:
          break;
      }
    })
      .then((listener) => {
        this.nativeListener = listener;
      })
      .catch(() => {});
  }

  private setPlaybackStatePlaying() {
    if (useNativeMediaSession) {
      void updateState({ isPlaying: true }).catch(() => {});
    } else if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
  }

  private setPlaybackStatePaused() {
    if (useNativeMediaSession) {
      void updateState({ isPlaying: false }).catch(() => {});
    } else if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }

  private setPlaybackStateNone() {
    if (useNativeMediaSession) {
      void clear().catch(() => {});
    } else if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
    }
  }

  private updateMediaMetadata(station: Station) {
    const artwork = station.favicon
      ? [{ src: station.favicon, sizes: '512x512', type: 'image/png' }]
      : [];

    if (useNativeMediaSession) {
      void updateState({
        title: station.name,
        artist: station.country || 'Live Radio',
        album: 'Nostu Wavzz',
        artworkUrl: station.favicon || undefined,
        canPrev: true,
        canNext: true,
      }).catch(() => {});
    } else if ('mediaSession' in navigator) {
      try {
        (navigator.mediaSession as unknown as { metadata?: unknown }).metadata =
          new MediaMetadata({ title: station.name, artist: station.country || 'Live Radio', album: 'Nostu Wavzz', artwork });
      } catch {
        // Metro/older webviews may not support MediaMetadata
      }
    }
  }

  updateLiveMetadata(title: string, artist?: string | null) {
    const station = useStore.getState().player.currentStation;
    if (!station) return;
    const display = artist ? `${artist} - ${title}` : title;
    this.updateMediaMetadata({ ...station, name: display, country: artist || station.country });
  }

  private handlePlaying(el: HTMLAudioElement) {
    if (el.__nostuGen !== this.generation) return;
    this.clearStall();
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this.everPlayed = true;
    this.playbackActive = true;
    this.setPlaybackStatePlaying();
    if (this.audioCtx?.state === 'suspended') void this.audioCtx.resume().catch(() => {});
    this.dispatchEvent(
      new CustomEvent('playing', { detail: { url: this.currentUrl, stationuuid: this.lastStationUuid } })
    );
  }

  private isStale(el: HTMLAudioElement): boolean {
    return el.__nostuGen !== this.generation || (this.audio !== el && this.oldAudio !== el);
  }

  async play(url: string, stationuuid?: string, station?: Station): Promise<void> {
    const wasPlaying = this.playbackActive;

    this.generation++;
    this.cancelCrossfade();
    this.cancelReconnectTimers();
    this.clearStall();

    this.currentUrl = url;
    this.lastStationUuid = stationuuid || null;
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this.playbackActive = false;
    this.everPlayed = false;
    this.failedDispatched = false;

    if (station) {
      this.updateMediaMetadata(station);
    }

    // Fire-and-forget: prime the AudioContext in the background.
    // We must NOT await here because on Android WebView any await between
    // the user-gesture event and el.play() breaks the gesture chain,
    // causing el.play() to throw NotAllowedError (first-click closes).
    void this.ensureAudioContext();

    if (wasPlaying && this.audio.src && this.crossfadeEnabled()) {
      this.beginCrossfade(url);
    } else {
      this.setupAudioForUrl(url);
    }
  }

  private setupAudioForUrl(url: string) {
    this.oldAudio = null;
    const el = this.audio;
    el.__nostuGen = this.generation;
    el.pause();
    el.removeAttribute('src');
    el.load();
    el.src = url;
    el.load();
    if (this.webAudioEnabled && this.gainNode) {
      el.volume = 1;
      this.gainNode.gain.value = this.volume;
    } else {
      el.volume = this.volume;
    }
    this.attachWebAudio(el);
    try {
      void el.play().catch((err) => this.handlePlayError(err));
    } catch {
      // ignored
    }
  }

  private beginCrossfade(newUrl: string) {
    const oldAudio = this.audio;
    const gen = this.generation;
    // Detach old element from graph — crossfade via element volume for reliability
    this.detachWebAudio();
    const newAudio = this.createAudioElement();
    newAudio.__nostuGen = gen;
    newAudio.volume = 0;
    this.oldAudio = oldAudio;
    this.audio = newAudio;
    this.isFadingOut = true;

    newAudio.src = newUrl;
    newAudio.load();

    const duration = this.crossfadeMs();
    const intervalMs = Math.max(16, duration / CROSSFADE_STEPS);
    const targetVolume = this.volume;
    let step = 0;

    this.crossfadeInterval = setInterval(() => {
      if (gen !== this.generation) {
        if (this.crossfadeInterval) {
          clearInterval(this.crossfadeInterval);
          this.crossfadeInterval = null;
        }
        this.isFadingOut = false;
        this.teardownAudio(oldAudio);
        return;
      }

      step++;
      const progress = step / CROSSFADE_STEPS;
      const eased = 1 - Math.pow(1 - progress, 3);
      oldAudio.volume = Math.max(0, (1 - eased) * targetVolume);
      newAudio.volume = Math.min(targetVolume, eased * targetVolume);

      if (step >= CROSSFADE_STEPS) {
        if (this.crossfadeInterval) {
          clearInterval(this.crossfadeInterval);
          this.crossfadeInterval = null;
        }
        this.isFadingOut = false;
        this.oldAudio = null;
        this.teardownAudio(oldAudio);
        newAudio.volume = targetVolume;
        // Re-attach Web Audio to the new element after crossfade
        if (this.webAudioEnabled) {
          this.attachWebAudio(newAudio);
          if (this.gainNode) this.gainNode.gain.value = targetVolume;
          newAudio.volume = 1;
        }
        newAudio.play().catch((err) => this.handlePlayError(err));
        this.playbackActive = true;
      } else {
        newAudio.play().catch(() => {});
      }
    }, intervalMs);
  }

  private teardownAudio(el: HTMLAudioElement) {
    try {
      el.pause();
      el.removeAttribute('src');
      el.load();
    } catch {
      // ignore
    }
  }

  private cancelCrossfade() {
    if (this.crossfadeInterval) {
      clearInterval(this.crossfadeInterval);
      this.crossfadeInterval = null;
    }
    if (this.oldAudio) {
      this.teardownAudio(this.oldAudio);
      this.oldAudio = null;
    }
    this.isFadingOut = false;
  }

  private cancelReconnectTimers() {
    this.reconnectTimers.forEach((t) => clearTimeout(t));
    this.reconnectTimers = [];
  }

  private reconnect(url: string) {
    if (this.reconnecting) return;
    this.reconnecting = true;
    const gen = this.generation;
    const el = this.audio;

    el.pause();
    el.removeAttribute('src');
    el.load();
    el.src = url;
    el.load();
    if (this.webAudioEnabled && this.gainNode) {
      el.volume = 1;
      this.gainNode.gain.value = this.volume;
    } else {
      el.volume = this.volume;
    }
    // Re-attach graph after src swap
    this.attachWebAudio(el);
    el.play()
      .then(() => {
        if (gen === this.generation) this.reconnecting = false;
      })
      .catch(() => {
        if (gen === this.generation) this.reconnecting = false;
      });
  }

  private handlePlayError(err: unknown) {
    const name = (err as DOMException)?.name;
    if (name === 'AbortError' || name === 'NotAllowedError') {
      this.reconnecting = false;
      return;
    }
    const gen = this.generation;
    const maxAttempts = this.everPlayed ? 6 : 3;
    if (this.reconnectAttempts >= maxAttempts) {
      if (gen !== this.generation) return;
      this.reconnecting = false;
      this.playbackActive = false;
      this.everPlayed = false;
      this.reconnectAttempts = 0;
      if (!this.failedDispatched) {
        this.failedDispatched = true;
        this.dispatchEvent(
          new CustomEvent('failed', {
            detail: { url: this.currentUrl, reason: 'play_rejected', stationuuid: this.lastStationUuid },
          })
        );
      }
      return;
    }

    this.reconnectAttempts++;
    const url = this.currentUrl;
    const timer = setTimeout(() => {
      if (gen === this.generation && url && this.currentUrl === url) {
        this.reconnect(url);
      }
    }, 350);
    this.reconnectTimers.push(timer);
  }

  private handleStall(el: HTMLAudioElement) {
    if (this.isStale(el)) return;
    if (this.stallTimer) return;

    this.dispatchEvent(new CustomEvent('buffering'));

    const gen = this.generation;
    const url = this.currentUrl;
    this.stallTimer = setTimeout(() => {
      this.stallTimer = null;
      if (gen !== this.generation || !url || this.currentUrl !== url) return;
      const maxAttempts = this.everPlayed ? 6 : 2;
      if (this.reconnectAttempts >= maxAttempts) {
        this.reconnecting = false;
        this.playbackActive = false;
        this.everPlayed = false;
        this.reconnectAttempts = 0;
        if (!this.failedDispatched) {
          this.failedDispatched = true;
          this.dispatchEvent(
            new CustomEvent('failed', {
              detail: {
                url: url,
                reason: 'stall_timeout',
                stationuuid: this.lastStationUuid,
              },
            })
          );
        }
      } else {
        this.reconnectAttempts++;
        this.reconnect(url);
      }
    }, this.bufferStallMs());
  }

  private handleError(code?: number) {
    if (code === MediaError.MEDIA_ERR_ABORTED) return;
    if (!this.currentUrl) return;
    const gen = this.generation;
    const maxAttempts = this.everPlayed ? 6 : 2;
    if (this.reconnectAttempts >= maxAttempts) {
      if (gen !== this.generation) return;
      this.reconnecting = false;
      this.playbackActive = false;
      this.everPlayed = false;
      this.reconnectAttempts = 0;
      if (!this.failedDispatched) {
        this.failedDispatched = true;
        this.dispatchEvent(
          new CustomEvent('failed', {
            detail: {
              url: this.currentUrl,
              reason: 'audio_error',
              code,
              stationuuid: this.lastStationUuid,
            },
          })
        );
      }
      return;
    }

    this.reconnectAttempts++;
    const url = this.currentUrl;
    const timer = setTimeout(() => {
      if (gen === this.generation && url && this.currentUrl === url) {
        this.reconnect(url);
      }
    }, 450);
    this.reconnectTimers.push(timer);
  }

  private handleEnded() {
    this.playbackActive = false;
    this.setPlaybackStateNone();
    this.dispatchEvent(new CustomEvent('ended', { detail: { stationuuid: this.lastStationUuid } }));
  }

  private clearStall() {
    if (this.stallTimer) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }

  private mediaPlay() {
    if (!this.currentUrl) return;
    if (this.playbackActive) return;
    if (this.audioCtx?.state === 'suspended') void this.audioCtx.resume().catch(() => {});
    this.audio.play().catch((err) => this.handlePlayError(err));
  }

  private mediaPause() {
    this.clearStall();
    this.cancelReconnectTimers();
    this.playbackActive = false;
    this.audio.pause();
    this.setPlaybackStatePaused();
    this.dispatchEvent(new CustomEvent('paused'));
  }

  pause() {
    if (!this.currentUrl) {
      this.stop();
      return;
    }
    this.clearStall();
    this.cancelReconnectTimers();
    this.playbackActive = false;
    this.audio.pause();
    this.setPlaybackStatePaused();
    this.dispatchEvent(new CustomEvent('paused'));
  }

  async resume(): Promise<void> {
    if (!this.currentUrl) return;
    this.playbackActive = false;
    if (this.audioCtx?.state === 'suspended') {
      try { await this.audioCtx.resume(); } catch {}
    }
    try {
      await this.audio.play();
      this.playbackActive = true;
      this.dispatchEvent(
        new CustomEvent('playing', { detail: { url: this.currentUrl, stationuuid: this.lastStationUuid } })
      );
    } catch (err) {
      this.handlePlayError(err);
    }
  }

  getActiveUrl(): string | null {
    return this.currentUrl;
  }

  stop() {
    this.generation++;
    this.cancelCrossfade();
    this.cancelReconnectTimers();
    this.clearStall();
    this.playbackActive = false;
    this.reconnecting = false;
    this.currentUrl = null;
    this.lastStationUuid = null;
    this.detachWebAudio();
    this.pauseAudioOnly();
    this.setPlaybackStateNone();
    this.dispatchEvent(new CustomEvent('stopped'));
  }

  private pauseAudioOnly() {
    const el = this.audio;
    el.pause();
    el.removeAttribute('src');
    el.load();
  }

  dispose() {
    this.stop();
    this.teardownAudio(this.audio);
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch {}
      this.audioCtx = null;
    }
    if (this.nativeListener) {
      void this.nativeListener.unregister().catch(() => {});
      this.nativeListener = null;
    }
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.webAudioEnabled && this.gainNode && !this.isFadingOut) {
      try { this.gainNode.gain.value = this.volume; } catch {}
      this.audio.volume = 1;
    } else {
      const next = (el: HTMLAudioElement | null) => {
        if (el && !this.isFadingOut) el.volume = this.volume;
      };
      next(this.audio);
    }
  }

  getVolume(): number {
    return this.volume;
  }

  fadeOut(durationMs: number): Promise<void> {
    if (this.isFadingOut || !this.playbackActive) return Promise.resolve();
    // Prefer gainNode fade when Web Audio is active
    if (this.webAudioEnabled && this.gainNode && this.audioCtx) {
      const gen = this.generation;
      const gain = this.gainNode.gain;
      const start = gain.value;
      try {
        gain.cancelScheduledValues(this.audioCtx.currentTime);
        gain.setValueAtTime(start, this.audioCtx.currentTime);
        gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + durationMs / 1000);
      } catch {
        gain.value = 0;
      }
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          if (gen !== this.generation) { resolve(); return; }
          try { gain.value = 0; } catch {}
          resolve();
        }, durationMs + 30);
      });
    }
    const gen = this.generation;
    const el = this.audio;
    const start = Math.min(el.volume, this.volume || 1);
    const steps = 24;
    const intervalMs = Math.max(16, durationMs / steps);
    let step = 0;
    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (gen !== this.generation || el.__nostuGen !== this.generation) {
          clearInterval(interval);
          resolve();
          return;
        }
        step++;
        el.volume = Math.max(0, start * (1 - step / steps));
        if (step >= steps) {
          clearInterval(interval);
          el.volume = 0;
          resolve();
        }
      }, intervalMs);
    });
  }

  isPlaying(): boolean {
    return this.playbackActive && !this.audio.paused;
  }

  /**
   * Resume the AudioContext if it was suspended (e.g. after app returns from background).
   * Also re-syncs the audio element playback state if needed.
   */
  resumeAudioContext(): void {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume().catch(() => {});
    }
    // On Android, the WebView might have paused the audio element when backgrounded.
    // If we had playback active and the element is now paused, try to resume it.
    if (this.playbackActive && this.audio.paused && this.currentUrl && !this.reconnecting) {
      void this.audio.play().catch((err) => this.handlePlayError(err));
    }
  }
}

export const audioEngine = new AudioEngine();

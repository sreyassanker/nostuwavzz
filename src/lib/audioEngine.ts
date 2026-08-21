import type { Station } from '../types';
import { useStore } from '../store/store';
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
  private volume = loadSavedVolume();
  private nativeListener: Awaited<ReturnType<typeof onAction>> | null = null;

  private crossfadeMs(): number {
    const { crossfadeDuration } = useStore.getState();
    return crossfadeDuration * 1000;
  }

  private crossfadeEnabled(): boolean {
    return useStore.getState().crossfade;
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

  private createAudioElement(): HTMLAudioElement {
    const el = new Audio();
    el.preload = 'auto';

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

  private handlePlaying(el: HTMLAudioElement) {
    if (el.__nostuGen !== this.generation) return;
    this.clearStall();
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this.everPlayed = true;
    this.playbackActive = true;
    this.setPlaybackStatePlaying();
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

    if (station) {
      this.updateMediaMetadata(station);
    }

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
    el.volume = this.volume;
    try {
      void el.play().catch((err) => this.handlePlayError(err));
    } catch {
      // ignored
    }
  }

  private beginCrossfade(newUrl: string) {
    const oldAudio = this.audio;
    const gen = this.generation;
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
    el.volume = this.volume;
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
      this.dispatchEvent(
        new CustomEvent('failed', {
          detail: { url: this.currentUrl, reason: 'play_rejected', stationuuid: this.lastStationUuid },
        })
      );
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
        this.dispatchEvent(
          new CustomEvent('failed', {
            detail: {
              url: url,
              reason: 'stall_timeout',
              stationuuid: this.lastStationUuid,
            },
          })
        );
      } else {
        this.reconnectAttempts++;
        this.reconnect(url);
      }
    }, this.everPlayed ? 3000 : 4500);
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
    if (this.nativeListener) {
      void this.nativeListener.unregister().catch(() => {});
      this.nativeListener = null;
    }
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    const next = (el: HTMLAudioElement | null) => {
      if (el && !this.isFadingOut) el.volume = this.volume;
    };
    next(this.audio);
  }

  getVolume(): number {
    return this.volume;
  }

  fadeOut(durationMs: number): Promise<void> {
    if (this.isFadingOut || !this.playbackActive) return Promise.resolve();
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
}

export const audioEngine = new AudioEngine();
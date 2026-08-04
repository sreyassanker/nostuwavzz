import type { Station } from '../types';
import { useStore } from '../store/store';
import {
  updateState,
  onAction,
  clear,
  isTauriAndroid as useNativeMediaSession,
} from './mediaSession';

export type MediaActionHandler = () => void;

const CROSSFADE_STEPS = 24;

export class AudioEngine extends EventTarget {
  private audio: HTMLAudioElement;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private currentUrl: string | null = null;
  private lastStationUuid: string | null = null;
  private abortController: AbortController | null = null;
  private reconnecting = false;
  private generation = 0;
  private onNext: MediaActionHandler | null = null;
  private onPrev: MediaActionHandler | null = null;
  private isFadingOut = false;

  private crossfadeMs(): number {
    const { crossfadeDuration } = useStore.getState();
    return crossfadeDuration * 1000;
  }

  private crossfadeEnabled(): boolean {
    return useStore.getState().crossfade;
  }

  constructor() {
    super();
    this.audio = new Audio();
    this.audio.preload = 'auto';

    this.audio.addEventListener('stalled', () => this.handleStall());
    this.audio.addEventListener('waiting', () => this.handleStall());
    this.audio.addEventListener('playing', () => this.handlePlaying());
    this.audio.addEventListener('canplay', () => this.clearStall());
    this.audio.addEventListener('error', () => this.handleError(this.audio.error?.code));
    this.audio.addEventListener('ended', () => this.handleEnded());
    this.audio.addEventListener('loadstart', () => {
      this.dispatchEvent(new CustomEvent('loading'));
    });

    this.setupMediaSession();
    if (useNativeMediaSession) {
      this.setupNativeSession();
    }
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
    }).catch(() => {});
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
    if (useNativeMediaSession) {
      void updateState({
        title: station.name,
        artist: station.country || 'Radio',
        album: station.tags?.split(',')[0]?.trim() || 'Nostu Wavzz',
        artworkUrl: station.favicon || undefined,
        isPlaying: true,
        canPrev: true,
        canNext: true,
        canSeek: false,
      }).catch(() => {});
      return;
    }

    if (!('mediaSession' in navigator)) return;

    const artwork: MediaImage[] = [];
    if (station.favicon) {
      artwork.push({ src: station.favicon, sizes: '128x128', type: 'image/png' });
      artwork.push({ src: station.favicon, sizes: '256x256', type: 'image/png' });
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: station.name,
      artist: station.country || 'Radio',
      album: station.tags?.split(',')[0]?.trim() || 'Nostu Wavzz',
      artwork,
    });
  }

  private mediaPlay() {
    if (!this.currentUrl) return;
    this.audio.play().catch(() => {});
  }

  private mediaPause() {
    this.audio.pause();
    this.setPlaybackStatePaused();
    this.dispatchEvent(new CustomEvent('paused'));
  }

  private handlePlaying() {
    this.clearStall();
    this.setPlaybackStatePlaying();
    this.dispatchEvent(new CustomEvent('playing'));
  }

  async play(url: string, stationuuid?: string, station?: Station): Promise<void> {
    const wasPlaying = this.isPlaying();

    this.currentUrl = url;
    this.lastStationUuid = stationuuid || null;
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this.generation++;
    this.clearStall();
    this.abortController = new AbortController();

    if (station) {
      this.updateMediaMetadata(station);
    }

    if (wasPlaying && this.audio.src && this.crossfadeEnabled()) {
      await this.crossfadeTo(url);
    } else {
      this.stopImmediate();
      this.audio.src = url;
      this.audio.load();
      try {
        await this.audio.play();
      } catch (err) {
        this.handlePlayError(err);
      }
    }

    this.setPlaybackStatePlaying();
    this.dispatchEvent(new CustomEvent('playing', { detail: { url, stationuuid } }));
  }

  private async crossfadeTo(newUrl: string): Promise<void> {
    const oldAudio = this.audio;
    const newAudio = new Audio();
    newAudio.preload = 'auto';

    newAudio.addEventListener('stalled', () => this.handleStall());
    newAudio.addEventListener('waiting', () => this.handleStall());
    newAudio.addEventListener('playing', () => this.handlePlaying());
    newAudio.addEventListener('canplay', () => this.clearStall());
    newAudio.addEventListener('error', () => this.handleError(newAudio.error?.code));
    newAudio.addEventListener('ended', () => this.handleEnded());
    newAudio.addEventListener('loadstart', () => {
      this.dispatchEvent(new CustomEvent('loading'));
    });

    oldAudio.volume = 1;
    newAudio.volume = 0;
    newAudio.src = newUrl;
    newAudio.load();

    this.audio = newAudio;
    this.isFadingOut = true;
    let step = 0;
    const duration = this.crossfadeMs();
    const intervalMs = Math.max(16, duration / CROSSFADE_STEPS);

    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        step++;
        const progress = step / CROSSFADE_STEPS;
        const eased = 1 - Math.pow(1 - progress, 3);

        oldAudio.volume = 1 - eased;
        newAudio.volume = eased;

        if (step >= CROSSFADE_STEPS) {
          clearInterval(interval);
          this.isFadingOut = false;
          oldAudio.pause();
          oldAudio.src = '';
          newAudio.play().catch((err) => this.handlePlayError(err));
          resolve();
        } else {
          newAudio.play().catch(() => {});
        }
      }, intervalMs);
    });
  }

  private stopImmediate() {
    this.audio.pause();
    this.audio.src = '';
    this.audio.load();
    this.currentUrl = null;
  }

  private reconnect(url: string): void {
    if (this.reconnecting) return;
    this.reconnecting = true;
    this.audio.src = '';
    this.audio.load();
    this.audio.src = url;
    this.audio.load();
    this.audio.play()
      .then(() => { this.reconnecting = false; })
      .catch(() => { this.reconnecting = false; });
  }

  private handlePlayError(err: unknown) {
    const name = (err as DOMException)?.name;
    if (name === 'AbortError' || name === 'NotAllowedError') {
      this.reconnecting = false;
      return;
    }
    const gen = this.generation;
    if (this.reconnectAttempts >= 3) {
      if (gen !== this.generation) return;
      this.reconnecting = false;
      this.dispatchEvent(
        new CustomEvent('failed', {
          detail: { url: this.currentUrl, reason: 'play_rejected', stationuuid: this.lastStationUuid },
        })
      );
      return;
    }

    this.reconnectAttempts++;
    setTimeout(() => {
      if (gen === this.generation && this.currentUrl) {
        this.reconnect(this.currentUrl);
      }
    }, 350);
  }

  private handleStall() {
    this.dispatchEvent(new CustomEvent('buffering'));
    this.clearStall();

    const gen = this.generation;
    this.stallTimer = setTimeout(() => {
      if (gen !== this.generation || !this.currentUrl) return;
      if (this.reconnectAttempts < 2 && this.currentUrl) {
        this.reconnectAttempts++;
        this.reconnect(this.currentUrl);
      } else {
        this.reconnecting = false;
        this.dispatchEvent(
          new CustomEvent('failed', {
            detail: {
              url: this.currentUrl,
              reason: 'stall_timeout',
              stationuuid: this.lastStationUuid,
            },
          })
        );
      }
    }, 4500);
  }

  private handleError(code?: number) {
    if (code === MediaError.MEDIA_ERR_ABORTED) return;
    const gen = this.generation;
    if (this.reconnectAttempts < 2 && this.currentUrl) {
      this.reconnectAttempts++;
      setTimeout(() => {
        if (gen === this.generation && this.currentUrl) {
          this.reconnect(this.currentUrl);
        }
      }, 450);
    } else {
      if (gen !== this.generation) return;
      this.reconnecting = false;
      this.dispatchEvent(
        new CustomEvent('failed', {
          detail: {
            url: this.currentUrl,
            reason: 'audio_error',
            code: this.audio.error?.code,
            stationuuid: this.lastStationUuid,
          },
        })
      );
    }
  }

  private handleEnded() {
    this.setPlaybackStateNone();
    this.dispatchEvent(new CustomEvent('ended', { detail: { stationuuid: this.lastStationUuid } }));
  }

  private clearStall() {
    if (this.stallTimer) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  stop() {
    if (this.isFadingOut) {
      this.audio.pause();
    }
    this.audio.pause();
    this.clearStall();
    this.setPlaybackStateNone();
    this.currentUrl = null;
    this.reconnecting = false;
    this.dispatchEvent(new CustomEvent('stopped'));
  }

  dispose() {
    this.stop();
    this.audio.src = '';
    this.audio.load();
    this.abortController?.abort();
    this.abortController = null;
    this.currentUrl = null;
    this.reconnectAttempts = 0;
    this.reconnecting = false;
  }

  setVolume(vol: number) {
    this.audio.volume = Math.max(0, Math.min(1, vol));
  }

  fadeOut(durationMs: number): Promise<void> {
    if (!this.isPlaying() || this.isFadingOut) return Promise.resolve();
    const start = this.audio.volume;
    const steps = 24;
    const intervalMs = Math.max(16, durationMs / steps);
    let step = 0;
    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        step++;
        this.audio.volume = start * (1 - step / steps);
        if (step >= steps) {
          clearInterval(interval);
          this.audio.volume = 0;
          resolve();
        }
      }, intervalMs);
    });
  }

  getVolume(): number {
    return this.audio.volume;
  }

  isPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended;
  }
}

export const audioEngine = new AudioEngine();

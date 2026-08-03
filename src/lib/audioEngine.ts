export class AudioEngine extends EventTarget {
  private audio: HTMLAudioElement;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private currentUrl: string | null = null;
  private lastStationUuid: string | null = null;
  private abortController: AbortController | null = null;
  private reconnecting = false;

  constructor() {
    super();
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.crossOrigin = 'anonymous';

    this.audio.addEventListener('stalled', () => this.handleStall());
    this.audio.addEventListener('waiting', () => this.handleStall());
    this.audio.addEventListener('playing', () => this.clearStall());
    this.audio.addEventListener('canplay', () => this.clearStall());
    this.audio.addEventListener('error', () => this.handleError());
    this.audio.addEventListener('ended', () => this.handleEnded());
    this.audio.addEventListener('loadstart', () => {
      this.dispatchEvent(new CustomEvent('loading'));
    });
  }

  async play(url: string, stationuuid?: string): Promise<void> {
    this.dispose();

    this.currentUrl = url;
    this.lastStationUuid = stationuuid || null;
    this.reconnectAttempts = 0;
    this.reconnecting = false;
    this.abortController = new AbortController();

    this.audio.src = url;
    this.audio.load();

    try {
      await this.audio.play();
      this.dispatchEvent(new CustomEvent('playing', { detail: { url, stationuuid } }));
    } catch (err) {
      this.handlePlayError(err);
    }
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

  private handlePlayError(_err: unknown) {
    if (this.reconnectAttempts >= 3) {
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
      if (this.currentUrl) {
        this.reconnect(this.currentUrl);
      }
    }, 350);
  }

  private handleStall() {
    this.dispatchEvent(new CustomEvent('buffering'));
    this.clearStall();

    this.stallTimer = setTimeout(() => {
      if (this.reconnectAttempts < 3 && this.currentUrl) {
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
    }, 2600);
  }

  private handleError() {
    if (this.reconnectAttempts < 2 && this.currentUrl) {
      this.reconnectAttempts++;
      setTimeout(() => {
        if (this.currentUrl) {
          this.reconnect(this.currentUrl);
        }
      }, 450);
    } else {
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
    this.audio.pause();
    this.clearStall();
    this.currentUrl = null;
    this.reconnecting = false;
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

  getVolume(): number {
    return this.audio.volume;
  }

  isPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended;
  }
}

export const audioEngine = new AudioEngine();

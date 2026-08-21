import { useCallback, useRef, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Heart,
  Play,
  SkipBack,
  SkipForward,
  Square,
  Timer,
  Volume2,
  Radio,
  X,
  ChevronLeft,
  ChevronRight,
  ListMusic,
  SlidersHorizontal,
  Zap,
  Orbit,
  Moon,
  Waves,
  BarChart3,
} from 'lucide-react';
import { useStore } from '../store/store';
import { audioEngine } from '../lib/audioEngine';
import { toggleFavorite as storageToggleFavorite } from '../lib/storage';
import { useSleepTimer } from '../lib/useSleepTimer';
import StationLogo from './StationLogo';
import type { Station } from '../types';
import { useFocusTrap } from '../lib/useFocusTrap';
import AudioVisualizer from './AudioVisualizer';
import { EQ_PRESETS, PRESET_ORDER } from '../lib/eqPresets';
import { EQ_FREQUENCIES } from '../store/store';

const VOLUME_KEY = 'radio.volume';
const SLEEP_OPTIONS = [15, 30, 60, 90];
const SWIPE_THRESHOLD = 70;

interface PlayerSheetProps {
  onPrev: () => void;
  onNext: () => void;
  onPlayStation: (station: Station) => void;
}

export default function PlayerSheet({ onPrev, onNext, onPlayStation }: PlayerSheetProps) {
  const player = useStore((s) => s.player);
  const setPlayer = useStore((s) => s.setPlayer);
  const playerOpen = useStore((s) => s.playerOpen);
  const setPlayerOpen = useStore((s) => s.setPlayerOpen);
  const sleepTimerMinutes = useStore((s) => s.sleepTimerMinutes);
  const favoriteUuids = useStore((s) => s.favoriteUuids);
  const setFavoriteUuids = useStore((s) => s.setFavoriteUuids);
  const addToast = useStore((s) => s.addToast);
  const queue = useStore((s) => s.queue);
  const nowPlaying = useStore((s) => s.nowPlaying);
  const eqEnabled = useStore((s) => s.eqEnabled);
  const eqGains = useStore((s) => s.eqGains);
  const eqPreset = useStore((s) => s.eqPreset);
  const bassBoost = useStore((s) => s.bassBoost);
  const spatialEnabled = useStore((s) => s.spatialEnabled);
  const nightMode = useStore((s) => s.nightMode);
  const bufferPreset = useStore((s) => s.bufferPreset);
  const visualizerEnabled = useStore((s) => s.visualizerEnabled);
  const setEqEnabled = useStore((s) => s.setEqEnabled);
  const setEqGains = useStore((s) => s.setEqGains);
  const setEqGain = useStore((s) => s.setEqGain);
  const setEqPreset = useStore((s) => s.setEqPreset);
  const setBassBoost = useStore((s) => s.setBassBoost);
  const setSpatialEnabled = useStore((s) => s.setSpatialEnabled);
  const setNightMode = useStore((s) => s.setNightMode);
  const setBufferPreset = useStore((s) => s.setBufferPreset);
  const setVisualizerEnabled = useStore((s) => s.setVisualizerEnabled);
  const [eqOpen, setEqOpen] = useState(false);
  const removeFromQueue = useStore((s) => s.removeFromQueue);
  const clearQueue = useStore((s) => s.clearQueue);
  const { handleSleep } = useSleepTimer();

  const [sleepOpen, setSleepOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [dragDir, setDragDir] = useState<'prev' | 'next' | null>(null);
  const [dragging, setDragging] = useState(false);
  const miniRef = useRef<HTMLDivElement>(null);
  const sleepMenuRef = useRef<HTMLDivElement>(null);
  const fullSleepMenuRef = useRef<HTMLDivElement>(null);
  const queueMenuRef = useRef<HTMLDivElement>(null);
  const fullPlayerRef = useFocusTrap(playerOpen);
  const bufferingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playFromQueueRef = useRef<(uuid: string) => void>(() => {});
  const dragStart = useRef<{ x: number; y: number; target: Element | null } | null>(null);
  const dragState = useRef({ dx: 0, dir: null as 'prev' | 'next' | null, active: false });
  const sheetDragStart = useRef<{ x: number; y: number } | null>(null);
  const lastOpenRef = useRef(0);

  playFromQueueRef.current = (uuid: string) => {
    const station = useStore.getState().queue.find((s) => s.stationuuid === uuid);
    if (!station) return;
    removeFromQueue(uuid);
    onPlayStation(station);
  };

  const openPlayer = useCallback(() => {
    if (!useStore.getState().player.currentStation) return;
    lastOpenRef.current = Date.now();
    setPlayerOpen(true);
  }, [setPlayerOpen]);

  useEffect(() => {
    if (!playerOpen) {
      setSleepOpen(false);
      setQueueOpen(false);
    } else {
      // Ensure lastOpenRef is current whenever player opens,
      // even if opened via setPlayerOpen(true) from handleStationClick
      lastOpenRef.current = Date.now();
    }
  }, [playerOpen]);

  // Restore volume from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VOLUME_KEY);
      if (saved) {
        const v = parseFloat(saved);
        if (!isNaN(v) && v >= 0 && v <= 1) {
          audioEngine.setVolume(v);
          setPlayer({ volume: v });
        }
      }
    } catch {}
  }, [setPlayer]);

  useEffect(() => {
    const onBuf = () => {
      if (bufferingTimer.current) clearTimeout(bufferingTimer.current);
      setBuffering(true);
    };
    const onOk = () => {
      if (bufferingTimer.current) clearTimeout(bufferingTimer.current);
      bufferingTimer.current = setTimeout(() => setBuffering(false), 500);
    };
    audioEngine.addEventListener('buffering', onBuf);
    audioEngine.addEventListener('playing', onOk);
    audioEngine.addEventListener('failed', onOk);
    audioEngine.addEventListener('stopped', onOk);
    return () => {
      audioEngine.removeEventListener('buffering', onBuf);
      audioEngine.removeEventListener('playing', onOk);
      audioEngine.removeEventListener('failed', onOk);
      audioEngine.removeEventListener('stopped', onOk);
    };
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const insideMini = sleepMenuRef.current?.contains(e.target as Node);
      const insideFull = fullSleepMenuRef.current?.contains(e.target as Node);
      const insideQueue = queueMenuRef.current?.contains(e.target as Node);
      if (!insideMini && !insideFull) {
        setSleepOpen(false);
      }
      if (!insideQueue) {
        setQueueOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSleepOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (audioEngine.isPlaying()) {
      audioEngine.pause();
      setPlayer({ isPlaying: false });
    } else if (player.currentStation) {
      const url = player.currentStation.url_resolved || player.currentStation.url;
      if (!url) return;
      if (audioEngine.getActiveUrl()) {
        void audioEngine.resume().then(() => setPlayer({ isPlaying: true }));
      } else {
        audioEngine.play(url, player.currentStation.stationuuid, player.currentStation);
        setPlayer({ isPlaying: true });
      }
    }
  }, [player.currentStation, setPlayer]);

  const handleVolume = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value);
      audioEngine.setVolume(v);
      setPlayer({ volume: v });
      try { localStorage.setItem(VOLUME_KEY, String(v)); } catch {}
    },
    [setPlayer]
  );

  const handleFavorite = useCallback(() => {
    if (!player.currentStation) return;
    const isFav = storageToggleFavorite(player.currentStation.stationuuid);
    const newFavs = new Set(favoriteUuids);
    if (isFav) {
      newFavs.add(player.currentStation.stationuuid);
      addToast('Added to favorites');
    } else {
      newFavs.delete(player.currentStation.stationuuid);
      addToast('Removed from favorites');
    }
    setFavoriteUuids(newFavs);
  }, [player.currentStation, favoriteUuids, setFavoriteUuids, addToast]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, label')) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragStart.current = { x: e.clientX, y: e.clientY, target };
    dragState.current = { dx: 0, dir: null, active: false };
    setDragging(false);
    setDragDir(null);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (!dragState.current.active && Math.abs(dx) < 10) return;
    if (!dragState.current.active && Math.abs(dy) > Math.abs(dx)) {
      dragStart.current = null;
      return;
    }
    const clamped = Math.max(-130, Math.min(130, dx));
    dragState.current.dx = clamped;
    const dir = clamped < -8 ? 'next' : clamped > 8 ? 'prev' : null;
    dragState.current.dir = dir;
    dragState.current.active = true;
    setDragging(true);
    setDragDir(dir);
    if (miniRef.current) {
      miniRef.current.style.transform = clamped === 0 ? '' : `translateX(${clamped}px)`;
    }
  }, []);

  const endDrag = useCallback(() => {
    const pending = dragStart.current;
    const { dx, dir, active } = dragState.current;
    dragStart.current = null;
    dragState.current = { dx: 0, dir: null, active: false };
    setDragging(false);
    setDragDir(null);
    if (miniRef.current) {
      miniRef.current.style.transform = '';
    }
    if (active && Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dir === 'next') onNext();
      else if (dir === 'prev') onPrev();
    } else if (pending?.target?.closest('.player-sheet__mini-left')) {
      openPlayer();
    }
  }, [onNext, onPrev, openPlayer]);

  // Full player sheet gestures: swipe down to dismiss, swipe L/R to change station
  const onSheetPointerDown = useCallback((e: React.PointerEvent) => {
    sheetDragStart.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onSheetPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!sheetDragStart.current) return;
      const dx = e.clientX - sheetDragStart.current.x;
      const dy = e.clientY - sheetDragStart.current.y;
      sheetDragStart.current = null;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) onNext();
        else onPrev();
      } else if (dy > 90) {
        setPlayerOpen(false);
      }
    },
    [onNext, onPrev, setPlayerOpen]
  );

  const station = player.currentStation;
  const fav = station ? favoriteUuids.has(station.stationuuid) : false;

  const metaParts: string[] = [];
  if (station?.country) metaParts.push(station.country);
  if (station?.bitrate) metaParts.push(`${station.bitrate} kbps`);
  if (station?.codec && station.codec !== 'UNKNOWN') metaParts.push(station.codec);
  if (player.isPlaying && metaParts.length === 0) metaParts.push('Live');

  const stationName = station?.name || 'Select a station';
  const marquee = stationName.length > 26;
  const liveTitle =
    nowPlaying && station && nowPlaying.stationuuid === station.stationuuid
      ? nowPlaying
      : null;

  const renderQueueMenu = (withRef?: (el: HTMLDivElement | null) => void) => (
    <div ref={withRef} className="sleep-menu sleep-menu--open queue-menu" role="menu" aria-label="Up next">
      {queue.length === 0 ? (
        <div className="queue-menu__empty">Queue is empty</div>
      ) : (
        queue.map((s) => (
          <div key={s.stationuuid} className="queue-menu__row">
            <button
              type="button"
              className="queue-menu__play"
              role="menuitem"
              onClick={() => {
                setQueueOpen(false);
                playFromQueueRef.current(s.stationuuid);
              }}
              title={`Play ${s.name}`}
            >
              <span className="queue-menu__play-name">{s.name}</span>
              <span className="queue-menu__play-meta">
                {[s.country, s.bitrate ? `${s.bitrate}k` : null].filter(Boolean).join(' · ') || '\u00a0'}
              </span>
            </button>
            <button
              type="button"
              className="queue-menu__remove"
              role="menuitem"
              onClick={() => removeFromQueue(s.stationuuid)}
              aria-label={`Remove ${s.name} from queue`}
            >
              <X size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        ))
      )}
      {queue.length > 0 && (
        <button
          type="button"
          className="queue-menu__clear"
          role="menuitem"
          onClick={() => {
            setQueueOpen(false);
            clearQueue();
          }}
          style={{ color: 'var(--ink-mute)' }}
        >
          <ListMusic size={13} strokeWidth={1.8} aria-hidden="true" />
          Clear queue ({queue.length})
        </button>
      )}
    </div>
  );

  const renderSleepMenu = (withRef?: (el: HTMLDivElement | null) => void) => (
    <div ref={withRef} className="sleep-menu sleep-menu--open" id="sleep-menu">
      {SLEEP_OPTIONS.map((m) => (
        <button
          type="button"
          key={m}
          onClick={() => { setSleepOpen(false); handleSleep(m); }}
          style={{
            background: sleepTimerMinutes === m ? 'var(--bg)' : 'transparent',
            fontWeight: sleepTimerMinutes === m ? 600 : 400,
          }}
        >
          {m} min
        </button>
      ))}
      <button
        type="button"
        onClick={() => { setSleepOpen(false); handleSleep(0); }}
        style={{ color: 'var(--ink-mute)' }}
      >
        Off
      </button>
    </div>
  );

  return (
    <>
      <div
        ref={miniRef}
        className={`player-sheet__mini ${dragging ? 'is-dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className={`player-sheet__swipe player-sheet__swipe--prev ${dragDir === 'prev' ? 'is-visible' : ''}`} aria-hidden="true">
          <ChevronLeft size={22} strokeWidth={2.4} />
        </span>

        <div
          className="player-sheet__mini-left"
          role="button"
          tabIndex={0}
          onClick={openPlayer}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && station) {
              e.preventDefault();
              openPlayer();
            }
          }}
          aria-label={station ? `Open player for ${station.name}` : 'Open player'}
        >
          <div className={`player-sheet__art ${player.isPlaying ? 'is-playing' : ''}`}>
            {station ? (
              <StationLogo station={station} size={44} className="player-sheet__art-img" />
            ) : (
              <span className="player-sheet__art-img player-sheet__art-img--empty">
                <Radio size={18} strokeWidth={1.8} aria-hidden="true" />
              </span>
            )}
            <svg className="player-sheet__ring" viewBox="0 0 48 48" aria-hidden="true">
              <circle className="player-sheet__ring-track" cx="24" cy="24" r="22" />
              <circle className="player-sheet__ring-bar" cx="24" cy="24" r="22" />
            </svg>
          </div>
          <div className="player-sheet__info">
            <div className={`player-sheet__station ${marquee ? 'player-sheet__station--marquee' : ''}`}>
              <span className="player-sheet__station-inner">
                <span className="player-sheet__station-copy">{stationName}</span>
                {marquee && <span className="player-sheet__station-copy" aria-hidden="true">{stationName}</span>}
              </span>
            </div>
            <div className="player-sheet__meta">
              {liveTitle && player.isPlaying ? (
                <span className="player-sheet__live">
                  ♪ {liveTitle.artist ? `${liveTitle.artist} — ` : ''}
                  {liveTitle.title}
                </span>
              ) : player.isPlaying && buffering ? (
                <span className="player-banner">Buffering…</span>
              ) : metaParts.length > 0 ? (
                metaParts.join(' · ')
              ) : (
                '\u00a0'
              )}
            </div>
          </div>
        </div>

        <div className="player-sheet__transport">
          <button type="button" className="player-btn" onClick={onPrev} title="Previous station" aria-label="Previous station">
            <SkipBack size={17} fill="currentColor" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`player-btn player-btn--play ${player.isPlaying ? 'is-playing' : ''}`}
            onClick={handlePlayPause}
            disabled={!station}
            title={player.isPlaying ? 'Pause' : 'Play'}
            aria-label={player.isPlaying ? 'Pause station' : 'Play station'}
          >
            {player.isPlaying ? <Square size={16} fill="currentColor" aria-hidden="true" /> : <Play size={18} fill="currentColor" aria-hidden="true" />}
          </button>
          <button type="button" className="player-btn" onClick={onNext} title="Next station" aria-label="Next station">
            <SkipForward size={17} fill="currentColor" aria-hidden="true" />
          </button>
        </div>

        <div className="player-sheet__extras">
          <label className="volume-control" htmlFor="volume">
            <Volume2 size={15} strokeWidth={1.8} aria-hidden="true" />
            <input
              type="range"
              className="volume-slider"
              id="volume"
              min="0"
              max="1"
              step="0.01"
              value={player.volume}
              onChange={handleVolume}
              aria-label="Volume"
            />
          </label>
          <button
            type="button"
            className={`player-btn player-btn--icon ${fav ? 'player-btn--active' : ''}`}
            onClick={handleFavorite}
            disabled={!station}
            title={fav ? 'Remove from favorites' : 'Add to favorites'}
            aria-label={fav ? 'Remove current station from favorites' : 'Add current station to favorites'}
            aria-pressed={fav}
          >
            <Heart size={18} fill={fav ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
          <div className="sleep-dropdown" ref={sleepMenuRef}>
            <button
              type="button"
              className={`player-btn player-btn--icon ${sleepTimerMinutes > 0 ? 'player-btn--active' : ''}`}
              onClick={() => setSleepOpen(!sleepOpen)}
              title="Sleep timer"
              aria-label="Sleep timer"
              aria-expanded={sleepOpen}
            >
              <Timer size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {sleepOpen && renderSleepMenu()}
          </div>
          <div className="queue-dropdown" ref={queueMenuRef}>
            <button
              type="button"
              className={`player-btn player-btn--icon queue-btn ${queue.length > 0 ? 'player-btn--active' : ''}`}
              onClick={() => setQueueOpen(!queueOpen)}
              title="Up next"
              aria-label={`Up next, ${queue.length} in queue`}
              aria-expanded={queueOpen}
            >
              <ListMusic size={18} strokeWidth={1.8} aria-hidden="true" />
              {queue.length > 0 && <span className="queue-btn__badge">{queue.length > 99 ? '99+' : queue.length}</span>}
            </button>
            {queueOpen && renderQueueMenu()}
          </div>
        </div>

        <span className={`player-sheet__swipe player-sheet__swipe--next ${dragDir === 'next' ? 'is-visible' : ''}`} aria-hidden="true">
          <ChevronRight size={22} strokeWidth={2.4} />
        </span>
      </div>

      <AnimatePresence>
        {playerOpen && (
          <div className="full-player" role="dialog" aria-modal="true" aria-label="Now playing">
            <motion.div
              className="full-player__backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                if (Date.now() - lastOpenRef.current > 350) setPlayerOpen(false);
              }}
            />
            <motion.div
              ref={fullPlayerRef}
              className="full-player__sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onPointerDown={onSheetPointerDown}
              onPointerUp={onSheetPointerUp}
            >
              <div className="full-player__handle" />
              <div className="full-player__head">
                <span className="full-player__now">
                  {player.isPlaying ? <span className="full-player__now-live">● LIVE</span> : 'NOW PLAYING'}
                </span>
                <button
                  type="button"
                  className="full-player__close"
                  onClick={() => setPlayerOpen(false)}
                  aria-label="Close player"
                >
                  <X size={20} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>

              {station ? (
                <>
                  <div className="full-player__art">
                    <StationLogo station={station} size={128} className="full-player__art-img" deferMs={400} />
                  </div>

                  <div className="full-player__title">{station.name}</div>
                  {liveTitle && player.isPlaying ? (
                    <div className="full-player__live">
                      ♪ {liveTitle.artist ? `${liveTitle.artist} — ` : ''}
                      {liveTitle.title}
                    </div>
                  ) : null}
                  <div className="full-player__meta">
                    {player.isPlaying && buffering ? (
                      <span className="player-banner player-banner--full">Buffering…</span>
                    ) : metaParts.length > 0 ? (
                      metaParts.join(' · ')
                    ) : (
                      '\u00a0'
                    )}
                  </div>

                  {station.tags ? (
                    <div className="full-player__tags">
                      {station.tags.split(',').slice(0, 5).map((t) => t.trim()).filter(Boolean).map((t) => (
                        <span key={t} className="full-player__tag">{t}</span>
                      ))}
                    </div>
                  ) : null}

                  {/* Visualizer */}
                  <div className="fp-viz fp-viz--defer">
                    <div className="fp-viz__head">
                      <span className="fp-viz__label"><BarChart3 size={12} strokeWidth={2} aria-hidden="true" /> Visualizer</span>
                      <button
                        type="button"
                        className={`fp-viz__toggle ${visualizerEnabled ? 'is-on' : ''}`}
                        onClick={() => {
                          const next = !visualizerEnabled;
                          setVisualizerEnabled(next);
                          audioEngine.setVisualizerEnabled(next);
                        }}
                        aria-pressed={visualizerEnabled}
                        title={visualizerEnabled ? 'Hide visualizer' : 'Show visualizer'}
                      >
                        {visualizerEnabled ? 'On' : 'Off'}
                      </button>
                    </div>
                    {visualizerEnabled && (
                      <div className="fp-viz__canvas">
                        <AudioVisualizer height={52} />
                      </div>
                    )}
                  </div>

                  {/* Audio FX strip */}
                  <div className="fp-fx fp-fx--defer">
                    <button
                      type="button"
                      className={`fp-chip ${bassBoost ? 'is-active' : ''}`}
                      onClick={() => {
                        const next = !bassBoost;
                        setBassBoost(next);
                        audioEngine.setBassBoost();
                      }}
                      aria-pressed={bassBoost}
                      title="Bass boost (+10 dB low shelf)"
                    >
                      <Zap size={13} strokeWidth={2} aria-hidden="true" /> Bass
                    </button>
                    <button
                      type="button"
                      className={`fp-chip ${spatialEnabled ? 'is-active' : ''}`}
                      onClick={() => {
                        const next = !spatialEnabled;
                        setSpatialEnabled(next);
                        audioEngine.setSpatialEnabled();
                      }}
                      aria-pressed={spatialEnabled}
                      title="Spatial widening"
                    >
                      <Orbit size={13} strokeWidth={2} aria-hidden="true" /> Spatial
                    </button>
                    <button
                      type="button"
                      className={`fp-chip ${nightMode ? 'is-active' : ''}`}
                      onClick={() => {
                        const next = !nightMode;
                        setNightMode(next);
                        audioEngine.setNightMode();
                      }}
                      aria-pressed={nightMode}
                      title="Night mode — dynamic compression"
                    >
                      <Moon size={13} strokeWidth={2} aria-hidden="true" /> Night
                    </button>
                    <button
                      type="button"
                      className={`fp-chip ${eqEnabled ? 'is-active' : ''}`}
                      onClick={() => {
                        if (!eqEnabled) {
                          setEqEnabled(true);
                          audioEngine.setEqEnabled(true);
                          setEqOpen(true);
                        } else {
                          setEqOpen((v) => !v);
                        }
                      }}
                      aria-pressed={eqEnabled}
                      aria-expanded={eqOpen}
                    >
                      <SlidersHorizontal size={13} strokeWidth={2} aria-hidden="true" /> EQ
                    </button>
                    <button
                      type="button"
                      className="fp-chip is-active"
                      onClick={() => {
                        const order = ['low', 'balanced', 'high'] as const;
                        const next = order[(order.indexOf(bufferPreset) + 1) % order.length];
                        setBufferPreset(next);
                      }}
                      title="Buffer: low/balanced/high — tap to cycle"
                    >
                      <Waves size={13} strokeWidth={2} aria-hidden="true" /> {bufferPreset === 'low' ? 'Buf: Low' : bufferPreset === 'high' ? 'Buf: High' : 'Buf: Balanced'}
                    </button>
                  </div>

                  {/* Equalizer panel */}
                  {eqEnabled && eqOpen && (
                    <div className="fp-eq">
                      <div className="fp-eq__head">
                        <span className="fp-eq__title">Equalizer</span>
                        <div className="fp-eq__presets" role="group" aria-label="EQ presets">
                          {PRESET_ORDER.map((key) => (
                            <button
                              key={key}
                              type="button"
                              className={`fp-eq__preset ${eqPreset === key ? 'is-active' : ''}`}
                              onClick={() => {
                                const preset = EQ_PRESETS[key];
                                if (!preset) return;
                                setEqGains(preset.gains);
                                setEqPreset(key);
                                audioEngine.setEqGains(preset.gains);
                              }}
                            >
                              {EQ_PRESETS[key].label}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="fp-eq__off"
                          onClick={() => {
                            setEqEnabled(false);
                            audioEngine.setEqEnabled(false);
                            setEqOpen(false);
                          }}
                        >
                          Off
                        </button>
                      </div>
                      <div className="fp-eq__sliders">
                        {EQ_FREQUENCIES.map((freq, i) => (
                          <div key={freq} className="fp-eq__col">
                            <div className="fp-eq__track">
                              <input
                                type="range"
                                min={-12}
                                max={12}
                                step={1}
                                value={eqGains[i] ?? 0}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  setEqGain(i, v);
                                  audioEngine.setEqGain(i, v);
                                }}
                                aria-label={`${freq} Hz`}
                                className="fp-eq__range"
                              />
                              <span className="fp-eq__val">{eqGains[i] > 0 ? `+${eqGains[i]}` : eqGains[i]}</span>
                            </div>
                            <span className="fp-eq__freq">{freq >= 1000 ? `${freq / 1000}k` : freq}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="full-player__transport">
                    <button type="button" className="player-btn" onClick={onPrev} aria-label="Previous station" title="Previous station">
                      <SkipBack size={22} fill="currentColor" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`player-btn player-btn--play full-player__play ${player.isPlaying ? 'is-playing' : ''}`}
                      onClick={handlePlayPause}
                      aria-label={player.isPlaying ? 'Pause station' : 'Play station'}
                    >
                      {player.isPlaying ? (
                        <Square size={20} fill="currentColor" aria-hidden="true" />
                      ) : (
                        <Play size={24} fill="currentColor" aria-hidden="true" />
                      )}
                    </button>
                    <button type="button" className="player-btn" onClick={onNext} aria-label="Next station" title="Next station">
                      <SkipForward size={22} fill="currentColor" aria-hidden="true" />
                    </button>
                  </div>

                  {queue.length > 0 && (
                    <div className="full-player__upnext">
                      <div className="full-player__upnext-head">
                        <span className="full-player__upnext-title">UP NEXT</span>
                        <span className="full-player__upnext-count">{queue.length}</span>
                        <button
                          type="button"
                          className="full-player__upnext-clear"
                          onClick={() => {
                            clearQueue();
                            addToast('Queue cleared');
                          }}
                        >
                          Clear
                        </button>
                      </div>
                      <div className="full-player__upnext-list">
                        {queue.map((s) => (
                          <div key={s.stationuuid} className="full-player__upnext-item">
                            <button
                              type="button"
                              className="full-player__upnext-play"
                              onClick={() => playFromQueueRef.current(s.stationuuid)}
                              title={`Play ${s.name}`}
                            >
                              <Play size={12} fill="currentColor" aria-hidden="true" />
                              <span className="full-player__upnext-name">{s.name}</span>
                              <span className="full-player__upnext-meta">
                                {[s.country, s.bitrate ? `${s.bitrate}k` : null].filter(Boolean).join(' · ') || '\u00a0'}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="full-player__upnext-remove"
                              onClick={() => removeFromQueue(s.stationuuid)}
                              aria-label={`Remove ${s.name} from queue`}
                              title="Remove from queue"
                            >
                              <X size={14} strokeWidth={2} aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="full-player__row">
                    <label className="volume-control" htmlFor="fp-volume">
                      <Volume2 size={16} strokeWidth={1.8} aria-hidden="true" />
                      <input
                        type="range"
                        className="volume-slider"
                        id="fp-volume"
                        min="0"
                        max="1"
                        step="0.01"
                        value={player.volume}
                        onChange={handleVolume}
                        aria-label="Volume"
                      />
                    </label>
                    <button
                      type="button"
                      className={`player-btn player-btn--icon ${fav ? 'player-btn--active' : ''}`}
                      onClick={handleFavorite}
                      aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
                      aria-pressed={fav}
                    >
                      <Heart size={22} fill={fav ? 'currentColor' : 'none'} aria-hidden="true" />
                    </button>
                    <div className="sleep-dropdown" ref={fullSleepMenuRef}>
                      <button
                        type="button"
                        className={`player-btn player-btn--icon ${sleepTimerMinutes > 0 ? 'player-btn--active' : ''}`}
                        onClick={() => setSleepOpen(!sleepOpen)}
                        aria-label="Sleep timer"
                        aria-expanded={sleepOpen}
                      >
                        <Timer size={22} strokeWidth={1.8} aria-hidden="true" />
                      </button>
                      {sleepOpen && renderSleepMenu()}
                    </div>
                  </div>
                </>
              ) : (
                <div className="full-player__empty">
                  <Radio size={32} strokeWidth={1.6} aria-hidden="true" />
                  <p>No station selected.</p>
                  <button type="button" className="btn-clear" onClick={() => setPlayerOpen(false)}>
                    Browse stations
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
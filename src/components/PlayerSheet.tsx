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
} from 'lucide-react';
import { useStore } from '../store/store';
import { audioEngine } from '../lib/audioEngine';
import { toggleFavorite as storageToggleFavorite } from '../lib/storage';
import { useSleepTimer } from '../lib/useSleepTimer';
import StationLogo from './StationLogo';

const VOLUME_KEY = 'radio.volume';
const SLEEP_OPTIONS = [15, 30, 60, 90];
const SWIPE_THRESHOLD = 70;

interface PlayerSheetProps {
  onPrev: () => void;
  onNext: () => void;
}

export default function PlayerSheet({ onPrev, onNext }: PlayerSheetProps) {
  const player = useStore((s) => s.player);
  const setPlayer = useStore((s) => s.setPlayer);
  const playerOpen = useStore((s) => s.playerOpen);
  const setPlayerOpen = useStore((s) => s.setPlayerOpen);
  const sleepTimerMinutes = useStore((s) => s.sleepTimerMinutes);
  const favoriteUuids = useStore((s) => s.favoriteUuids);
  const setFavoriteUuids = useStore((s) => s.setFavoriteUuids);
  const addToast = useStore((s) => s.addToast);
  const { handleSleep } = useSleepTimer();

  const [sleepOpen, setSleepOpen] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const sleepMenuRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragState = useRef({ dx: 0, dir: null as 'prev' | 'next' | null, active: false });
  const [, forceRender] = useState(0);

  const setDrag = useCallback(
    (patch: Partial<{ dx: number; dir: 'prev' | 'next' | null; active: boolean }>) => {
      dragState.current = { ...dragState.current, ...patch };
      forceRender((n) => n + 1);
    },
    []
  );

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
    const onBuf = () => setBuffering(true);
    const onOk = () => setBuffering(false);
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
      if (sleepMenuRef.current && !sleepMenuRef.current.contains(e.target as Node)) {
        setSleepOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (audioEngine.isPlaying()) {
      audioEngine.stop();
      setPlayer({ isPlaying: false });
    } else if (player.currentStation) {
      const url = player.currentStation.url_resolved || player.currentStation.url;
      if (url) {
        audioEngine.play(url, player.currentStation.stationuuid, player.currentStation).catch(() => {
          setPlayer({ isPlaying: false });
          addToast('Failed to play station', 'error');
        });
        setPlayer({ isPlaying: true });
      }
    }
  }, [player.currentStation, setPlayer, addToast]);

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

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button, input, label')) return;
      dragStart.current = { x: e.clientX, y: e.clientY };
      setDrag({ dx: 0, dir: null, active: false });
    },
    [setDrag]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStart.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (!dragState.current.active && Math.abs(dx) < 10) return;
      if (!dragState.current.active && Math.abs(dy) > Math.abs(dx)) {
        dragStart.current = null;
        return;
      }
      const clamped = Math.max(-130, Math.min(130, dx));
      setDrag({
        dx: clamped,
        dir: clamped < -8 ? 'next' : clamped > 8 ? 'prev' : null,
        active: true,
      });
    },
    [setDrag]
  );

  const endDrag = useCallback(() => {
    dragStart.current = null;
    const { dx, dir, active } = dragState.current;
    if (active && Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dir === 'next') onNext();
      else if (dir === 'prev') onPrev();
    }
    setDrag({ dx: 0, dir: null, active: false });
  }, [onNext, onPrev, setDrag]);

  const station = player.currentStation;
  const fav = station ? favoriteUuids.has(station.stationuuid) : false;
  const drag = dragState.current;

  const metaParts: string[] = [];
  if (station?.country) metaParts.push(station.country);
  if (station?.bitrate) metaParts.push(`${station.bitrate} kbps`);
  if (station?.codec && station.codec !== 'UNKNOWN') metaParts.push(station.codec);
  if (player.isPlaying && metaParts.length === 0) metaParts.push('Live');

  const stationName = station?.name || 'Select a station';
  const marquee = stationName.length > 26;

  return (
    <>
      <div
        className={`player-sheet__mini ${drag.active ? 'is-dragging' : ''}`}
        style={{ transform: drag.active ? `translateX(${drag.dx}px)` : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
      >
        <span className={`player-sheet__swipe player-sheet__swipe--prev ${drag.dir === 'prev' ? 'is-visible' : ''}`} aria-hidden="true">
          <ChevronLeft size={22} strokeWidth={2.4} />
        </span>

        <div
          className="player-sheet__mini-left"
          role="button"
          tabIndex={0}
          onClick={() => station && setPlayerOpen(true)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && station) {
              e.preventDefault();
              setPlayerOpen(true);
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
              {player.isPlaying && buffering ? (
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
            <div className={`sleep-menu ${sleepOpen ? 'sleep-menu--open' : ''}`} id="sleep-menu">
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
          </div>
        </div>

        <span className={`player-sheet__swipe player-sheet__swipe--next ${drag.dir === 'next' ? 'is-visible' : ''}`} aria-hidden="true">
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
              onClick={() => setPlayerOpen(false)}
            />
            <motion.div
              className="full-player__sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
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
                    <StationLogo station={station} size={128} className="full-player__art-img" />
                  </div>

                  <div className="full-player__title">{station.name}</div>
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
                    <div className="sleep-dropdown">
                      <button
                        type="button"
                        className={`player-btn player-btn--icon ${sleepTimerMinutes > 0 ? 'player-btn--active' : ''}`}
                        onClick={() => setSleepOpen(!sleepOpen)}
                        aria-label="Sleep timer"
                        aria-expanded={sleepOpen}
                      >
                        <Timer size={22} strokeWidth={1.8} aria-hidden="true" />
                      </button>
                      <div className={`sleep-menu ${sleepOpen ? 'sleep-menu--open' : ''}`}>
                        {SLEEP_OPTIONS.map((m) => (
                          <button
                            type="button"
                            key={m}
                            onClick={() => { setSleepOpen(false); handleSleep(m); }}
                            style={{ fontWeight: sleepTimerMinutes === m ? 600 : 400 }}
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

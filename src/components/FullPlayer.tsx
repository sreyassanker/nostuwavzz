import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, Play, SkipBack, SkipForward, Square, Timer, Volume2, X, Radio } from 'lucide-react';
import { useStore } from '../store/store';
import { audioEngine } from '../lib/audioEngine';
import { useSleepTimer } from '../lib/useSleepTimer';
import { toggleFavorite as storageToggleFavorite } from '../lib/storage';
import StationLogo from './StationLogo';

const VOLUME_KEY = 'radio.volume';
const SLEEP_OPTIONS = [15, 30, 60, 90];

interface FullPlayerProps {
  onPrev: () => void;
  onNext: () => void;
}

export default function FullPlayer({ onPrev, onNext }: FullPlayerProps) {
  const playerOpen = useStore((s) => s.playerOpen);
  const setPlayerOpen = useStore((s) => s.setPlayerOpen);
  const player = useStore((s) => s.player);
  const setPlayer = useStore((s) => s.setPlayer);
  const sleepTimerMinutes = useStore((s) => s.sleepTimerMinutes);
  const favoriteUuids = useStore((s) => s.favoriteUuids);
  const setFavoriteUuids = useStore((s) => s.setFavoriteUuids);
  const addToast = useStore((s) => s.addToast);
  const [sleepOpen, setSleepOpen] = useState(false);
  const { handleSleep } = useSleepTimer();

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

  const station = player.currentStation;
  const fav = station ? favoriteUuids.has(station.stationuuid) : false;

  const metaParts: string[] = [];
  if (station?.country) metaParts.push(station.country);
  if (station?.bitrate) metaParts.push(`${station.bitrate} kbps`);
  if (station?.codec && station.codec !== 'UNKNOWN') metaParts.push(station.codec);

  return (
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
              <span className="full-player__now">NOW PLAYING</span>
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
                  {metaParts.length > 0 ? metaParts.join(' · ') : '\u00a0'}
                </div>

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
  );
}

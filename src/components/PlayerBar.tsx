import { useCallback, useRef, useEffect, useState } from 'react';
import { Heart, Play, SkipBack, SkipForward, Square, Timer, Volume2, Radio } from 'lucide-react';
import { useStore } from '../store/store';
import { audioEngine } from '../lib/audioEngine';
import { toggleFavorite as storageToggleFavorite } from '../lib/storage';
import { countryCodeToFlag } from '../lib/utils';

const VOLUME_KEY = 'radio.volume';

interface PlayerBarProps {
  onPrev: () => void;
  onNext: () => void;
}

const SLEEP_OPTIONS = [15, 30, 60, 90];

export default function PlayerBar({ onPrev, onNext }: PlayerBarProps) {
  const player = useStore((s) => s.player);
  const setPlayer = useStore((s) => s.setPlayer);
  const sleepTimerMinutes = useStore((s) => s.sleepTimerMinutes);
  const setSleepTimer = useStore((s) => s.setSleepTimer);
  const addToast = useStore((s) => s.addToast);
  const favoriteUuids = useStore((s) => s.favoriteUuids);
  const setFavoriteUuids = useStore((s) => s.setFavoriteUuids);

  const sleepRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sleepOpen, setSleepOpen] = useState(false);
  const sleepMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sleepMenuRef.current && !sleepMenuRef.current.contains(e.target as Node)) {
        setSleepOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
  }, []);

  const handlePlayPause = useCallback(() => {
    if (audioEngine.isPlaying()) {
      audioEngine.stop();
      setPlayer({ isPlaying: false });
    } else if (player.currentStation) {
      const url = player.currentStation.url_resolved || player.currentStation.url;
      if (url) {
        audioEngine.play(url, player.currentStation.stationuuid).catch(() => {
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

  const handleSleep = useCallback(
    (mins: number) => {
      if (sleepRef.current) clearTimeout(sleepRef.current);
      if (mins > 0) {
        sleepRef.current = setTimeout(() => {
          audioEngine.stop();
          setPlayer({ isPlaying: false });
          addToast('Sleep timer ended');
        }, mins * 60000);
        addToast(`Sleep timer: ${mins} min`);
      } else {
        addToast('Sleep timer off');
      }
      setSleepTimer(mins);
      setSleepOpen(false);
    },
    [setPlayer, setSleepTimer, addToast]
  );

  const station = player.currentStation;
  const fav = station ? favoriteUuids.has(station.stationuuid) : false;
  const flag = station ? countryCodeToFlag(station.countrycode || '') : '';

  const metaParts: string[] = [];
  if (station?.country) metaParts.push(station.country);
  if (station?.bitrate) metaParts.push(`${station.bitrate} kbps`);
  if (station?.codec && station.codec !== 'UNKNOWN') metaParts.push(station.codec);

  return (
    <footer className="player-bar" id="player-bar">
      <div className="player-left">
        <div className={`player-flag ${!station ? 'player-flag--empty' : ''}`} id="player-flag">
          {station ? flag || '📻' : <Radio size={18} strokeWidth={1.8} aria-hidden="true" />}
        </div>
        <div className="player-info">
          <div className="player-station" id="player-station">
            {station?.name || 'Select a station'}
          </div>
          {metaParts.length > 0 && (
            <div className="player-meta" id="player-meta">
              {metaParts.join(' · ')}
            </div>
          )}
        </div>
      </div>
      <div className="player-center">
        <button type="button" className="player-btn" onClick={onPrev} title="Previous station" aria-label="Previous station">
          <SkipBack size={16} fill="currentColor" aria-hidden="true" />
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
          <SkipForward size={16} fill="currentColor" aria-hidden="true" />
        </button>
      </div>
      <div className="player-right">
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
                onClick={() => handleSleep(m)}
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
              onClick={() => handleSleep(0)}
              style={{
                background: sleepTimerMinutes === 0 ? 'var(--bg)' : 'transparent',
                color: 'var(--ink-mute)',
              }}
            >
              Off
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}

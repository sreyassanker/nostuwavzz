import type { Station } from '../types';
import { countryCodeToFlag } from '../lib/utils';
import { useStore } from '../store/store';
import { Play, Square } from 'lucide-react';

interface StationCardProps {
  station: Station;
  onSelect: (station: Station) => void;
}

export default function StationCard({ station, onSelect }: StationCardProps) {
  const activeStationUuid = useStore((s) => s.activeStationUuid);
  const isPlaying = useStore((s) => s.player.isPlaying);
  const isActive = station.stationuuid === activeStationUuid;

  const tags = station.tags
    ? station.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3)
    : [];

  return (
    <article
      className={`station-card ${isActive ? 'station-card--active' : ''}`}
      onClick={() => onSelect(station)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(station);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${isActive && isPlaying ? 'Pause' : 'Play'} ${station.name}`}
      aria-pressed={isActive}
    >
      <span className="station-card__flag">
        {countryCodeToFlag(station.countrycode || '') || '📻'}
      </span>

      <div className="station-card__name">{station.name}</div>

      {tags.length > 0 && (
        <div className="station-card__tags">
          {tags.map((t) => (
            <span key={t} className="tag-pill">
              {t.toUpperCase()}
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        className="station-card__play"
        onClick={(e) => { e.stopPropagation(); onSelect(station); }}
        aria-label={`${isActive && isPlaying ? 'Pause' : 'Play'} ${station.name}`}
      >
        {isActive && isPlaying ? <Square size={11} fill="currentColor" aria-hidden="true" /> : <Play size={13} fill="currentColor" aria-hidden="true" />}
      </button>
    </article>
  );
}

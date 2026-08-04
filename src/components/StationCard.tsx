import { useState } from 'react';
import type { Station } from '../types';
import { useStore } from '../store/store';
import { toggleFavorite as storageToggleFavorite } from '../lib/storage';
import { Play, Square, MoreHorizontal, Info, Heart, Share2 } from 'lucide-react';
import StationLogo from './StationLogo';
import StationInfoModal from './StationInfoModal';

interface StationCardProps {
  station: Station;
  onSelect: (station: Station) => void;
}

export default function StationCard({ station, onSelect }: StationCardProps) {
  const activeStationUuid = useStore((s) => s.activeStationUuid);
  const isPlaying = useStore((s) => s.player.isPlaying);
  const favoriteUuids = useStore((s) => s.favoriteUuids);
  const setFavoriteUuids = useStore((s) => s.setFavoriteUuids);
  const addToast = useStore((s) => s.addToast);
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const isActive = station.stationuuid === activeStationUuid;
  const isFav = favoriteUuids.has(station.stationuuid);

  const tags = station.tags
    ? station.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3)
    : [];

  const toggleFav = () => {
    const added = storageToggleFavorite(station.stationuuid);
    const next = new Set(favoriteUuids);
    if (added) next.add(station.stationuuid);
    else next.delete(station.stationuuid);
    setFavoriteUuids(next);
    addToast(added ? 'Added to favorites' : 'Removed from favorites');
    setMenuOpen(false);
  };

  const handleShare = async () => {
    setMenuOpen(false);
    const url = station.url_resolved || station.url;
    const shareData = {
      title: station.name,
      text: `Listen to ${station.name}${station.country ? ` (${station.country})` : ''}`,
      url: url || undefined,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (url) {
        await navigator.clipboard.writeText(url);
        addToast('Stream URL copied to clipboard');
      }
    } catch {
      // user cancelled share
    }
  };

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
      <div className="station-card__top">
        <StationLogo station={station} size={26} className="station-card__logo" />
        <button
          type="button"
          className="station-card__menu"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          aria-label={`More options for ${station.name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <MoreHorizontal size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {menuOpen && (
        <div className="station-menu" role="menu" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setInfoOpen(true);
            }}
          >
            <Info size={14} strokeWidth={1.8} aria-hidden="true" />
            Info
          </button>
          <button type="button" role="menuitem" onClick={toggleFav}>
            <Heart size={14} strokeWidth={1.8} fill={isFav ? 'currentColor' : 'none'} aria-hidden="true" />
            {isFav ? 'Remove favorite' : 'Favorite'}
          </button>
          <button type="button" role="menuitem" onClick={handleShare}>
            <Share2 size={14} strokeWidth={1.8} aria-hidden="true" />
            Share
          </button>
        </div>
      )}

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
        onClick={(e) => {
          e.stopPropagation();
          onSelect(station);
        }}
        aria-label={`${isActive && isPlaying ? 'Pause' : 'Play'} ${station.name}`}
      >
        {isActive && isPlaying ? (
          <Square data-square size={11} fill="currentColor" aria-hidden="true" />
        ) : (
          <Play size={13} fill="currentColor" aria-hidden="true" />
        )}
      </button>

      <StationInfoModal station={infoOpen ? station : null} onClose={() => setInfoOpen(false)} onPlay={onSelect} />
    </article>
  );
}

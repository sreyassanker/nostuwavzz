import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Station } from '../types';
import { useStore } from '../store/store';
import { toggleFavorite as storageToggleFavorite } from '../lib/storage';
import { Play, Square, MoreHorizontal, Info, Heart, Share2, ListMusic, Sparkles } from 'lucide-react';
import StationLogo from './StationLogo';
import StationInfoModal from './StationInfoModal';

interface StationCardProps {
  station: Station;
  onSelect: (station: Station) => void;
}

interface MenuPosition {
  top: number;
  left: number;
  openUp: boolean;
}

const MENU_WIDTH = 150;
const MENU_HEIGHT = 180;

export default function StationCard({ station, onSelect }: StationCardProps) {
  const activeStationUuid = useStore((s) => s.activeStationUuid);
  const isPlaying = useStore((s) => s.player.isPlaying);
  const favoriteUuids = useStore((s) => s.favoriteUuids);
  const setFavoriteUuids = useStore((s) => s.setFavoriteUuids);
  const addToast = useStore((s) => s.addToast);
  const queue = useStore((s) => s.queue);
  const addToQueue = useStore((s) => s.addToQueue);
  const setSelectedTag = useStore((s) => s.setSelectedTag);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const isActive = station.stationuuid === activeStationUuid;
  const isFav = favoriteUuids.has(station.stationuuid);
  const inQueue = queue.some((s) => s.stationuuid === station.stationuuid);

  const tags = station.tags
    ? station.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3)
    : [];

  useEffect(() => {
    if (!menuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuBtnRef.current?.contains(t)) return;
      if (t instanceof Element && t.closest('.station-menu')) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [menuOpen]);

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.right - MENU_WIDTH;
    left = Math.max(8, Math.min(vw - MENU_WIDTH - 8, left));
    const fitsBelow = rect.bottom + MENU_HEIGHT + 8 <= vh;
    const openUp = !fitsBelow && rect.top - MENU_HEIGHT - 8 >= 8;
    const top = openUp ? rect.top - MENU_HEIGHT - 8 : rect.bottom + 4;
    setMenuPos({ top, left, openUp });
    setMenuOpen((v) => !v);
  };

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

  const handleAddToQueue = () => {
    setMenuOpen(false);
    if (inQueue) {
      addToast('Already in queue');
      return;
    }
    addToQueue(station);
    addToast('Added to queue');
  };

  const handleSimilar = () => {
    setMenuOpen(false);
    const primaryTag = station.tags?.split(',')[0]?.trim();
    if (!primaryTag) {
      addToast('No tags to match');
      return;
    }
    setSelectedTag(primaryTag);
    setActiveTab('discover');
    addToast(`Showing ${primaryTag} stations`);
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
          ref={menuBtnRef}
          type="button"
          className="station-card__menu"
          onClick={openMenu}
          aria-label={`More options for ${station.name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <MoreHorizontal size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

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

      {menuOpen &&
        menuPos &&
        createPortal(
          <div
            className="station-menu station-menu--portal"
            style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 130 }}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
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
            <button
              type="button"
              role="menuitem"
              onClick={handleAddToQueue}
              disabled={inQueue}
              className={inQueue ? 'is-disabled' : ''}
            >
              <ListMusic size={14} strokeWidth={1.8} aria-hidden="true" />
              {inQueue ? 'In queue' : 'Add to queue'}
            </button>
            <button type="button" role="menuitem" onClick={handleSimilar}>
              <Sparkles size={14} strokeWidth={1.8} aria-hidden="true" />
              Similar stations
            </button>
          </div>,
          document.body
        )}

      <StationInfoModal station={infoOpen ? station : null} onClose={() => setInfoOpen(false)} onPlay={onSelect} />
    </article>
  );
}
import { useStore } from '../store/store';
import { Heart, RefreshCw } from 'lucide-react';

interface HeaderProps {
  onSync: () => void;
}

export default function Header({ onSync }: HeaderProps) {
  const favorites = useStore((s) => s.favoriteUuids);
  const favoritesOnly = useStore((s) => s.favoritesOnly);
  const setFavoritesOnly = useStore((s) => s.setFavoritesOnly);
  const currentStation = useStore((s) => s.player.currentStation);
  const isPlaying = useStore((s) => s.player.isPlaying);
  const syncState = useStore((s) => s.sync);
  const totalCount = useStore((s) => s.totalStationCount);

  return (
    <header className="header">
      <div className="header-left">
        <a href="/" className="logo">
          Nostu Wavzz
        </a>
        <span className="header-count">{totalCount.toLocaleString()} stations</span>
      </div>
      <div className="header-right">
        {syncState.inProgress && (
          <span className="sync-badge">
            {syncState.phase === 'fetching'
              ? `Syncing ${syncState.progress}...`
              : syncState.phase === 'writing'
                ? 'Writing...'
                : 'Starting...'}
          </span>
        )}
        {!syncState.inProgress && (
          <button
            type="button"
            className="header-sync-btn"
            onClick={onSync}
            title="Sync stations"
            aria-label="Sync stations"
          >
            <RefreshCw size={15} strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className={`header-fav-btn ${favoritesOnly ? 'is-active' : ''}`}
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          title="Show favorites"
          aria-label={`Show favorites, ${favorites.size} saved`}
          aria-pressed={favoritesOnly}
        >
          <Heart className="header-fav-icon" size={14} fill={favoritesOnly ? 'currentColor' : 'none'} aria-hidden="true" />
          <span className="header-fav-count">{favorites.size}</span>
        </button>
        <span className="on-air-badge" hidden={!isPlaying || !currentStation}>
          <span className="on-air-dot" />
          <span className="on-air-name">{currentStation?.name}</span>
        </span>
      </div>
    </header>
  );
}

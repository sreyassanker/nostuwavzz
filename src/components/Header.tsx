import { useMemo } from 'react';
import { useStore } from '../store/store';
import { Heart, RefreshCw, Radio, PictureInPicture2, Play, Clock, BarChart3 } from 'lucide-react';

interface HeaderProps {
  onSync: () => void;
  isMobile: boolean;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h${rem}m` : `${h}h`;
}

export default function Header({ onSync, isMobile }: HeaderProps) {
  const favorites = useStore((s) => s.favoriteUuids);
  const favoritesOnly = useStore((s) => s.favoritesOnly);
  const setFavoritesOnly = useStore((s) => s.setFavoritesOnly);
  const myStationsOnly = useStore((s) => s.myStationsOnly);
  const setMyStationsOnly = useStore((s) => s.setMyStationsOnly);
  const currentStation = useStore((s) => s.player.currentStation);
  const isPlaying = useStore((s) => s.player.isPlaying);
  const syncState = useStore((s) => s.sync);
  const totalCount = useStore((s) => s.totalStationCount);
  const miniOpen = useStore((s) => s.miniOverlayOpen);
  const setMiniOverlayOpen = useStore((s) => s.setMiniOverlayOpen);
  const playStats = useStore((s) => s.playStats);

  const lastSyncAgo = timeAgo(syncState.lastSync);

  // Compact stats for mobile header bar
  const mobileStats = useMemo(() => {
    const entries = Object.values(playStats);
    if (entries.length === 0) return null;
    const totalPlays = entries.reduce((a, v) => a + v.plays, 0);
    const totalSecs = entries.reduce((a, v) => a + v.seconds, 0);
    const uniqueStations = entries.length;
    return { totalPlays, totalSecs, uniqueStations };
  }, [playStats]);

  return (
    <header className="header">
      <div className="header-left">
        <a href="/" className="logo">
          Nostu Wavzz
        </a>
        <span className="header-count">{totalCount.toLocaleString()} stations</span>
        {lastSyncAgo && !syncState.inProgress && (
          <span className="header-sync-label">synced {lastSyncAgo}</span>
        )}
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
        {isMobile && mobileStats && (
          <div className="header-mobile-stats">
            <span className="header-mobile-stat">
              <Play size={10} fill="currentColor" aria-hidden="true" />
              <span className="header-mobile-stat__val">{mobileStats.totalPlays}</span>
            </span>
            <span className="header-mobile-stat">
              <Clock size={10} aria-hidden="true" />
              <span className="header-mobile-stat__val">{formatSeconds(mobileStats.totalSecs)}</span>
            </span>
            <span className="header-mobile-stat">
              <BarChart3 size={10} aria-hidden="true" />
              <span className="header-mobile-stat__val">{mobileStats.uniqueStations}</span>
            </span>
          </div>
        )}
        {!isMobile && (
          <>
            <button
              type="button"
              className={`header-fav-btn ${myStationsOnly ? 'is-active' : ''}`}
              onClick={() => setMyStationsOnly(!myStationsOnly)}
              title="Show my stations"
              aria-label="Show my stations"
              aria-pressed={myStationsOnly}
            >
              <Radio className="header-fav-icon" size={14} fill={myStationsOnly ? 'currentColor' : 'none'} aria-hidden="true" />
              <span className="header-fav-count">My</span>
            </button>
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
          </>
        )}
        {!isMobile && (
          <button
            type="button"
            className={`header-fav-btn ${miniOpen ? 'is-active' : ''}`}
            onClick={() => setMiniOverlayOpen(!miniOpen)}
            title={miniOpen ? 'Hide mini player' : 'Pop out mini player'}
            aria-label="Toggle mini player"
            aria-pressed={miniOpen}
          >
            <PictureInPicture2 size={14} strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}
        <span className="on-air-badge" hidden={!isPlaying || !currentStation}>
          <span className="on-air-dot" />
          <span className="on-air-name">{currentStation?.name}</span>
        </span>
      </div>
    </header>
  );
}

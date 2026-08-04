import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Station } from '../types';
import StationCard from './StationCard';
import FilterBar from './FilterBar';
import { useStore } from '../store/store';
import { Loader2, Radio, SlidersHorizontal, Heart } from 'lucide-react';

interface StationGridProps {
  stations: Station[];
  onStationClick: (station: Station) => void;
  onClearFilters: () => void;
  onSync: () => void;
  titleOverride?: string;
  hideFilters?: boolean;
}

export default function StationGrid({ stations, onStationClick, onClearFilters, onSync, titleOverride, hideFilters }: StationGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const totalStationCount = useStore((s) => s.totalStationCount);
  const favoritesOnly = useStore((s) => s.favoritesOnly);
  const syncState = useStore((s) => s.sync);
  const filterQuery = useStore((s) => s.filterQuery);
  const selectedContinent = useStore((s) => s.selectedContinent);
  const selectedTag = useStore((s) => s.selectedTag);
  const selectedCountry = useStore((s) => s.selectedCountry);

  const hasFilters = Boolean(
    filterQuery.trim() ||
      selectedContinent !== 'All' ||
      selectedTag !== 'All' ||
      selectedCountry !== 'All'
  );
  const title = titleOverride ?? (favoritesOnly ? 'Favorites' : hasFilters ? 'Filtered Stations' : 'All Stations');
  const isFavoritesView = titleOverride === 'Favorites' || favoritesOnly;
  const initialSync = syncState.inProgress && totalStationCount === 0 && stations.length === 0;
  const COLUMNS = 3;
  const ROW_HEIGHT = 116;
  const rowCount = Math.ceil(stations.length / COLUMNS);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => index,
    overscan: 5,
  });

  useEffect(() => {
    rowVirtualizer.scrollToOffset(0);
  }, [filterQuery, selectedContinent, selectedTag, selectedCountry, favoritesOnly, rowVirtualizer]);

  return (
    <>
      <div className="grid-header">
        <div className="grid-title-row">
          <h2 className="grid-title">{title}</h2>
          <span className="grid-count">
            {stations.length} station{stations.length !== 1 ? 's' : ''}
          </span>
        </div>
        {!hideFilters && <FilterBar />}
      </div>
      {syncState.inProgress && syncState.phase === 'fetching' && (
        <div className="sync-progress-bar">
          <div
            className="sync-progress-fill"
            style={{
              width: syncState.total
                ? `${(syncState.progress / syncState.total) * 100}%`
                : '50%',
            }}
          />
        </div>
      )}
      {initialSync ? (
        <div className="empty-state loading-state">
          <Loader2 className="empty-icon is-spinning" size={28} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <p className="empty-title">Syncing station directory</p>
            <p className="empty-copy">
              {syncState.progress > 0
                ? `${syncState.progress.toLocaleString()} stations found so far`
                : 'Finding playable stations...'}
            </p>
          </div>
        </div>
      ) : totalStationCount === 0 && !syncState.inProgress ? (
        <div className="empty-state">
          <Radio className="empty-icon" size={28} strokeWidth={1.8} aria-hidden="true" />
          <p className="empty-title">No stations in database.</p>
          <button type="button" className="btn-clear" onClick={onSync}>
            Sync stations
          </button>
        </div>
      ) : stations.length === 0 ? (
        isFavoritesView ? (
          <div className="empty-state">
            <Heart className="empty-icon" size={28} strokeWidth={1.8} aria-hidden="true" />
            <p className="empty-title">No favorites yet.</p>
            <p className="empty-copy">Tap the heart on any station to save it here.</p>
          </div>
        ) : (
          <div className="empty-state">
            <SlidersHorizontal className="empty-icon" size={28} strokeWidth={1.8} aria-hidden="true" />
            <p className="empty-title">No stations match your filters.</p>
            <button type="button" className="btn-clear" onClick={onClearFilters}>
              Clear filters
            </button>
          </div>
        )
      ) : (
        <div className="station-grid station-grid--virtual" ref={scrollRef}>
          <div
            className="station-grid__virtual-spacer"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const rowIndex = virtualRow.index;
              const rowStations: Station[] = [];
              for (let c = 0; c < COLUMNS; c++) {
                const idx = rowIndex * COLUMNS + c;
                if (idx < stations.length) rowStations.push(stations[idx]);
              }
              if (rowStations.length === 0) return null;
              return (
                <div
                  key={virtualRow.key}
                  className="station-grid__virtual-row"
                  data-index={rowIndex}
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {rowStations.map((s) => (
                    <StationCard key={s.stationuuid} station={s} onSelect={onStationClick} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

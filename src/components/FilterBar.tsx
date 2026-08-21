import { useMemo, useRef } from 'react';
import { Search } from 'lucide-react';
import { useStore } from '../store/store';
import { getTopCountries, getTopTags } from '../lib/api';
import type { Station } from '../types';

const CONTINENTS = [
  { label: 'All', key: 'All', color: null },
  { label: 'N. America', key: 'N. America', color: '#EDA100' },
  { label: 'S. America', key: 'S. America', color: '#E0683C' },
  { label: 'Europe', key: 'Europe', color: '#6396D6' },
  { label: 'Africa', key: 'Africa', color: '#6EA100' },
  { label: 'Asia', key: 'Asia', color: '#C8553D' },
  { label: 'Oceania', key: 'Oceania', color: '#8E7CC3' },
];

function useStableStations(stations: Station[]): Station[] {
  const ref = useRef<Station[]>(stations);
  if (
    stations.length !== ref.current.length ||
    stations.length > 0 && stations[stations.length - 1]?.stationuuid !== ref.current[ref.current.length - 1]?.stationuuid
  ) {
    ref.current = stations;
  }
  return ref.current;
}

export default function FilterBar() {
  const allStations = useStore((s) => s.allStations);
  const stableStations = useStableStations(allStations);
  const filterQuery = useStore((s) => s.filterQuery);
  const setFilterQuery = useStore((s) => s.setFilterQuery);
  const selectedContinent = useStore((s) => s.selectedContinent);
  const setSelectedContinent = useStore((s) => s.setSelectedContinent);
  const selectedTag = useStore((s) => s.selectedTag);
  const setSelectedTag = useStore((s) => s.setSelectedTag);
  const setSelectedCountry = useStore((s) => s.setSelectedCountry);
  const selectedCountryCode = useStore((s) => s.selectedCountryCode);
  const setSelectedCountryCode = useStore((s) => s.setSelectedCountryCode);

  const countries = useMemo(() => getTopCountries(stableStations, 60), [stableStations]);

  const tagList = useMemo(() => getTopTags(stableStations, 20), [stableStations]);

  const isLoading = allStations.length === 0;

  const handleCountryChange = (code: string) => {
    setSelectedCountryCode(code);
    if (code === 'All') {
      setSelectedCountry('All');
    } else {
      const match = countries.find((c) => c.code === code);
      setSelectedCountry(match?.country ?? code);
    }
  };

  return (
    <div className="filter-bar">
      <div className="search-row">
        <Search className="search-icon" size={15} strokeWidth={1.8} aria-hidden="true" />
        <input
          type="text"
          className="search-input-inline"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="Search stations, countries, tags…"
          aria-label="Search stations, countries, and tags"
        />
        <select
          className="country-select"
          value={selectedCountryCode}
          onChange={(e) => handleCountryChange(e.target.value)}
          aria-label="Filter by country"
        >
          <option value="All">All countries</option>
          {countries.map(({ country, code, count }) => (
            <option key={code} value={code}>
              {country} ({count})
            </option>
          ))}
        </select>
      </div>
      <div className="chip-row-wrap">
        <div className="chip-row chip-row--continents" aria-label="Filter by continent">
          {CONTINENTS.map(({ label, key, color }) => {
            const isActive = selectedContinent === key;
            return (
              <button
                type="button"
                key={key}
                className={`chip chip--continent ${isActive ? 'is-active' : ''}`}
                onClick={() => setSelectedContinent(key)}
                aria-pressed={isActive}
              >
                {color && <span className="chip-dot" style={{ background: color }} />}
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="chip-row-wrap">
        <div className="chip-row chip-row--tags" aria-label="Filter by tag">
          {isLoading ? (
            <span className="chip-loading">Loading tags...</span>
          ) : (
            <>
              <button
                type="button"
                className={`chip ${selectedTag === 'All' ? 'is-active' : ''}`}
                onClick={() => setSelectedTag('All')}
                aria-pressed={selectedTag === 'All'}
              >
                All
              </button>
              {tagList.map(({ tag, count }) => {
                const isActive = selectedTag === tag;
                return (
                  <button
                    type="button"
                    key={tag}
                    className={`chip ${isActive ? 'is-active' : ''}`}
                    onClick={() => setSelectedTag(tag)}
                    aria-pressed={isActive}
                  >
                    {tag}
                    <span className="chip__count">{count}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

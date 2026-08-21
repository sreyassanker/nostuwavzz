import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../store/store';
import type { Station } from '../types';
import { countryCodeToFlag, escapeHtml } from '../lib/utils';
import { useFocusTrap } from '../lib/useFocusTrap';

interface SearchModalProps {
  onSelect: (station: Station) => void;
}

export default function SearchModal({ onSelect }: SearchModalProps) {
  const searchOpen = useStore((s) => s.searchOpen);
  const setSearchOpen = useStore((s) => s.setSearchOpen);
  const allStations = useStore((s) => s.allStations);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Station[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trapRef = useFocusTrap(searchOpen);

  useEffect(() => {
    if (searchOpen) {
      setQuery('');
      setResults([]);
      setSelectedIdx(-1);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  const doSearch = useCallback(
    (q: string) => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      const ql = q.toLowerCase().trim();
      const filtered = allStations
        .filter(
          (s) =>
            s.name?.toLowerCase().includes(ql) ||
            s.country?.toLowerCase().includes(ql) ||
            s.tags?.toLowerCase().includes(ql)
        )
        .slice(0, 50);
      setResults(filtered);
    },
    [allStations]
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setQuery(q);
      setSelectedIdx(-1);

      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(() => doSearch(q), 200);
    },
    [doSearch]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (results.length === 0) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIdx((prev) => (prev >= results.length - 1 ? 0 : prev + 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIdx((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIdx >= 0 && selectedIdx < results.length) {
            onSelect(results[selectedIdx]);
            setSearchOpen(false);
          } else if (results.length > 0) {
            onSelect(results[0]);
            setSearchOpen(false);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setSearchOpen(false);
          break;
      }
    },
    [results, selectedIdx, onSelect, setSearchOpen]
  );

  useEffect(() => {
    if (selectedIdx >= 0 && resultsRef.current) {
      const items = resultsRef.current.querySelectorAll<HTMLDivElement>('[data-index]');
      items[selectedIdx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIdx]);

  return (
    <div className={`search-modal ${searchOpen ? 'search-modal--open' : ''}`} id="search-modal">
      <div className="search-backdrop" onClick={() => setSearchOpen(false)} />
      <div ref={trapRef} className="search-container">
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          id="search-input"
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Search stations, countries, tags..."
        />
        <div className="search-results" id="search-results" ref={resultsRef}>
          {results.map((station, i) => {
            const nameHtml = query.trim()
              ? highlightText(station.name || '', query.trim())
              : escapeHtml(station.name || '');

            return (
              <div
                key={station.stationuuid}
                className={`search-result-item ${selectedIdx === i ? 'is-selected' : ''}`}
                data-index={i}
                onClick={() => {
                  onSelect(station);
                  setSearchOpen(false);
                }}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <span className="search-result-flag">
                  {countryCodeToFlag(station.countrycode || '') || '📻'}
                </span>
                <div className="search-result-info">
                  <div
                    className="search-result-name"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(nameHtml) }}
                  />
                  <div className="search-result-meta">
                    {[station.country, station.tags?.split(',')[0], station.codec]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <span className="search-result-votes">{station.clickcount || 0}</span>
              </div>
            );
          })}
          {query.trim() && results.length === 0 && (
            <div className="search-empty">No results</div>
          )}
          {!query.trim() && (
            <div className="search-empty search-empty--hint">
              Type to search stations, countries, tags…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function sanitizeHtml(html: string): string {
  return html.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c
  );
}

function highlightText(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const lower = escaped.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return escaped;
  const before = escaped.slice(0, idx);
  const match = escaped.slice(idx, idx + query.length);
  const after = escaped.slice(idx + query.length);
  return `${before}<mark style="background:rgba(255,77,109,0.3);color:var(--accent);border-radius:4px;padding:0 2px">${match}</mark>${highlightText(after, query)}`;
}

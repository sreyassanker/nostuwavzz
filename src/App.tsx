import { useEffect, useCallback, useRef } from 'react';
import { useStore } from './store/store';
import { audioEngine } from './lib/audioEngine';
import { fetchAllStations, TARGET_STATIONS, type FetchProgressCallback } from './lib/fetchStations';
import { loadAllStations, saveStationsBatch, setLastSyncTime, getLastSyncTime } from './lib/stationCache';
import { isInContinent as isInContinentShared } from './lib/api';
import type { Station } from './types';
import Header from './components/Header';
import GlobeView from './components/GlobeView';
import StationGrid from './components/StationGrid';
import PlayerBar from './components/PlayerBar';
import SearchModal from './components/SearchModal';
import ToastContainer from './components/Toast';

let worker: Worker | null = null;
let filterId = 0;
let workerFailed = false;

function getWorker(): Worker | null {
  if (worker) return worker;
  if (workerFailed) return null;
  try {
    worker = new Worker(new URL('./workers/filter.worker.ts', import.meta.url), { type: 'module' });
    worker.onerror = (e) => {
      console.error('Worker runtime error:', e);
      workerFailed = true;
      worker?.terminate();
      worker = null;
    };
  } catch (e) {
    console.error('Failed to create filter worker, falling back to main thread:', e);
    workerFailed = true;
    return null;
  }
  return worker;
}

export default function App() {
  const allStations = useStore((s) => s.allStations);
  const currentStations = useStore((s) => s.currentStations);
  const filterQuery = useStore((s) => s.filterQuery);
  const selectedCountryCode = useStore((s) => s.selectedCountryCode);
  const selectedTag = useStore((s) => s.selectedTag);
  const selectedContinent = useStore((s) => s.selectedContinent);
  const favoritesOnly = useStore((s) => s.favoritesOnly);
  const showUnverified = useStore((s) => s.showUnverified);
  const favoriteUuids = useStore((s) => s.favoriteUuids);
  const totalStationCount = useStore((s) => s.totalStationCount);
  const currentStation = useStore((s) => s.player.currentStation);
  const syncInProgress = useStore((s) => s.sync.inProgress);
  const setAllStations = useStore((s) => s.setAllStations);
  const setCurrentStations = useStore((s) => s.setCurrentStations);
  const setTotalStationCount = useStore((s) => s.setTotalStationCount);
  const addToast = useStore((s) => s.addToast);
  const setSyncState = useStore((s) => s.setSyncState);
  const setPlayer = useStore((s) => s.setPlayer);
  const setActiveStationUuid = useStore((s) => s.setActiveStationUuid);
  const setFavoritesOnly = useStore((s) => s.setFavoritesOnly);
  const setFilterQuery = useStore((s) => s.setFilterQuery);
  const setSelectedCountryCode = useStore((s) => s.setSelectedCountryCode);
  const setSelectedCountry = useStore((s) => s.setSelectedCountry);
  const setSelectedContinent = useStore((s) => s.setSelectedContinent);
  const setSelectedTag = useStore((s) => s.setSelectedTag);
  const setSearchOpen = useStore((s) => s.setSearchOpen);

  const workerRef = useRef<Worker | null>(null);
  const pendingFilterRef = useRef<number>(0);
  const workerStationsRef = useRef<Station[] | null>(null);

  // Boot: load from IndexedDB, then background fetch
  useEffect(() => {
    (async () => {
      try {
        const cached = await loadAllStations();
        if (cached.length > 0) {
          setAllStations(cached);
          setTotalStationCount(cached.length);
          setCurrentStations(cached);
          addToast(`${cached.length} stations loaded from cache`);
        }

        const lastSync = await getLastSyncTime();
        const cacheBelowTarget = cached.length < TARGET_STATIONS * 0.9;
        const needsRefresh = !lastSync || cacheBelowTarget || (Date.now() - new Date(lastSync).getTime()) > 3600000;

        if (needsRefresh) {
          setSyncState({ inProgress: true, phase: 'fetching' });

          let lastUiUpdate = 0;
          const onProgress: FetchProgressCallback = (fetched, total, stations) => {
            setSyncState({ inProgress: true, progress: fetched, total, phase: 'fetching' });
            if (!stations?.length || Date.now() - lastUiUpdate < 250) return;
            lastUiUpdate = Date.now();
            const state = useStore.getState();
            if (state.allStations.length > stations.length) return;
            state.setAllStations(stations);
            state.setTotalStationCount(stations.length);
            if (
              !state.filterQuery.trim() &&
              state.selectedContinent === 'All' &&
              state.selectedTag === 'All' &&
              state.selectedCountryCode === 'All' &&
              !state.favoritesOnly
            ) {
              state.setCurrentStations(stations);
            }
          };

          try {
            const stations = await fetchAllStations(onProgress);

            if (stations.length > 0) {
              await saveStationsBatch(stations);
              setAllStations(stations);
              setTotalStationCount(stations.length);
              setCurrentStations(stations);
              setSyncState({ inProgress: false, phase: 'done' });
              await setLastSyncTime();
              addToast(`${stations.length} stations synced`);
            }
          } catch (e) {
            setSyncState({ inProgress: false, phase: 'error' });
            if (cached.length === 0) {
              addToast(`Failed to fetch stations: ${e}`, 'error');
            }
          }
        } else if (cached.length > 0) {
          setSyncState({ inProgress: false, phase: 'done' });
        }

        if (cached.length === 0 && totalStationCount === 0) {
          setSyncState({ inProgress: false, phase: 'idle' });
        }
      } catch (e) {
        addToast(`Init error: ${e}`, 'error');
      }
    })();
  }, []);

  // Init Web Worker
  useEffect(() => {
    workerRef.current = getWorker();
    workerStationsRef.current = null;
    return () => {
      workerRef.current?.terminate();
      worker = null;
      workerStationsRef.current = null;
    };
  }, []);

  // Filter results using Web Worker (with main-thread fallback)
  const runFilter = useCallback(
    (query: string, countryCode: string, tag: string, continent: string) => {
      const stations = allStations;
      if (stations.length === 0) return;

      const id = ++filterId;
      pendingFilterRef.current = id;

      const doMainThreadFallback = () => {
        const filtered = filterOnMainThread(stations, query, countryCode, tag, continent, showUnverified, favoritesOnly, favoriteUuids);
        if (pendingFilterRef.current === id) {
          setCurrentStations(filtered);
        }
      };

      const w = workerRef.current;
      if (!w) {
        doMainThreadFallback();
        return;
      }

      const timeout = setTimeout(() => {
        if (pendingFilterRef.current === id) {
          console.warn('Worker timeout, falling back to main thread');
          doMainThreadFallback();
        }
      }, 4000);

      w.onmessage = (e: MessageEvent) => {
        if (e.data.id !== pendingFilterRef.current) return;
        clearTimeout(timeout);
        const filtered: Station[] = e.data.filtered;
        setCurrentStations(filtered);
      };

      w.onerror = () => {
        clearTimeout(timeout);
        doMainThreadFallback();
      };

      const shouldSendStations = workerStationsRef.current !== stations;
      if (shouldSendStations) {
        workerStationsRef.current = stations;
      }

      w.postMessage({
        id,
        type: 'filter',
        stations: shouldSendStations ? stations : undefined,
        query,
        country: countryCode !== 'All' ? countryCode : undefined,
        tags: tag !== 'All' ? tag : undefined,
        continent: continent !== 'All' ? continent : undefined,
        favoritesOnly: favoritesOnly,
        favoriteUuids: Array.from(favoriteUuids),
        showUnverified: showUnverified,
      });
    },
    [allStations, favoritesOnly, favoriteUuids, showUnverified, setCurrentStations]
  );

  // Debounced filter trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      runFilter(
        filterQuery,
        selectedCountryCode,
        selectedTag,
        selectedContinent
      );
    }, 150);
    return () => clearTimeout(timer);
  }, [
    filterQuery,
    selectedCountryCode,
    selectedTag,
    selectedContinent,
    favoritesOnly,
    showUnverified,
    runFilter,
  ]);

  // Re-sync when coming back online
  useEffect(() => {
    const onOnline = () => {
      getLastSyncTime().then((lastSync) => {
        const state = useStore.getState();
        const needsRefresh =
          !lastSync ||
          state.allStations.length < TARGET_STATIONS * 0.9 ||
          (Date.now() - new Date(lastSync).getTime()) > 3600000;
        if (needsRefresh && state.allStations.length > 0 && !syncInProgress) {
          state.addToast('Network restored, refreshing stations...', 'info');
        }
      });
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [syncInProgress]);

  // Audio event listeners
  useEffect(() => {
    const onFailed = (_e: Event) => {
      setPlayer({ isPlaying: false });
      addToast('Station unavailable', 'error');
    };
    const onPlaying = () => setPlayer({ isPlaying: true });
    const onEnded = () => setPlayer({ isPlaying: false });

    audioEngine.addEventListener('failed', onFailed);
    audioEngine.addEventListener('playing', onPlaying);
    audioEngine.addEventListener('ended', onEnded);

    return () => {
      audioEngine.removeEventListener('failed', onFailed);
      audioEngine.removeEventListener('playing', onPlaying);
      audioEngine.removeEventListener('ended', onEnded);
    };
  }, []);

  // Play station
  const handleStationClick = useCallback(
    async (station: Station) => {
      const url = station.url_resolved || station.url;
      if (!url) return;

      if (currentStation?.stationuuid === station.stationuuid) {
        if (audioEngine.isPlaying()) {
          audioEngine.stop();
          setPlayer({ isPlaying: false });
        } else {
          try {
            await audioEngine.play(url, station.stationuuid);
            setPlayer({ isPlaying: true });
          } catch {
            setPlayer({ isPlaying: false });
            addToast('Failed to play', 'error');
          }
        }
        return;
      }

      setActiveStationUuid(station.stationuuid);
      setPlayer({ currentStation: station, isPlaying: true });

      try {
        await audioEngine.play(url, station.stationuuid);
      } catch {
        setPlayer({ isPlaying: false });
        addToast('Failed to play station', 'error');
      }
    },
    [currentStation]
  );

  const handlePrev = useCallback(() => {
    const stations = currentStations;
    const current = currentStation;
    if (!stations.length) return;
    if (!current) { handleStationClick(stations[0]); return; }
    const idx = stations.findIndex((s) => s.stationuuid === current.stationuuid);
    const prev = idx >= 0 ? (idx - 1 + stations.length) % stations.length : 0;
    handleStationClick(stations[prev]);
  }, [currentStations, currentStation]);

  const handleNext = useCallback(() => {
    const stations = currentStations;
    const current = currentStation;
    if (!stations.length) return;
    if (!current) { handleStationClick(stations[0]); return; }
    const idx = stations.findIndex((s) => s.stationuuid === current.stationuuid);
    const next = idx >= 0 ? (idx + 1) % stations.length : 0;
    handleStationClick(stations[next]);
  }, [currentStations, currentStation]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFavoritesOnly(false);
    setFilterQuery('');
    setSelectedContinent('All');
    setSelectedTag('All');
    setSelectedCountry('All');
    setSelectedCountryCode('All');
  }, []);

  const handleSync = useCallback(async () => {
    setSyncState({ inProgress: true, phase: 'fetching' });
    addToast('Starting station sync...', 'info');
    try {
      let lastUiUpdate = 0;
      const stations = await fetchAllStations((fetched, total, partialStations) => {
        setSyncState({ inProgress: true, progress: fetched, total, phase: 'fetching' });
        if (!partialStations?.length || Date.now() - lastUiUpdate < 250) return;
        lastUiUpdate = Date.now();
        const state = useStore.getState();
        if (state.allStations.length > partialStations.length) return;
        state.setAllStations(partialStations);
        state.setTotalStationCount(partialStations.length);
        if (
          !state.filterQuery.trim() &&
          state.selectedContinent === 'All' &&
          state.selectedTag === 'All' &&
          state.selectedCountryCode === 'All' &&
          !state.favoritesOnly
        ) {
          state.setCurrentStations(partialStations);
        }
      });
      if (stations.length > 0) {
        await saveStationsBatch(stations);
        setAllStations(stations);
        setTotalStationCount(stations.length);
        setCurrentStations(stations);
        setSyncState({ inProgress: false, phase: 'done' });
        await setLastSyncTime();
        addToast(`${stations.length} stations synced`);
      }
    } catch (e) {
      setSyncState({ inProgress: false, phase: 'error' });
      addToast(`Sync failed: ${e}`, 'error');
    }
  }, []);

  return (
    <div className="app-shell">
      <Header onSync={handleSync} />
      <main className="main">
        <section className="panel panel--grid" id="grid-panel">
          <StationGrid
            stations={currentStations}
            onStationClick={handleStationClick}
            onClearFilters={handleClearFilters}
            onSync={handleSync}
          />
        </section>
        <section className="panel panel--map" id="map-panel">
          <GlobeView stations={currentStations.length > 0 ? currentStations : []} />
        </section>
      </main>
      <PlayerBar onPrev={handlePrev} onNext={handleNext} />
      <SearchModal onSelect={handleStationClick} />
      <ToastContainer />
    </div>
  );
}

function filterOnMainThread(
  stations: Station[],
  query: string,
  countryCode: string,
  tag: string,
  continent: string,
  showUnverified?: boolean,
  favoritesOnly?: boolean,
  favoriteUuids?: Set<string>
): Station[] {
  let filtered = stations;

  if (!showUnverified) {
    filtered = filtered.filter((s) => s.validated !== false);
  }

  if (favoritesOnly) {
    const favs = favoriteUuids || new Set<string>();
    filtered = filtered.filter((s) => favs.has(s.stationuuid));
  }

  const q = query.toLowerCase().trim();

  if (countryCode && countryCode !== 'All') {
    filtered = filtered.filter((s) => s.countrycode === countryCode);
  }
  if (tag && tag !== 'All') {
    const tl = tag.toLowerCase().trim();
    filtered = filtered.filter((s) => {
      if (!s.tags) return false;
      const stationTags = s.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
      return stationTags.some((t) => t.includes(tl));
    });
  }
  if (continent && continent !== 'All') {
    filtered = filtered.filter((s) => isInContinentShared(s.geo_lat, s.geo_long, continent));
  }
  if (q) {
    filtered = filtered.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.country?.toLowerCase().includes(q) ||
        s.tags?.toLowerCase().includes(q)
    );
  }
  return filtered;
}

import { useEffect, useCallback, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from './store/store';
import { audioEngine } from './lib/audioEngine';
import { fetchAllStations, TARGET_STATIONS, type FetchProgressCallback } from './lib/fetchStations';
import { loadAllStations, saveStationsBatch, setLastSyncTime, getLastSyncTime } from './lib/stationCache';
import { filterStations } from './lib/filter';
import { getFaviconWithCache } from './lib/imageCache';
import { extractDominantColor } from './lib/colorExtract';
import { useMediaQuery } from './lib/useMediaQuery';
import { useTheme } from './lib/useTheme';
import type { Station } from './types';
import Header from './components/Header';
import StationGrid from './components/StationGrid';
import PlayerSheet from './components/PlayerSheet';
import SearchModal from './components/SearchModal';
import ToastContainer from './components/Toast';
import MobileTabBar from './components/MobileTabBar';
import SettingsView from './components/SettingsView';


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
  const activeTab = useStore((s) => s.activeTab);
  const setPlayerOpen = useStore((s) => s.setPlayerOpen);
  const dynamicAccent = useStore((s) => s.dynamicAccent);
  const setAccentColor = useStore((s) => s.setAccentColor);
  const addRecentStation = useStore((s) => s.addRecentStation);
  const incrementPlay = useStore((s) => s.incrementPlay);
  const addPlayTime = useStore((s) => s.addPlayTime);
  const myStations = useStore((s) => s.myStations);
  const myStationsOnly = useStore((s) => s.myStationsOnly);

  useTheme();
  const isMobile = useMediaQuery('(max-width: 760px)');

  const workerRef = useRef<Worker | null>(null);
  const pendingFilterRef = useRef<number>(0);
  const workerStationsRef = useRef<Station[] | null>(null);

  const favoriteStations = useMemo(
    () => allStations.filter((s) => favoriteUuids.has(s.stationuuid)),
    [allStations, favoriteUuids]
  );

  const bootedRef = useRef(false);
  const syncInProgressRef = useRef(syncInProgress);
  useEffect(() => {
    syncInProgressRef.current = syncInProgress;
  }, [syncInProgress]);

  const pushStations = useCallback((stations: Station[]) => {
    const state = useStore.getState();
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
  }, []);

  // Boot: load from IndexedDB, then background fetch
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
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
        const needsRefresh = !lastSync || cacheBelowTarget || (Date.now() - new Date(lastSync).getTime()) > 86400000;

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
              pushStations(stations);
              setSyncState({ inProgress: false, phase: 'done', lastSync: new Date().toISOString() });
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
          setSyncState({ inProgress: false, phase: 'done', lastSync: lastSync || null });
        }

        if (cached.length === 0 && useStore.getState().totalStationCount === 0) {
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
        const filtered = filterStations(stations, {
          query,
          countryCode,
          tag,
          continent,
          showUnverified,
          favoritesOnly,
          favoriteUuids,
        });
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
        countryCode: countryCode !== 'All' ? countryCode : undefined,
        tag: tag !== 'All' ? tag : undefined,
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
          (Date.now() - new Date(lastSync).getTime()) > 86400000;
        if (needsRefresh && state.allStations.length > 0 && !syncInProgressRef.current) {
          state.addToast('Network restored, refreshing stations...', 'info');
        }
      });
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  // Theme the app accent from the currently playing station's artwork
  useEffect(() => {
    const station = useStore.getState().player.currentStation;
    if (!dynamicAccent || !station?.favicon) return;
    let cancelled = false;
    getFaviconWithCache(station.favicon)
      .then((src) => (src && !cancelled ? extractDominantColor(src) : null))
      .then((color) => {
        if (!cancelled && color) setAccentColor(color);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentStation?.stationuuid, dynamicAccent, setAccentColor]);

  // Play station
  const handleStationClick = useCallback(
    (station: Station) => {
      const url = station.url_resolved || station.url;
      if (!url) return;

      if (currentStation?.stationuuid === station.stationuuid) {
        if (audioEngine.isPlaying()) {
          audioEngine.pause();
          setPlayer({ isPlaying: false });
        } else if (audioEngine.getActiveUrl()) {
          void audioEngine.resume().then(() => setPlayer({ isPlaying: true }));
        } else {
          setActiveStationUuid(station.stationuuid);
          setPlayer({ currentStation: station, isPlaying: true });
          if (isMobile) setPlayerOpen(true);
          void audioEngine.play(url, station.stationuuid, station);
        }
        return;
      }

      setActiveStationUuid(station.stationuuid);
      setPlayer({ currentStation: station, isPlaying: true });
      if (isMobile) setPlayerOpen(true);

      void audioEngine.play(url, station.stationuuid, station);
    },
    [currentStation, isMobile, setActiveStationUuid, setPlayer, setPlayerOpen]
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

  // Media session next/prev callbacks (via refs to avoid stale closures)
  const handlePrevRef = useRef(handlePrev);
  const handleNextRef = useRef(handleNext);
  handlePrevRef.current = handlePrev;
  handleNextRef.current = handleNext;

  useEffect(() => {
    audioEngine.setCallbacks(
      () => handleNextRef.current(),
      () => handlePrevRef.current()
    );
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        useStore.getState().setPlayerOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setSearchOpen]);

  const advanceQueue = useCallback(() => {
    const state = useStore.getState();
    const next = state.playNextFromQueue();
    if (next) {
      state.addToast(`Auto-advancing to ${next.name}`);
      handleStationClick(next);
      return true;
    }
    return false;
  }, [handleStationClick]);

  // Audio event listeners
  useEffect(() => {
    const onFailed = (_e: Event) => {
      if (advanceQueue()) return;
      setPlayer({ isPlaying: false });
      addToast('Station unavailable', 'error');
    };
    const onPlaying = (e: Event) => {
      setPlayer({ isPlaying: true });
      const uuid = (e as CustomEvent).detail?.stationuuid;
      if (!uuid) return;
      const recent =
        useStore.getState().allStations.find((s) => s.stationuuid === uuid) ??
        useStore.getState().player.currentStation;
      if (recent) {
        addRecentStation(recent);
        incrementPlay(recent);
      }
    };
    const onPaused = () => setPlayer({ isPlaying: false });
    const onStopped = () => setPlayer({ isPlaying: false });
    const onEnded = () => {
      if (advanceQueue()) return;
      setPlayer({ isPlaying: false });
    };

    audioEngine.addEventListener('failed', onFailed);
    audioEngine.addEventListener('playing', onPlaying);
    audioEngine.addEventListener('paused', onPaused);
    audioEngine.addEventListener('stopped', onStopped);
    audioEngine.addEventListener('ended', onEnded);

    return () => {
      audioEngine.removeEventListener('failed', onFailed);
      audioEngine.removeEventListener('playing', onPlaying);
      audioEngine.removeEventListener('paused', onPaused);
      audioEngine.removeEventListener('stopped', onStopped);
      audioEngine.removeEventListener('ended', onEnded);
    };
  }, [addRecentStation, addToast, setPlayer, advanceQueue, incrementPlay]);

  // Play-time ticker (every 30s while playing)
  useEffect(() => {
    const timer = setInterval(() => {
      if (!audioEngine.isPlaying()) return;
      const state = useStore.getState();
      const cur = state.player.currentStation;
      if (!cur) return;
      addPlayTime(cur.stationuuid, 30);
    }, 30000);
    return () => clearInterval(timer);
  }, [addPlayTime]);

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
        pushStations(stations);
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
      <Header onSync={handleSync} isMobile={isMobile} />
      {isMobile ? (
        <>
          <main className="main main--mobile">
            <AnimatePresence mode="wait">
              {activeTab === 'discover' && (
                <motion.section
                  key="tab-discover"
                  className="panel panel--grid"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.18 }}
                >
                  <StationGrid
                    stations={currentStations}
                    onStationClick={handleStationClick}
                    onClearFilters={handleClearFilters}
                    onSync={handleSync}
                  />
                </motion.section>
              )}

              {activeTab === 'favorites' && (
                <motion.section
                  key="tab-favorites"
                  className="panel panel--grid"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.18 }}
                >
                  <StationGrid
                    stations={favoriteStations}
                    onStationClick={handleStationClick}
                    onClearFilters={handleClearFilters}
                    onSync={handleSync}
                    titleOverride="Favorites"
                    hideFilters
                  />
                </motion.section>
              )}
              {activeTab === 'mine' && (
                <motion.section
                  key="tab-mine"
                  className="panel panel--grid"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.18 }}
                >
                  <StationGrid
                    stations={myStations}
                    onStationClick={handleStationClick}
                    onClearFilters={handleClearFilters}
                    onSync={handleSync}
                    titleOverride="My Stations"
                    hideFilters
                  />
                </motion.section>
              )}
              {activeTab === 'settings' && (
                <motion.section
                  key="tab-settings"
                  className="panel panel--grid panel--settings"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.18 }}
                >
                  <SettingsView />
                </motion.section>
              )}
            </AnimatePresence>
          </main>
          <MobileTabBar />
        </>
      ) : (
        <main className="main">
          <section className="panel panel--grid" id="grid-panel">
            <StationGrid
              stations={myStationsOnly ? myStations : currentStations}
              onStationClick={handleStationClick}
              onClearFilters={handleClearFilters}
              onSync={handleSync}
              titleOverride={myStationsOnly ? 'My Stations' : undefined}
              hideFilters={myStationsOnly}
            />
          </section>

        </main>
      )}
      <PlayerSheet onPrev={handlePrev} onNext={handleNext} onPlayStation={handleStationClick} />
      <SearchModal onSelect={handleStationClick} />
      <ToastContainer />
    </div>
  );
}



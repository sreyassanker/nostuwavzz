import { create } from 'zustand';
import type { Station } from '../types';

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'error';
}

interface PlayerState {
  currentStation: Station | null;
  isPlaying: boolean;
  volume: number;
}

interface SyncState {
  inProgress: boolean;
  progress: number;
  total: number | null;
  phase: string;
  lastSync: string | null;
}

export type ActiveTab = 'discover' | 'globe' | 'favorites' | 'settings';
export type ThemeMode = 'light' | 'dark' | 'system';

interface AppState {
  allStations: Station[];
  currentStations: Station[];
  totalStationCount: number;
  favoriteUuids: Set<string>;
  favoritesOnly: boolean;
  activeStationUuid: string | null;
  sleepTimerMinutes: number;
  sleepTimerTarget: number | null;
  toasts: Toast[];
  player: PlayerState;
  searchOpen: boolean;
  sync: SyncState;

  filterQuery: string;
  selectedContinent: string;
  selectedTag: string;
  selectedCountry: string;
  selectedCountryCode: string;
  showUnverified: boolean;

  activeTab: ActiveTab;
  theme: ThemeMode;
  playerOpen: boolean;
  dataSaver: boolean;

  setAllStations: (stations: Station[]) => void;
  setCurrentStations: (stations: Station[]) => void;
  setTotalStationCount: (count: number) => void;
  setFavoriteUuids: (uuids: Set<string>) => void;
  setFavoritesOnly: (v: boolean) => void;
  setActiveStationUuid: (uuid: string | null) => void;
  setSleepTimer: (mins: number) => void;
  addToast: (message: string, type?: 'info' | 'error') => void;
  removeToast: (id: string) => void;
  setPlayer: (p: Partial<PlayerState>) => void;
  setSearchOpen: (v: boolean) => void;
  setFilterQuery: (q: string) => void;
  setSelectedContinent: (c: string) => void;
  setSelectedTag: (t: string) => void;
  setSelectedCountry: (c: string) => void;
  setSelectedCountryCode: (c: string) => void;
  setShowUnverified: (v: boolean) => void;
  setSyncState: (s: Partial<SyncState>) => void;
  setActiveTab: (t: ActiveTab) => void;
  setTheme: (t: ThemeMode) => void;
  setPlayerOpen: (v: boolean) => void;
  setDataSaver: (v: boolean) => void;
}

let toastCounter = 0;

function loadTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem('radio.theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {}
  return 'system';
}

function loadDataSaver(): boolean {
  try {
    return localStorage.getItem('radio.dataSaver') === '1';
  } catch {}
  return false;
}

function loadSleepTimer(): number {
  try {
    const saved = localStorage.getItem('radio.sleepTimer');
    if (saved) {
      const v = parseInt(saved, 10);
      return isNaN(v) ? 0 : v;
    }
  } catch {}
  return 0;
}

function loadSleepTimerTarget(): number | null {
  try {
    const saved = localStorage.getItem('radio.sleepTimerTarget');
    if (saved) {
      const v = parseInt(saved, 10);
      if (!isNaN(v)) {
        const remaining = Math.floor((v - Date.now()) / 60000);
        if (remaining <= 0) {
          localStorage.removeItem('radio.sleepTimer');
          localStorage.removeItem('radio.sleepTimerTarget');
          return null;
        }
        return v;
      }
    }
  } catch {}
  return null;
}

export const useStore = create<AppState>((set) => ({
  allStations: [],
  currentStations: [],
  totalStationCount: 0,
  favoriteUuids: new Set(),
  favoritesOnly: false,
  activeStationUuid: null,
  sleepTimerMinutes: loadSleepTimer(),
  sleepTimerTarget: loadSleepTimerTarget(),
  toasts: [],
  player: { currentStation: null, isPlaying: false, volume: 0.8 },
  searchOpen: false,
  sync: { inProgress: false, progress: 0, total: null, phase: 'idle', lastSync: null },
  filterQuery: '',
  selectedContinent: 'All',
  selectedTag: 'All',
  selectedCountry: 'All',
  selectedCountryCode: 'All',
  showUnverified: false,
  activeTab: 'discover',
  theme: loadTheme(),
  playerOpen: false,
  dataSaver: loadDataSaver(),

  setAllStations: (stations) => set({ allStations: stations }),
  setCurrentStations: (stations) => set({ currentStations: stations }),
  setTotalStationCount: (totalStationCount) => set({ totalStationCount }),
  setFavoriteUuids: (favoriteUuids) => set({ favoriteUuids }),
  setFavoritesOnly: (v) => set({ favoritesOnly: v }),
  setActiveStationUuid: (uuid) => set({ activeStationUuid: uuid }),
  setSleepTimer: (mins) => {
    set({ sleepTimerMinutes: mins });
    try {
      localStorage.setItem('radio.sleepTimer', String(mins));
      if (mins > 0) {
        localStorage.setItem('radio.sleepTimerTarget', String(Date.now() + mins * 60000));
      } else {
        localStorage.removeItem('radio.sleepTimerTarget');
      }
    } catch {}
  },
  addToast: (message, type = 'info') => {
    const id = `toast-${++toastCounter}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setPlayer: (p) => set((s) => ({ player: { ...s.player, ...p } })),
  setSearchOpen: (v) => set({ searchOpen: v }),
  setFilterQuery: (filterQuery) => set({ filterQuery }),
  setSelectedContinent: (selectedContinent) => set({ selectedContinent }),
  setSelectedTag: (selectedTag) => set({ selectedTag }),
  setSelectedCountry: (selectedCountry) => set({ selectedCountry }),
  setSelectedCountryCode: (selectedCountryCode) => set({ selectedCountryCode }),
  setShowUnverified: (showUnverified) => set({ showUnverified }),
  setSyncState: (s) => set((state) => ({ sync: { ...state.sync, ...s } })),
  setActiveTab: (activeTab) => set({ activeTab }),
  setTheme: (theme) => {
    set({ theme });
    try { localStorage.setItem('radio.theme', theme); } catch {}
  },
  setPlayerOpen: (playerOpen) => set({ playerOpen }),
  setDataSaver: (dataSaver) => {
    set({ dataSaver });
    try { localStorage.setItem('radio.dataSaver', dataSaver ? '1' : '0'); } catch {}
  },
}));

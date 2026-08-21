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

export type ActiveTab = 'discover' | 'favorites' | 'settings' | 'mine';
export type ThemeMode = 'light' | 'dark' | 'system';
export type Density = 'compact' | 'normal' | 'cozy';

export interface PlayStatEntry {
  plays: number;
  seconds: number;
  lastPlayed: number;
  name: string;
  favicon?: string | null;
  country?: string | null;
}

export type PlayStats = Record<string, PlayStatEntry>;

interface AppState {
  allStations: Station[];
  currentStations: Station[];
  recentlyPlayed: Station[];
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
  accentColor: string;
  pureBlack: boolean;
  dynamicAccent: boolean;
  density: Density;
  crossfade: boolean;
  crossfadeDuration: number;
  queue: Station[];
  myStations: Station[];
  myStationsOnly: boolean;
  playStats: PlayStats;

  setAllStations: (stations: Station[]) => void;
  setCurrentStations: (stations: Station[]) => void;
  addRecentStation: (station: Station) => void;
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
  setAccentColor: (c: string) => void;
  setPureBlack: (v: boolean) => void;
  setDynamicAccent: (v: boolean) => void;
  setDensity: (d: Density) => void;
  setCrossfade: (v: boolean) => void;
  setCrossfadeDuration: (d: number) => void;
  addToQueue: (station: Station) => void;
  removeFromQueue: (uuid: string) => void;
  clearQueue: () => void;
  playNextFromQueue: () => Station | null;
  addMyStation: (station: Station) => void;
  removeMyStation: (uuid: string) => void;
  setMyStationsOnly: (v: boolean) => void;
  incrementPlay: (station: Station) => void;
  addPlayTime: (uuid: string, seconds: number) => void;
  resetPlayStats: () => void;
  importData: (data: {
    favorites?: string[];
    recentlyPlayed?: Station[];
    myStations?: Station[];
  }) => void;
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

function loadFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {}
  return false;
}

function loadBoolean(key: string, defaultValue: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return defaultValue;
    return v !== '0';
  } catch {
    return defaultValue;
  }
}

function loadVolume(): number {
  try {
    const saved = localStorage.getItem('radio.volume');
    if (saved) {
      const v = parseFloat(saved);
      if (!isNaN(v) && v >= 0 && v <= 1) return v;
    }
  } catch {}
  return 0.8;
}

function loadDensity(): Density {
  try {
    const saved = localStorage.getItem('radio.density');
    if (saved === 'compact' || saved === 'cozy') return saved;
  } catch {}
  return 'normal';
}

function loadCrossfadeDuration(): number {
  try {
    const saved = localStorage.getItem('radio.crossfadeDuration');
    if (saved) {
      const v = parseFloat(saved);
      if (!isNaN(v) && v >= 0.5 && v <= 3) return v;
    }
  } catch {}
  return 1.2;
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

const RECENT_KEY = 'radio.recentlyPlayed';
const RECENT_MAX = 20;
const QUEUE_KEY = 'radio.queue';
const MY_STATIONS_KEY = 'radio.myStations';
const PLAY_STATS_KEY = 'radio.playStats';
const MY_ONLY_KEY = 'radio.myStationsOnly';

function parseStationList(raw: string | null): Station[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((s) => s && typeof s === 'object' && s.stationuuid && s.url);
    }
  } catch {}
  return [];
}

function loadRecentlyPlayed(): Station[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((s) => s && s.stationuuid).slice(0, RECENT_MAX);
    }
  } catch {}
  return [];
}

function loadQueue(): Station[] {
  return parseStationList(localStorage.getItem(QUEUE_KEY));
}

function loadMyStations(): Station[] {
  return parseStationList(localStorage.getItem(MY_STATIONS_KEY));
}

function loadPlayStats(): PlayStats {
  try {
    const raw = localStorage.getItem(PLAY_STATS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as PlayStats;
    }
  } catch {}
  return {};
}

function loadMyStationsOnly(): boolean {
  try {
    return localStorage.getItem(MY_ONLY_KEY) === '1';
  } catch {}
  return false;
}

function persistPlayStats(stats: PlayStats) {
  try {
    localStorage.setItem(PLAY_STATS_KEY, JSON.stringify(stats));
  } catch {}
}

export const useStore = create<AppState>((set, get) => ({
  allStations: [],
  currentStations: [],
  recentlyPlayed: loadRecentlyPlayed(),
  totalStationCount: 0,
  favoriteUuids: new Set(),
  favoritesOnly: false,
  activeStationUuid: null,
  sleepTimerTarget: loadSleepTimerTarget(),
  sleepTimerMinutes: (() => {
    try {
      const target = localStorage.getItem('radio.sleepTimerTarget');
      if (target) {
        const saved = loadSleepTimer();
        return saved > 0 ? saved : 15;
      }
    } catch {}
    return 0;
  })(),
  toasts: [],
  player: { currentStation: null, isPlaying: false, volume: loadVolume() },
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
  accentColor: '#ff4d6d',
  pureBlack: loadFlag('radio.pureBlack'),
  dynamicAccent: loadBoolean('radio.dynamicAccent', true),
  density: loadDensity(),
  crossfade: loadBoolean('radio.crossfade', true),
  crossfadeDuration: loadCrossfadeDuration(),
  queue: loadQueue(),
  myStations: loadMyStations(),
  myStationsOnly: loadMyStationsOnly(),
  playStats: loadPlayStats(),

  setAllStations: (stations) => set({ allStations: stations }),
  setCurrentStations: (stations) => set({ currentStations: stations }),
  addRecentStation: (station) =>
    set((s) => {
      const next = [station, ...s.recentlyPlayed.filter((x) => x.stationuuid !== station.stationuuid)].slice(0, RECENT_MAX);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {}
      return { recentlyPlayed: next };
    }),
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
  setAccentColor: (accentColor) => set({ accentColor }),
  setPureBlack: (pureBlack) => {
    set({ pureBlack });
    try { localStorage.setItem('radio.pureBlack', pureBlack ? '1' : '0'); } catch {}
  },
  setDynamicAccent: (dynamicAccent) => {
    set({ dynamicAccent });
    try { localStorage.setItem('radio.dynamicAccent', dynamicAccent ? '1' : '0'); } catch {}
  },
  setDensity: (density) => {
    set({ density });
    try { localStorage.setItem('radio.density', density); } catch {}
  },
  setCrossfade: (crossfade) => {
    set({ crossfade });
    try { localStorage.setItem('radio.crossfade', crossfade ? '1' : '0'); } catch {}
  },
  setCrossfadeDuration: (crossfadeDuration) => {
    set({ crossfadeDuration });
    try { localStorage.setItem('radio.crossfadeDuration', String(crossfadeDuration)); } catch {}
  },
  addToQueue: (station) => {
    const current = get().queue;
    if (current.some((s) => s.stationuuid === station.stationuuid)) return;
    const next = [...current, station];
    set({ queue: next });
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(next)); } catch {}
  },
  removeFromQueue: (uuid) => {
    const current = get().queue;
    if (!current.some((s) => s.stationuuid === uuid)) return;
    const next = current.filter((s) => s.stationuuid !== uuid);
    set({ queue: next });
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(next)); } catch {}
  },
  clearQueue: () => {
    set({ queue: [] });
    try { localStorage.removeItem(QUEUE_KEY); } catch {}
  },
  playNextFromQueue: () => {
    const current = get().queue;
    if (current.length === 0) return null;
    const [next, ...rest] = current;
    set({ queue: rest });
    try {
      if (rest.length > 0) localStorage.setItem(QUEUE_KEY, JSON.stringify(rest));
      else localStorage.removeItem(QUEUE_KEY);
    } catch {}
    return next;
  },
  addMyStation: (station) => {
    const current = get().myStations;
    const next = [...current, station];
    set({ myStations: next });
    try { localStorage.setItem(MY_STATIONS_KEY, JSON.stringify(next)); } catch {}
  },
  removeMyStation: (uuid) => {
    const current = get().myStations;
    const next = current.filter((s) => s.stationuuid !== uuid);
    set({ myStations: next });
    try { localStorage.setItem(MY_STATIONS_KEY, JSON.stringify(next)); } catch {}
  },
  setMyStationsOnly: (v) => {
    set({ myStationsOnly: v });
    try { localStorage.setItem(MY_ONLY_KEY, v ? '1' : '0'); } catch {}
  },
  incrementPlay: (station) => {
    const stats = { ...get().playStats };
    const prev = stats[station.stationuuid];
    stats[station.stationuuid] = {
      plays: (prev?.plays ?? 0) + 1,
      seconds: prev?.seconds ?? 0,
      lastPlayed: Date.now(),
      name: station.name,
      favicon: station.favicon ?? null,
      country: station.country ?? null,
    };
    persistPlayStats(stats);
    set({ playStats: stats });
  },
  addPlayTime: (uuid, seconds) => {
    const stats = { ...get().playStats };
    const prev = stats[uuid];
    if (!prev) return;
    stats[uuid] = { ...prev, seconds: prev.seconds + seconds };
    persistPlayStats(stats);
    set({ playStats: stats });
  },
  resetPlayStats: () => {
    set({ playStats: {} });
    try { localStorage.removeItem(PLAY_STATS_KEY); } catch {}
  },
  importData: (data) => {
    const s = get();
    if (data.favorites) {
      const next = new Set(s.favoriteUuids);
      data.favorites.forEach((id) => next.add(id));
      set({ favoriteUuids: next });
      try { localStorage.setItem('radio.favorites', JSON.stringify(Array.from(next))); } catch {}
    }
    if (data.myStations && data.myStations.length > 0) {
      const base = new Map(s.myStations.map((st) => [st.stationuuid, st]));
      data.myStations.forEach((st) => {
        if (st && st.stationuuid && st.url && !base.has(st.stationuuid)) base.set(st.stationuuid, st);
      });
      const next = Array.from(base.values());
      set({ myStations: next });
      try { localStorage.setItem(MY_STATIONS_KEY, JSON.stringify(next)); } catch {}
    }
    if (data.recentlyPlayed && data.recentlyPlayed.length > 0) {
      const merged = [...data.recentlyPlayed, ...s.recentlyPlayed]
        .filter((x) => x && x.stationuuid)
        .filter((x, i, arr) => arr.findIndex((y) => y.stationuuid === x.stationuuid) === i)
        .slice(0, RECENT_MAX);
      set({ recentlyPlayed: merged });
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(merged)); } catch {}
    }
  },
}));

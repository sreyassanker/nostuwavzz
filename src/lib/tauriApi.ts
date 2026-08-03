import type { Station } from '../types';
import { fetchStationsDirect } from './api';

// ——— Tauri IPC helpers ———

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function tryInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<{ ok: true; value: T } | { ok: false }> {
  if (!isTauri()) return { ok: false };
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const value = await invoke<T>(cmd, args);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

// ——— Fallback state for non-Tauri mode ———

let fallbackStations: Station[] = [];

// ——— Public API ———

export async function initSyncDb(): Promise<{
  station_count: number;
  last_sync: string | null;
}> {
  const result = await tryInvoke<string>('init_sync_db');
  if (result.ok) return JSON.parse(result.value);

  // Fallback: fetch from Radio-Browser API directly
  if (fallbackStations.length === 0) {
    fallbackStations = await fetchStationsDirect();
  }
  return { station_count: fallbackStations.length, last_sync: null };
}

export async function syncAllStations(): Promise<string> {
  const result = await tryInvoke<string>('sync_all_stations');
  if (result.ok) return result.value;

  // Fallback: re-fetch from API
  fallbackStations = await fetchStationsDirect();
  return `Synced ${fallbackStations.length} stations (browser mode)`;
}

export async function searchStations(
  query: string,
  opts?: {
    country?: string;
    language?: string;
    tags?: string;
    limit?: number;
    offset?: number;
  }
): Promise<Station[]> {
  const result = await tryInvoke<Station[]>('search_stations', {
    query: query || '*',
    country: opts?.country ?? null,
    language: opts?.language ?? null,
    tags: opts?.tags ?? null,
    limit: opts?.limit ?? 200,
    offset: opts?.offset ?? 0,
  });
  if (result.ok) return result.value;

  // Fallback: in-memory filter
  const stations =
    fallbackStations.length > 0
      ? fallbackStations
      : await fetchStationsDirect();
  if (fallbackStations.length === 0) fallbackStations = stations;

  let filtered = stations;

  if (query && query !== '*') {
    filtered = filtered.filter((s) => {
      const q = query.toLowerCase();
      return (
        s.name?.toLowerCase().includes(q) ||
        s.country?.toLowerCase().includes(q) ||
        s.tags?.toLowerCase().includes(q)
      );
    });
  }

  if (opts?.country && opts.country !== 'All') {
    filtered = filtered.filter((s) => s.countrycode === opts.country);
  }

  if (opts?.tags && opts.tags !== 'All') {
    filtered = filtered.filter(
      (s) =>
        s.tags?.toLowerCase().includes(opts.tags!.toLowerCase())
    );
  }

  return filtered.slice(0, opts?.limit ?? 200);
}

export async function getGeolocatedStations(): Promise<Station[]> {
  const result = await tryInvoke<Station[]>('get_geolocated_stations');
  if (result.ok) return result.value;

  // Fallback: filter in-memory
  const stations =
    fallbackStations.length > 0
      ? fallbackStations
      : await fetchStationsDirect();
  return stations.filter(
    (s) =>
      s.geo_lat != null &&
      s.geo_long != null &&
      !isNaN(s.geo_lat) &&
      !isNaN(s.geo_long) &&
      s.geo_lat !== 0 &&
      s.geo_long !== 0
  );
}

export async function getStationByUuid(
  stationuuid: string
): Promise<Station | null> {
  const result = await tryInvoke<Station | null>('get_station_by_uuid', {
    stationuuid,
  });
  if (result.ok) return result.value;

  const s = fallbackStations.find((s) => s.stationuuid === stationuuid);
  return s || null;
}

export async function getStationsCount(): Promise<number> {
  const result = await tryInvoke<number>('get_stations_count');
  if (result.ok) return result.value;
  return fallbackStations.length;
}

export async function getDistinctValues(
  column: string,
  limit = 100
): Promise<string[]> {
  const result = await tryInvoke<string[]>('get_distinct_values', {
    column,
    limit,
  });
  if (result.ok) return result.value;

  // Fallback: extract from in-memory
  const stations =
    fallbackStations.length > 0
      ? fallbackStations
      : await fetchStationsDirect();
  if (column === 'countrycode') {
    return [
      ...new Set(stations.map((s) => s.countrycode).filter(Boolean)),
    ] as string[];
  }
  if (column === 'tags') {
    return [
      ...new Set(
        stations
          .flatMap((s) => (s.tags ? s.tags.split(',').map((t) => t.trim()) : []))
          .filter(Boolean)
      ),
    ] as string[];
  }
  return [];
}

export async function toggleFavorite(
  stationuuid: string
): Promise<boolean> {
  const result = await tryInvoke<boolean>('toggle_favorite', { stationuuid });
  if (result.ok) return result.value;

  // Fallback: use localStorage
  try {
    const raw = localStorage.getItem('radio.favorites') || '[]';
    const favs: string[] = JSON.parse(raw);
    const idx = favs.indexOf(stationuuid);
    if (idx >= 0) {
      favs.splice(idx, 1);
      localStorage.setItem('radio.favorites', JSON.stringify(favs));
      return false;
    } else {
      favs.push(stationuuid);
      localStorage.setItem('radio.favorites', JSON.stringify(favs));
      return true;
    }
  } catch {
    return false;
  }
}

export async function getFavorites(
  limit = 200,
  _offset = 0
): Promise<Station[]> {
  const result = await tryInvoke<Station[]>('get_favorites', { limit, offset: _offset });
  if (result.ok) return result.value;

  // Fallback: from localStorage
  try {
    const raw = localStorage.getItem('radio.favorites') || '[]';
    const uuids: string[] = JSON.parse(raw);
    const stations =
      fallbackStations.length > 0
        ? fallbackStations
        : await fetchStationsDirect();
    return stations
      .filter((s) => uuids.includes(s.stationuuid))
      .slice(0, limit);
  } catch {
    return [];
  }
}

export async function setLastPlayed(stationuuid: string): Promise<void> {
  const result = await tryInvoke<void>('set_last_played', { stationuuid });
  if (result.ok) return;

  try {
    const station = fallbackStations.find((s) => s.stationuuid === stationuuid);
    if (station) {
      localStorage.setItem('radio.lastPlayed', JSON.stringify(station));
    }
  } catch {}
}

export async function getLastPlayed(): Promise<Station | null> {
  const result = await tryInvoke<Station | null>('get_last_played');
  if (result.ok) return result.value;

  try {
    const raw = localStorage.getItem('radio.lastPlayed');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

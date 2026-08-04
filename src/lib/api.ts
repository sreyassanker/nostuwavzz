import type { Station } from '../types';

const RADIO_BROWSER_URL = 'https://de1.api.radio-browser.info/json/stations/topclick/500';

export interface RadioBrowserRawStation {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved: string | null;
  homepage: string | null;
  favicon: string | null;
  tags: string | null;
  country: string | null;
  countrycode: string | null;
  state: string | null;
  language: string | null;
  languagecodes: string | null;
  votes: number | null;
  clickcount: number | null;
  bitrate: number | null;
  codec: string | null;
  lastcheckok: number | null;
  lastchecktime: string | null;
  clicktimestamp: string | null;
  geo_lat: string | null;
  geo_long: string | null;
  [key: string]: unknown;
}

export function normalizeStation(raw: RadioBrowserRawStation): Station {
  return {
    stationuuid: raw.stationuuid,
    name: raw.name || '',
    url: raw.url || '',
    url_resolved: raw.url_resolved || raw.url || null,
    homepage: raw.homepage || null,
    favicon: raw.favicon || null,
    tags: raw.tags || null,
    country: raw.country || null,
    countrycode: raw.countrycode || null,
    state: raw.state || null,
    language: raw.language || null,
    languagecodes: raw.languagecodes || null,
    votes: raw.votes ?? null,
    clickcount: raw.clickcount ?? null,
    bitrate: raw.bitrate ?? null,
    codec: raw.codec || null,
    lastcheckok: raw.lastcheckok ?? null,
    lastchecktime: raw.lastchecktime || null,
    clicktimestamp: raw.clicktimestamp || null,
    geo_lat: raw.geo_lat ? parseFloat(raw.geo_lat) : null,
    geo_long: raw.geo_long ? parseFloat(raw.geo_long) : null,
  };
}

export async function fetchStationsDirect(): Promise<Station[]> {
  const response = await fetch(RADIO_BROWSER_URL, {
    headers: { 'User-Agent': 'NostuWavzz/2.0' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data: RadioBrowserRawStation[] = await response.json();
  if (!Array.isArray(data)) throw new Error('Invalid response');
  return data
    .filter(
      (s) =>
        s.url_resolved?.startsWith('https://') &&
        s.name?.trim().length > 0 &&
        s.codec !== 'UNKNOWN'
    )
    .map(normalizeStation);
}

export async function searchStationsDirect(
  query: string,
  stations: Station[]
): Promise<Station[]> {
  const q = query.toLowerCase().trim();
  if (!q) return stations;
  return stations.filter((s) => {
    const nameMatch = s.name?.toLowerCase().includes(q);
    const countryMatch = s.country?.toLowerCase().includes(q);
    const tagMatch = s.tags?.toLowerCase().includes(q);
    return nameMatch || countryMatch || tagMatch;
  });
}

export function filterStations(
  stations: Station[],
  filters: {
    query?: string;
    countries?: string[];
    tags?: string[];
    bitrates?: string[];
    favoritesOnly?: boolean;
    favoriteUuids?: Set<string>;
    continent?: string;
  }
) {
  const {
    query = '',
    countries = [],
    tags = [],
    bitrates = [],
    favoritesOnly = false,
    favoriteUuids = new Set(),
    continent = 'All',
  } = filters;
  const q = query.toLowerCase().trim();

  return stations.filter((s) => {
    if (favoritesOnly && !favoriteUuids.has(s.stationuuid)) return false;
    if (countries.length > 0) {
      const sc = s.country?.trim() || 'Unknown';
      if (!countries.includes(sc)) return false;
    }
    if (tags.length > 0) {
      const st = s.tags
        ? s.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
        : [];
      if (!tags.some((t) => st.includes(t))) return false;
    }
    if (bitrates.length > 0) {
      const bucket = getBitrateBucket(s.bitrate);
      if (!bitrates.includes(bucket)) return false;
    }
    if (continent !== 'All') {
      const lat = s.geo_lat;
      const lng = s.geo_long;
      if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
        if (!isInContinent(lat, lng, continent)) return false;
      }
    }
    if (q) {
      const nameMatch = s.name?.toLowerCase().includes(q);
      const countryMatch = s.country?.toLowerCase().includes(q);
      const tagMatch = s.tags?.toLowerCase().includes(q);
      if (!nameMatch && !countryMatch && !tagMatch) return false;
    }
    return true;
  });
}

export function isInContinent(
  lat: number | null | undefined,
  lng: number | null | undefined,
  continent: string
): boolean {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return true;
  const regions: Record<string, (lat: number, lng: number) => boolean> = {
    'N. America': (lat, lng) => lat > 15 && lng < -50 && lng > -170,
    'S. America': (lat, lng) => lat < 15 && lat > -60 && lng < -30 && lng > -90,
    'Europe': (lat, lng) => lat > 35 && lat < 72 && lng > -10 && lng < 45,
    'Africa': (lat, lng) => lat > -40 && lat < 38 && lng > -20 && lng < 55,
    'Asia': (lat, lng) => lat > 0 && lat < 75 && lng > 40 && lng < 180,
    'Oceania': (lat, lng) => lat > -50 && lat < -10 && lng > 110 && lng < 180,
  };
  return regions[continent]?.(lat, lng) ?? true;
}

export function getBitrateBucket(
  bitrate: string | number | null | undefined
): string {
  const b = Number(bitrate) || 0;
  if (b === 0) return 'Unknown';
  const BUCKETS = [
    { label: '0-64 kbps', min: 0, max: 64 },
    { label: '64-128 kbps', min: 64, max: 128 },
    { label: '128-192 kbps', min: 128, max: 192 },
    { label: '192-320 kbps', min: 192, max: 320 },
    { label: '320+ kbps', min: 320, max: Infinity },
  ];
  for (const bucket of BUCKETS) {
    if (b > bucket.min && b <= bucket.max) return bucket.label;
  }
  return BUCKETS[BUCKETS.length - 1].label;
}

export function getTopCountries(stations: Station[], limit = 30) {
  const byKey: Record<string, { country: string; code: string; count: number }> = {};
  for (const s of stations) {
    const name = s.country?.trim();
    if (!name) continue;
    const code = s.countrycode?.trim().toUpperCase() || '';
    if (!code) continue;
    const key = name.toLowerCase();
    const entry = byKey[key] ?? (byKey[key] = { country: name, code, count: 0 });
    entry.count++;
    if (entry.code !== code) entry.code = code;
  }
  return Object.values(byKey)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function countryNameToCode(name: string, stations: Station[]): string {
  const n = name.trim().toLowerCase();
  for (const s of stations) {
    if (s.country?.trim().toLowerCase() === n && s.countrycode) {
      return s.countrycode;
    }
  }
  return 'All';
}

export function getTopTags(stations: Station[], limit = 30) {
  const counts: Record<string, number> = {};
  for (const s of stations) {
    if (s.tags) {
      const seen = new Set<string>();
      for (const t of s.tags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)) {
        if (!seen.has(t)) {
          seen.add(t);
          counts[t] = (counts[t] || 0) + 1;
        }
      }
    }
  }
  return Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

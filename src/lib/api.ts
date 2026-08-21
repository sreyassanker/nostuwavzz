import type { Station } from '../types';

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

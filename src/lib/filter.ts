import { isInContinent } from './api';
import type { Station } from '../types';

export interface FilterArgs {
  query?: string;
  countryCode?: string | null;
  tag?: string | null;
  continent?: string | null;
  favoritesOnly?: boolean;
  favoriteUuids?: string[] | Set<string>;
  showUnverified?: boolean;
}

export function filterStations(stations: Station[], f: FilterArgs): Station[] {
  let out = stations;

  if (!f.showUnverified) {
    out = out.filter((s) => s.validated !== false);
  }

  if (f.favoritesOnly) {
    const favs = f.favoriteUuids instanceof Set ? f.favoriteUuids : new Set(f.favoriteUuids ?? []);
    out = out.filter((s) => favs.has(s.stationuuid));
  }

  const q = (f.query ?? '').toLowerCase().trim();

  if (f.countryCode && f.countryCode !== 'All') {
    const cc = f.countryCode.toLowerCase();
    out = out.filter((s) => (s.countrycode ?? '').toLowerCase() === cc);
  }

  if (f.tag && f.tag !== 'All') {
    const tl = f.tag.toLowerCase().trim();
    out = out.filter((s) => {
      if (!s.tags) return false;
      const stationTags = s.tags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      return stationTags.some((t) => t.includes(tl));
    });
  }

  if (f.continent && f.continent !== 'All') {
    const c = f.continent;
    out = out.filter((s) => isInContinent(s.geo_lat, s.geo_long, c));
  }

  if (q) {
    out = out.filter(
      (s) =>
        (s.name ?? '').toLowerCase().includes(q) ||
        (s.country ?? '').toLowerCase().includes(q) ||
        (s.tags ?? '').toLowerCase().includes(q)
    );
  }

  return out;
}

import { filterStations, type FilterArgs } from '../lib/filter';
import type { Station } from '../types';

let stationStore: Station[] = [];

self.onmessage = function (e: MessageEvent<{ id: number; stations?: Station[] } & FilterArgs>) {
  const { id, stations, ...filters } = e.data;

  if (Array.isArray(stations)) {
    stationStore = stations;
  }

  if (!stationStore.length) {
    self.postMessage({ id, filtered: [] });
    return;
  }

  const filtered = filterStations(stationStore, {
    query: filters.query,
    countryCode: filters.countryCode,
    tag: filters.tag,
    continent: filters.continent,
    favoritesOnly: filters.favoritesOnly,
    favoriteUuids: filters.favoriteUuids,
    showUnverified: filters.showUnverified,
  });

  self.postMessage({ id, filtered });
};

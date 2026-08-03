// @ts-nocheck
function isInContinent(lat, lng, continent) {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return true;
  const regions = {
    'N. America': (lat, lng) => lat > 15 && lng < -50 && lng > -170,
    'S. America': (lat, lng) => lat < 15 && lat > -60 && lng < -30 && lng > -90,
    'Europe': (lat, lng) => lat > 35 && lat < 72 && lng > -10 && lng < 45,
    'Africa': (lat, lng) => lat > -40 && lat < 38 && lng > -20 && lng < 55,
    'Asia': (lat, lng) => lat > 0 && lat < 75 && lng > 40 && lng < 180,
    'Oceania': (lat, lng) => lat > -50 && lat < -10 && lng > 110 && lng < 180,
  };
  return regions[continent]?.(lat, lng) ?? true;
}

let stationStore = [];

self.onmessage = function (e) {
  const { id, stations, query, country, tags, continent, favoritesOnly, favoriteUuids, showUnverified } = e.data;

  if (Array.isArray(stations)) {
    stationStore = stations;
  }

  const favSet = new Set(favoriteUuids || []);
  const q = (query || '').toLowerCase().trim();

  let filtered = stationStore;

  if (!filtered.length) {
    self.postMessage({ id, filtered: [] });
    return;
  }

  if (!showUnverified) {
    filtered = filtered.filter(function (s) { return s.validated !== false; });
  }

  if (favoritesOnly) {
    filtered = filtered.filter(function (s) { return favSet.has(s.stationuuid); });
  }

  if (country && country !== 'All') {
    filtered = filtered.filter(function (s) { return s.countrycode === country; });
  }

  if (tags && tags !== 'All') {
    const tagLower = tags.toLowerCase().trim();
    filtered = filtered.filter(function (s) {
      if (!s.tags) return false;
      const stationTags = s.tags.split(',').map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean);
      return stationTags.some(function (t) { return t.includes(tagLower); });
    });
  }

  if (continent && continent !== 'All') {
    filtered = filtered.filter(function (s) { return isInContinent(s.geo_lat, s.geo_long, continent); });
  }

  if (q) {
    filtered = filtered.filter(function (s) {
      return (
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.country && s.country.toLowerCase().includes(q)) ||
        (s.tags && s.tags.toLowerCase().includes(q))
      );
    });
  }

  self.postMessage({ id, filtered });
};

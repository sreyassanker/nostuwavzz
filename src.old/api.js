const API_URL = 'https://de1.api.radio-browser.info/json/stations/topclick/500';

/**
 * Fetch stations from the Radio Browser API.
 * Filters out stations without HTTPS URLs, empty names, or UNKNOWN codec.
 */
export async function fetchStations() {
  const response = await fetch(API_URL, {
    headers: {
      'User-Agent': 'RadioGlobal/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: Failed to fetch stations`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error('Invalid response format');
  }

  // Client-side filtering
  const filtered = data.filter(station => {
    return (
      station.url_resolved &&
      station.url_resolved.startsWith('https://') &&
      station.name &&
      station.name.trim().length > 0 &&
      station.codec !== 'UNKNOWN'
    );
  });

  return filtered;
}

/**
 * Get top countries by station count.
 * Returns array of { country: string, count: number } sorted desc.
 */
export function getTopCountries(stations, limit = 30) {
  const counts = {};
  for (const s of stations) {
    const country = s.country && s.country.trim() ? s.country.trim() : 'Unknown';
    counts[country] = (counts[country] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get top tags by station count.
 * Tags are comma-separated in station.tags string.
 * Returns array of { tag: string, count: number } sorted desc.
 */
export function getTopTags(stations, limit = 30) {
  const counts = {};
  for (const s of stations) {
    if (s.tags) {
      const tagList = s.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      // Deduplicate tags per station
      const seen = new Set();
      for (const tag of tagList) {
        if (!seen.has(tag)) {
          seen.add(tag);
          counts[tag] = (counts[tag] || 0) + 1;
        }
      }
    }
  }

  return Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get bitrate buckets with counts.
 * Returns buckets: "0-64", "64-128", "128-192", "192-320", "320+"
 */
export function getBitrateBuckets(stations) {
  const buckets = {
    '0-64': 0,
    '64-128': 0,
    '128-192': 0,
    '192-320': 0,
    '320+': 0
  };

  for (const s of stations) {
    const bitrate = parseInt(s.bitrate, 10) || 0;
    if (bitrate <= 64) {
      buckets['0-64']++;
    } else if (bitrate <= 128) {
      buckets['64-128']++;
    } else if (bitrate <= 192) {
      buckets['128-192']++;
    } else if (bitrate <= 320) {
      buckets['192-320']++;
    } else {
      buckets['320+']++;
    }
  }

  return buckets;
}

/**
 * Check if a bitrate falls within a bucket label.
 */
function bitrateInBucket(bitrate, bucket) {
  const b = parseInt(bitrate, 10) || 0;
  switch (bucket) {
    case '0-64': return b <= 64;
    case '64-128': return b > 64 && b <= 128;
    case '128-192': return b > 128 && b <= 192;
    case '192-320': return b > 192 && b <= 320;
    case '320+': return b > 320;
    default: return false;
  }
}

/**
 * Filter stations by query, countries, tags, bitrates, and favorites.
 */
export function filterStations(stations, filters) {
  const {
    query = '',
    countries = [],
    tags = [],
    bitrates = [],
    favoritesOnly = false,
    favoriteUuids = new Set()
  } = filters;

  const queryLower = query.toLowerCase().trim();

  return stations.filter(s => {
    // Favorites filter
    if (favoritesOnly && !favoriteUuids.has(s.stationuuid)) {
      return false;
    }

    // Country filter
    if (countries.length > 0) {
      const stationCountry = s.country && s.country.trim() ? s.country.trim() : 'Unknown';
      if (!countries.includes(stationCountry)) {
        return false;
      }
    }

    // Tags filter
    if (tags.length > 0) {
      const stationTags = s.tags
        ? s.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
        : [];
      const hasTag = tags.some(tag => stationTags.includes(tag));
      if (!hasTag) {
        return false;
      }
    }

    // Bitrate filter
    if (bitrates.length > 0) {
      const matches = bitrates.some(bucket => bitrateInBucket(s.bitrate, bucket));
      if (!matches) {
        return false;
      }
    }

    // Query filter (fuzzy match against name, country, tags)
    if (queryLower) {
      const nameMatch = s.name && s.name.toLowerCase().includes(queryLower);
      const countryMatch = s.country && s.country.toLowerCase().includes(queryLower);
      const tagMatch = s.tags && s.tags.toLowerCase().includes(queryLower);
      if (!nameMatch && !countryMatch && !tagMatch) {
        return false;
      }
    }

    return true;
  });
}

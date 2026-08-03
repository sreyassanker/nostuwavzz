import { openDB, type IDBPDatabase } from 'idb';

const MAX_CACHE_ENTRIES = 5000;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB('radio-image-cache', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('favicons')) {
          const store = db.createObjectStore('favicons', { keyPath: 'url' });
          store.createIndex('cachedAt', 'cachedAt');
        }
      },
    });
  }
  return dbPromise;
}

export async function getCachedFavicon(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const db = await getDb();
    const entry = await db.get('favicons', url);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > TTL_MS) {
      await db.delete('favicons', url);
      URL.revokeObjectURL(entry.blobUrl);
      return null;
    }
    return entry.blobUrl;
  } catch {
    return null;
  }
}

export async function cacheFavicon(url: string): Promise<string> {
  const existing = await getCachedFavicon(url);
  if (existing) return existing;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      mode: 'no-cors',
    });
    const blob = await response.blob();

    if (blob.size === 0) return url;

    const blobUrl = URL.createObjectURL(blob);
    const db = await getDb();

    const count = await db.count('favicons');
    if (count >= MAX_CACHE_ENTRIES) {
      const cursor = await db.transaction('favicons', 'readwrite').store.index('cachedAt').openCursor();
      if (cursor) {
        URL.revokeObjectURL(cursor.value.blobUrl);
        await cursor.delete();
      }
    }

    try {
      await db.put('favicons', {
        url,
        blobUrl,
        cachedAt: Date.now(),
        size: blob.size,
      });
    } catch {
      URL.revokeObjectURL(blobUrl);
    }

    return blobUrl;
  } catch {
    return url;
  }
}

export async function getFaviconWithCache(url: string): Promise<string> {
  const cached = await getCachedFavicon(url);
  if (cached) return cached;
  return cacheFavicon(url);
}

export async function clearCache(): Promise<void> {
  try {
    const db = await getDb();
    const all = await db.getAll('favicons');
    for (const entry of all) {
      URL.revokeObjectURL(entry.blobUrl);
    }
    await db.clear('favicons');
  } catch {
  }
}

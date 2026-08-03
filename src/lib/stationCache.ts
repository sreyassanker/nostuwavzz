import { openDB, type IDBPDatabase } from 'idb';
import type { Station } from '../types';

const DB_NAME = 'radio-stations';
const DB_VERSION = 1;
const STORE_NAME = 'stations';
const META_STORE = 'meta';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'stationuuid' });
          store.createIndex('name', 'name');
          store.createIndex('countrycode', 'countrycode');
          store.createIndex('tags', 'tags');
          store.createIndex('clickcount', 'clickcount');
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

export async function loadAllStations(): Promise<Station[]> {
  try {
    const db = await getDb();
    const stations = await db.getAll(STORE_NAME);
    return stations || [];
  } catch {
    return [];
  }
}

export async function saveStationsBatch(stations: Station[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  for (const station of stations) {
    try {
      await store.put(station);
    } catch (e) {
      console.error('Failed to cache station:', station.stationuuid, e);
    }
  }

  await tx.done.catch((e) => console.error('IndexedDB transaction failed:', e));
}

export async function clearStations(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE_NAME);
}

export async function getStationCount(): Promise<number> {
  try {
    const db = await getDb();
    return await db.count(STORE_NAME);
  } catch {
    return 0;
  }
}

export async function getMeta(key: string): Promise<string | null> {
  try {
    const db = await getDb();
    const entry = await db.get(META_STORE, key);
    return entry?.value ?? null;
  } catch {
    return null;
  }
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.put(META_STORE, { key, value });
}

export async function getLastSyncTime(): Promise<string | null> {
  return getMeta('lastSync');
}

export async function setLastSyncTime(): Promise<void> {
  await setMeta('lastSync', new Date().toISOString());
}

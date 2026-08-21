import { openDB, type IDBPDatabase } from 'idb';

const MAX_CACHE_ENTRIES = 5000;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAIL_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BLOB_SIZE = 2 * 1024 * 1024;
const objectUrls = new Set<string>();
const failedUrls = new Map<string, number>();

let dbPromise: Promise<IDBPDatabase> | null = null;

const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
let invokeFn: InvokeFn | null = null;
let invokeFailed = false;

async function getInvoke(): Promise<InvokeFn | null> {
  if (!isTauri || invokeFailed) return invokeFn;
  if (invokeFn) return invokeFn;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    invokeFn = invoke as InvokeFn;
    return invokeFn;
  } catch {
    invokeFailed = true;
    return null;
  }
}

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB('radio-image-cache', 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 2 && db.objectStoreNames.contains('favicons')) {
          db.deleteObjectStore('favicons');
        }
        if (!db.objectStoreNames.contains('favicons')) {
          const store = db.createObjectStore('favicons', { keyPath: 'url' });
          store.createIndex('cachedAt', 'cachedAt');
        }
        if (!db.objectStoreNames.contains('failures')) {
          db.createObjectStore('failures', { keyPath: 'url' });
        }
      },
    });
  }
  return dbPromise;
}

function trackObjectUrl(u: string): string {
  objectUrls.add(u);
  return u;
}

function base64ToBlob(base64: string, mime: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes.buffer as ArrayBuffer], { type: mime || 'image/jpeg' });
}

async function isFailed(url: string): Promise<boolean> {
  const mem = failedUrls.get(url);
  if (mem && Date.now() - mem < FAIL_TTL_MS) return true;
  try {
    const db = await getDb();
    const entry = await db.get('failures', url);
    if (entry && Date.now() - entry.cachedAt < FAIL_TTL_MS) {
      failedUrls.set(url, entry.cachedAt);
      return true;
    }
    if (entry) await db.delete('failures', url);
  } catch {}
  return false;
}

async function markFailed(url: string): Promise<void> {
  const now = Date.now();
  failedUrls.set(url, now);
  try {
    const db = await getDb();
    await db.put('failures', { url, cachedAt: now });
  } catch {}
}

export async function getCachedFavicon(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const db = await getDb();
    const entry = await db.get('favicons', url);
    if (!entry || !(entry.blob instanceof Blob)) return null;
    if (Date.now() - entry.cachedAt > TTL_MS) {
      await db.delete('favicons', url);
      return null;
    }
    return trackObjectUrl(URL.createObjectURL(entry.blob));
  } catch {
    return null;
  }
}

async function fetchBlob(url: string): Promise<Blob> {
  const invoke = await getInvoke();
  if (invoke) {
    const result = (await invoke('fetch_image', { url })) as {
      mime: string;
      data: string;
    } | null;
    if (!result || !result.data) throw new Error('empty native response');
    return base64ToBlob(result.data, result.mime);
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error(`http ${response.status}`);
  const blob = await response.blob();
  if (blob.size === 0) throw new Error('empty body');
  const type = blob.type.toLowerCase();
  if (type && !type.startsWith('image/')) throw new Error('not an image');
  return blob;
}

export async function cacheFavicon(url: string): Promise<string | null> {
  const existing = await getCachedFavicon(url);
  if (existing) return existing;
  if (await isFailed(url)) return null;

  try {
    const blob = await fetchBlob(url);
    if (blob.size > MAX_BLOB_SIZE) {
      await markFailed(url);
      return null;
    }

    const db = await getDb();

    const count = await db.count('favicons');
    if (count >= MAX_CACHE_ENTRIES) {
      const cursor = await db.transaction('favicons', 'readwrite').store.index('cachedAt').openCursor();
      if (cursor) {
        await cursor.delete();
      }
    }

    await db.put('favicons', {
      url,
      blob,
      cachedAt: Date.now(),
      size: blob.size,
    });

    return trackObjectUrl(URL.createObjectURL(blob));
  } catch {
    await markFailed(url);
    return null;
  }
}

export async function getFaviconWithCache(url: string): Promise<string | null> {
  const cached = await getCachedFavicon(url);
  if (cached) return cached;
  return cacheFavicon(url);
}

export function revokeFaviconUrl(objectUrl: string): void {
  if (objectUrl.startsWith('blob:') && objectUrls.has(objectUrl)) {
    URL.revokeObjectURL(objectUrl);
    objectUrls.delete(objectUrl);
  }
}

export async function clearCache(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear('favicons');
    await db.clear('failures');
    failedUrls.clear();
    for (const u of objectUrls) {
      URL.revokeObjectURL(u);
    }
    objectUrls.clear();
  } catch {
  }
}

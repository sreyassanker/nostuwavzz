import type { Station } from '../types';

const FAV_KEY = 'radio.favorites';
const LAST_KEY = 'radio.lastPlayed';

export function getFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveFavorites(favs: Set<string>) {
  localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(favs)));
}

export function toggleFavorite(uuid: string): boolean {
  const favs = getFavorites();
  if (favs.has(uuid)) {
    favs.delete(uuid);
    saveFavorites(favs);
    return false;
  } else {
    favs.add(uuid);
    saveFavorites(favs);
    return true;
  }
}

export function isFavorite(uuid: string): boolean {
  return getFavorites().has(uuid);
}

export function getLastPlayed(): Station | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setLastPlayed(station: Station) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(station));
  } catch {}
}

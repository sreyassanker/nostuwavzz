import type { Station } from '../types';

export function escapeHtml(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function countryCodeToFlag(code: string): string {
  if (!code || code.length !== 2) return '';
  const cc = code.toUpperCase();
  return String.fromCodePoint(
    0x1f1e6 + cc.charCodeAt(0) - 65,
    0x1f1e6 + cc.charCodeAt(1) - 65
  );
}

export function highlightMatch(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(text);
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return `${escapeHtml(before)}<mark class="bg-accent/30 text-accent rounded px-0.5">${escapeHtml(match)}</mark>${highlightMatch(after, query)}`;
}

export function stationUrl(station: Station): string | null {
  const url = (station.url_resolved || station.url || '').trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'audio:') return null;
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'blob:' && parsed.protocol !== 'data:') return null;
    return url;
  } catch {
    return null;
  }
}

function stationTags(station: Station): string[] {
  return (station.tags || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function scoreSimilarity(a: Station, b: Station): number {
  if (a.stationuuid === b.stationuuid) return -1;
  const aTags = stationTags(a);
  const bTags = stationTags(b);
  const overlap = aTags.filter((t) => bTags.includes(t)).length;
  let score = overlap * 2;
  if (a.country && b.country && a.country.toUpperCase() === b.country.toUpperCase()) score += 1;
  if (a.codec && b.codec && a.codec === b.codec) score += 0.5;
  if (a.bitrate && b.bitrate && Math.abs(a.bitrate - b.bitrate) <= 32) score += 0.25;
  return score;
}

export function similarStations(station: Station, all: Station[], count = 6): Station[] {
  const scored = all
    .map((candidate) => ({ candidate, score: scoreSimilarity(station, candidate) }))
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((x) => x.candidate);
}

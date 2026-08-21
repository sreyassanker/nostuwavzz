import type { Station } from '../types';
import { normalizeStation } from './api';

interface RawStation {
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

function isValid(s: RawStation): boolean {
  const streamUrl = s.url_resolved || s.url;
  return !!(
    streamUrl?.startsWith('http') &&
    s.name?.trim().length > 0 &&
    s.codec !== 'UNKNOWN' &&
    s.lastcheckok !== 0
  );
}

const MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://fr1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];

const BATCH_SIZE = 1000;
const DELAY_MS = 60;
export const TARGET_STATIONS = 50_000;
const TARGET = TARGET_STATIONS;
const MAX_OFFSET = 60_000;

export type FetchProgressCallback = (fetched: number, total: number, stations?: Station[]) => void;

export async function fetchAllStations(
  onProgress?: FetchProgressCallback
): Promise<Station[]> {
  const seen = new Set<string>();
  const all: Station[] = [];
  let offset = 0;
  let emptyBatches = 0;
  let mirrorIndex = 0;

  while (offset < MAX_OFFSET && all.length < TARGET) {
    const mirror = MIRRORS[mirrorIndex];
    const url = `${mirror}/json/stations?limit=${BATCH_SIZE}&offset=${offset}&hidebroken=true&order=clickcount&reverse=true`;

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'NostuWavzz/3.0' },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        mirrorIndex = (mirrorIndex + 1) % MIRRORS.length;
        emptyBatches++;
        if (emptyBatches > 3) break;
        await sleep(2000);
        continue;
      }

      emptyBatches = 0;
      const batch: RawStation[] = await res.json();

      if (!batch.length) break;

      const validBatch: Station[] = [];
      for (const raw of batch) {
        if (!isValid(raw)) continue;
        if (seen.has(raw.stationuuid)) continue;
        seen.add(raw.stationuuid);
        const station = normalizeStation(raw);
        station.validated = raw.lastcheckok !== 0;
        station.lastValidated = raw.lastchecktime ? Date.parse(raw.lastchecktime) || Date.now() : Date.now();
        validBatch.push(station);
      }

      all.push(...validBatch);
      offset += BATCH_SIZE;
      onProgress?.(all.length, TARGET, all.slice());
      await sleep(DELAY_MS);
    } catch {
      mirrorIndex = (mirrorIndex + 1) % MIRRORS.length;
      emptyBatches++;
      if (emptyBatches > 3) break;
      await sleep(2000);
    }
  }

  return all;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface NowPlaying {
  stationuuid: string;
  title: string;
  artist?: string | null;
  source: string;
}

export interface ProbeResult {
  ok: boolean;
  latency_ms?: number | null;
  content_type?: string | null;
  error?: string | null;
}

export interface HealthEntry {
  ok: boolean;
  latency_ms?: number | null;
  checked_at?: string | null;
}

export const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function startMetadataMonitor(url: string, stationuuid: string): Promise<void> {
  if (!isTauri) return Promise.resolve();
  return invoke('start_metadata_monitor', { url, stationuuid })
    .then(() => undefined)
    .catch(() => {});
}

export function stopMetadataMonitor(): Promise<void> {
  if (!isTauri) return Promise.resolve();
  return invoke('stop_metadata_monitor')
    .then(() => undefined)
    .catch(() => {});
}

export function onMetadataUpdate(cb: (meta: NowPlaying) => void): Promise<UnlistenFn> {
  return listen<NowPlaying>('metadata-update', (e) => cb(e.payload));
}

export function probeStation(url: string, stationuuid?: string): Promise<ProbeResult> {
  if (!isTauri) return Promise.resolve({ ok: true });
  return invoke<ProbeResult>('probe_station', {
    url,
    stationuuid: stationuuid ?? null,
  }).catch(() => ({ ok: false }));
}

export function getStationHealth(uuids: string[]): Promise<Record<string, HealthEntry>> {
  if (!isTauri || uuids.length === 0) return Promise.resolve({});
  return invoke<Record<string, HealthEntry>>('get_station_health', { uuids }).catch(
    () => ({})
  );
}

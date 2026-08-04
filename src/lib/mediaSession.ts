import { invoke, addPluginListener, type PluginListener } from '@tauri-apps/api/core';

export interface MediaState {
  [key: string]: unknown;
  title?: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
  duration?: number;
  position?: number;
  playbackSpeed?: number;
  isPlaying?: boolean;
  canPrev?: boolean;
  canNext?: boolean;
  canSeek?: boolean;
}

export type MediaAction = 'play' | 'pause' | 'stop' | 'next' | 'previous' | 'seek';

export interface MediaActionEvent {
  action: MediaAction;
  seekPosition?: number;
}

export async function updateState(state: MediaState): Promise<void> {
  await invoke('plugin:media-session|update_state', state);
}

export async function updateTimeline(timeline: {
  position?: number;
  duration?: number;
  playbackSpeed?: number;
}): Promise<void> {
  await invoke('plugin:media-session|update_timeline', timeline);
}

export async function clear(): Promise<void> {
  await invoke('plugin:media-session|clear');
}

export async function initialize(): Promise<void> {
  await invoke('plugin:media-session|initialize');
}

export async function onAction(
  handler: (event: MediaActionEvent) => void
): Promise<PluginListener> {
  return addPluginListener<MediaActionEvent>('media-session', 'media_action', handler);
}

export const isTauriAndroid =
  typeof window !== 'undefined' &&
  '__TAURI_INTERNALS__' in window &&
  typeof navigator !== 'undefined' &&
  /Android/i.test(navigator.userAgent);

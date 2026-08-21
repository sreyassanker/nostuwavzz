import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../store/store';
import { audioEngine } from '../lib/audioEngine';
import StationLogo from './StationLogo';
import { Play, Pause, SkipBack, SkipForward, X, GripHorizontal, Maximize2 } from 'lucide-react';
import { startMetadataMonitor } from '../lib/metadata';

interface MiniOverlayProps {
  onPrev: () => void;
  onNext: () => void;
}

export default function MiniOverlay({ onPrev, onNext }: MiniOverlayProps) {
  const player = useStore((s) => s.player);
  const isPlaying = player.isPlaying;
  const station = player.currentStation;
  const setPlayer = useStore((s) => s.setPlayer);
  const setPlayerOpen = useStore((s) => s.setPlayerOpen);
  const open = useStore((s) => s.miniOverlayOpen);
  const setMiniOverlayOpen = useStore((s) => s.setMiniOverlayOpen);
  const nowPlaying = useStore((s) => s.nowPlaying);

  const [pos, setPos] = useState({ x: 18, y: 18 });
  const dragRef = useRef<{ dx: number; dy: number; dragging: boolean } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, dragging: true };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current?.dragging) return;
    const x = e.clientX - dragRef.current.dx;
    const y = e.clientY - dragRef.current.dy;
    const vw = window.innerWidth, vh = window.innerHeight;
    const el = cardRef.current;
    const w = el?.offsetWidth || 320, h = el?.offsetHeight || 80;
    setPos({ x: Math.max(8, Math.min(vw - w - 8, x)), y: Math.max(8, Math.min(vh - h - 8, y)) });
  }, []);

  const onPointerUp = useCallback(() => {
    if (dragRef.current) dragRef.current.dragging = false;
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMiniOverlayOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setMiniOverlayOpen]);

  if (!open) return null;
  if (!station) {
    return (
      <div ref={cardRef} className="mini-overlay" style={{ left: pos.x, top: pos.y }} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <div className="mini-overlay__empty">No station — pick one to pop out.</div>
        <button type="button" className="mini-overlay__close" onClick={() => setMiniOverlayOpen(false)} aria-label="Close mini player"><X size={14} /></button>
      </div>
    );
  }

  const handlePlayPause = () => {
    if (audioEngine.isPlaying()) { audioEngine.pause(); setPlayer({ isPlaying: false }); }
    else if (station) {
      const url = station.url_resolved || station.url;
      if (audioEngine.getActiveUrl()) void audioEngine.resume().then(() => setPlayer({ isPlaying: true }));
      else {
        void startMetadataMonitor(url, station.stationuuid);
        void audioEngine.play(url, station.stationuuid, station).then(() => setPlayer({ isPlaying: true }));
      }
    }
  };

  return (
    <div
      ref={cardRef}
      className="mini-overlay"
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label="Mini player"
      aria-modal="false"
    >
      <div className="mini-overlay__drag" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} title="Drag to move">
        <GripHorizontal size={12} strokeWidth={2} aria-hidden="true" />
      </div>

      <div className="mini-overlay__art">
        <StationLogo station={station} size={44} />
        <span className={`mini-overlay__pulse ${isPlaying ? 'is-playing' : ''}`} aria-hidden="true" />
      </div>

      <div className="mini-overlay__info">
        <div className="mini-overlay__title">{station.name}</div>
        <div className="mini-overlay__meta">
          {nowPlaying && nowPlaying.stationuuid === station.stationuuid ? (
            <span className="mini-overlay__live">♪ {nowPlaying.artist ? `${nowPlaying.artist} — ` : ''}{nowPlaying.title}</span>
          ) : (
            <span>{[station.country, station.bitrate ? `${station.bitrate}k` : null].filter(Boolean).join(' · ') || 'Live radio'}</span>
          )}
        </div>
      </div>

      <div className="mini-overlay__controls">
        <button type="button" className="mini-overlay__btn" onClick={onPrev} aria-label="Previous"><SkipBack size={14} fill="currentColor" /></button>
        <button type="button" className="mini-overlay__btn mini-overlay__btn--play" onClick={handlePlayPause} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
        </button>
        <button type="button" className="mini-overlay__btn" onClick={onNext} aria-label="Next"><SkipForward size={14} fill="currentColor" /></button>
      </div>

      <div className="mini-overlay__actions">
        <button type="button" className="mini-overlay__icon" onClick={() => setPlayerOpen(true)} title="Open full player" aria-label="Open full player">
          <Maximize2 size={14} strokeWidth={1.8} />
        </button>
        <button type="button" className="mini-overlay__icon mini-overlay__icon--close" onClick={() => setMiniOverlayOpen(false)} aria-label="Close mini player">
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

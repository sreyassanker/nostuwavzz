import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ListMusic, Sparkles } from 'lucide-react';
import type { Station } from '../types';
import { useStore } from '../store/store';
import { useFocusTrap } from '../lib/useFocusTrap';

interface StationInfoModalProps {
  station: Station | null;
  onClose: () => void;
  onPlay: (station: Station) => void;
}

export default function StationInfoModal({ station, onClose, onPlay }: StationInfoModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const cardRef = useFocusTrap(!!station);
  const addToast = useStore((s) => s.addToast);
  const queue = useStore((s) => s.queue);
  const addToQueue = useStore((s) => s.addToQueue);
  const setSelectedTag = useStore((s) => s.setSelectedTag);
  const setActiveTab = useStore((s) => s.setActiveTab);

  useEffect(() => {
    if (!station) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [station, onClose]);

  if (!station) return null;

  const rowLabel: React.CSSProperties = {
    color: 'var(--ink-mute)',
    width: 96,
    flexShrink: 0,
  };
  const rowValue: React.CSSProperties = {
    color: 'var(--ink)',
    minWidth: 0,
  };

  return createPortal(
    <div
      className="station-info"
      role="dialog"
      aria-modal="true"
      aria-label={`Station info: ${station.name}`}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="station-info__card" ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <div className="station-info__head">
          <h2 className="station-info__title">{station.name}</h2>
          <button
            ref={closeRef}
            onClick={onClose}
            className="station-info__close"
            aria-label="Close station info"
          >
            ✕
          </button>
        </div>

        <div className="station-info__body">
          {station.country && (
            <div className="station-info__row">
              <span style={rowLabel}>Country</span>
              <span style={rowValue}>{station.country}</span>
            </div>
          )}
          {station.state && (
            <div className="station-info__row">
              <span style={rowLabel}>State</span>
              <span style={rowValue}>{station.state}</span>
            </div>
          )}
          {station.language && (
            <div className="station-info__row">
              <span style={rowLabel}>Language</span>
              <span style={rowValue}>{station.language}</span>
            </div>
          )}
          <div className="station-info__row">
            <span style={rowLabel}>Codec</span>
            <span style={rowValue}>{station.codec || '?'}</span>
          </div>
          <div className="station-info__row">
            <span style={rowLabel}>Bitrate</span>
            <span style={rowValue}>{station.bitrate ? `${station.bitrate} kbps` : '?'}</span>
          </div>
          {station.tags && (
            <div className="station-info__row">
              <span style={rowLabel}>Tags</span>
              <span style={rowValue}>{station.tags}</span>
            </div>
          )}
          {station.homepage && (
            <div className="station-info__row">
              <span style={rowLabel}>Homepage</span>
              <a
                href={station.homepage}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {station.homepage}
              </a>
            </div>
          )}
          {station.votes != null && (
            <div className="station-info__row">
              <span style={rowLabel}>Votes</span>
              <span style={rowValue}>{station.votes}</span>
            </div>
          )}
        </div>

        <div className="station-info__foot">
          <button
            type="button"
            className="station-info__action"
            onClick={() => {
              const primaryTag = station.tags?.split(',')[0]?.trim();
              if (!primaryTag) {
                addToast('No tags to match');
                onClose();
                return;
              }
              setSelectedTag(primaryTag);
              setActiveTab('discover');
              onClose();
              addToast(`Showing ${primaryTag} stations`);
            }}
          >
            <Sparkles size={14} strokeWidth={1.8} aria-hidden="true" />
            Similar
          </button>
          <button
            type="button"
            className="station-info__action"
            onClick={() => {
              if (queue.some((s) => s.stationuuid === station.stationuuid)) {
                addToast('Already in queue');
              } else {
                addToQueue(station);
                addToast('Added to queue');
              }
            }}
          >
            <ListMusic size={14} strokeWidth={1.8} aria-hidden="true" />
            Queue
          </button>
          <button
            type="button"
            className="station-info__play"
            onClick={() => {
              onPlay(station);
              onClose();
            }}
          >
            Play Station
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
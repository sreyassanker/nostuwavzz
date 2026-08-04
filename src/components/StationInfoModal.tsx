import type { Station } from '../types';

interface StationInfoModalProps {
  station: Station | null;
  onClose: () => void;
  onPlay: (station: Station) => void;
}

export default function StationInfoModal({ station, onClose, onPlay }: StationInfoModalProps) {
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

  return (
    <div
      className="station-info"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="station-info__card" onClick={(e) => e.stopPropagation()}>
        <div className="station-info__head">
          <h2 className="station-info__title">{station.name}</h2>
          <button
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
    </div>
  );
}

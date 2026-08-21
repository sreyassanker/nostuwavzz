import StationLogo from './StationLogo';
import type { Station } from '../types';

interface RecentRowProps {
  stations: Station[];
  onSelect: (station: Station) => void;
}

export default function RecentRow({ stations, onSelect }: RecentRowProps) {
  if (stations.length === 0) return null;
  return (
    <div className="recent-row">
      <div className="recent-row__title">Recently played</div>
      <div className="recent-row__track">
        {stations.map((s) => (
          <button
            type="button"
            key={s.stationuuid}
            className="recent-row__item"
            onClick={() => onSelect(s)}
            title={s.name}
          >
            <StationLogo station={s} size={38} className="recent-row__logo" />
            <span className="recent-row__name">{s.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

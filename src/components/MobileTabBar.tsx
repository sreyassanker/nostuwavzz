import { Radio, Heart, Settings2, Archive } from 'lucide-react';
import { useStore, type ActiveTab } from '../store/store';

const TABS: { key: ActiveTab; label: string; icon: typeof Radio }[] = [
  { key: 'discover', label: 'Discover', icon: Radio },
  { key: 'favorites', label: 'Favorites', icon: Heart },
  { key: 'mine', label: 'Mine', icon: Archive },
  { key: 'settings', label: 'Settings', icon: Settings2 },
];

export default function MobileTabBar() {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const favoriteCount = useStore((s) => s.favoriteUuids.size);
  const myStationsCount = useStore((s) => s.myStations.length);

  return (
    <nav className="tab-bar" aria-label="Primary navigation">
      {TABS.map(({ key, label, icon: Icon }) => {
        const isActive = activeTab === key;
        let badge: React.ReactNode = null;
        if (key === 'favorites') {
          const count = favoriteCount;
          badge = count > 0 && <span className="tab-bar__badge">{count > 99 ? '99+' : count}</span>;
        } else if (key === 'mine') {
          const count = myStationsCount;
          badge = count > 0 && <span className="tab-bar__badge">{count > 99 ? '99+' : count}</span>;
        }
        return (
          <button
            key={key}
            type="button"
            className={`tab-bar__item ${isActive ? 'is-active' : ''}`}
            onClick={() => setActiveTab(key)}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="tab-bar__icon">
              <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
              {badge}
            </span>
            <span className="tab-bar__label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

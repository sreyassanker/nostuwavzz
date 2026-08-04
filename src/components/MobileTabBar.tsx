import { Radio, Globe2, Heart, Settings2 } from 'lucide-react';
import { useStore, type ActiveTab } from '../store/store';

const TABS: { key: ActiveTab; label: string; icon: typeof Radio }[] = [
  { key: 'discover', label: 'Discover', icon: Radio },
  { key: 'globe', label: 'Globe', icon: Globe2 },
  { key: 'favorites', label: 'Favorites', icon: Heart },
  { key: 'settings', label: 'Settings', icon: Settings2 },
];

export default function MobileTabBar() {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const favoriteCount = useStore((s) => s.favoriteUuids.size);

  return (
    <nav className="tab-bar" aria-label="Primary navigation">
      {TABS.map(({ key, label, icon: Icon }) => {
        const isActive = activeTab === key;
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
              {key === 'favorites' && favoriteCount > 0 && (
                <span className="tab-bar__badge">{favoriteCount > 99 ? '99+' : favoriteCount}</span>
              )}
            </span>
            <span className="tab-bar__label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

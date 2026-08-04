import { useCallback } from 'react';
import { Globe2, Moon, Monitor, Palette, Sun, Trash2, WifiOff, Play } from 'lucide-react';
import { useStore, type ThemeMode } from '../store/store';
import { clearStations } from '../lib/stationCache';
import { clearCache as clearImageCache } from '../lib/imageCache';
import { useSleepTimer } from '../lib/useSleepTimer';

const THEMES: { key: ThemeMode; label: string; icon: typeof Sun }[] = [
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'system', label: 'System', icon: Monitor },
];

const SLEEP_OPTIONS = [15, 30, 60, 90];

export default function SettingsView() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const dataSaver = useStore((s) => s.dataSaver);
  const setDataSaver = useStore((s) => s.setDataSaver);
  const showUnverified = useStore((s) => s.showUnverified);
  const setShowUnverified = useStore((s) => s.setShowUnverified);
  const sleepTimerMinutes = useStore((s) => s.sleepTimerMinutes);
  const addToast = useStore((s) => s.addToast);
  const setAllStations = useStore((s) => s.setAllStations);
  const setCurrentStations = useStore((s) => s.setCurrentStations);
  const setTotalStationCount = useStore((s) => s.setTotalStationCount);
  const { handleSleep } = useSleepTimer();

  const handleClearStations = useCallback(async () => {
    await clearStations();
    setAllStations([]);
    setCurrentStations([]);
    setTotalStationCount(0);
    addToast('Station cache cleared. Press sync to reload.', 'info');
  }, [setAllStations, setCurrentStations, setTotalStationCount, addToast]);

  const handleClearImages = useCallback(async () => {
    await clearImageCache();
    addToast('Image cache cleared', 'info');
  }, [addToast]);

  return (
    <div className="settings">
      <div className="settings__header">
        <h2 className="grid-title">Settings</h2>
      </div>

      <section className="settings__section">
        <h3 className="settings__label">
          <Palette size={15} strokeWidth={1.8} aria-hidden="true" /> Theme
        </h3>
        <div className="settings__segmented" role="group" aria-label="Theme">
          {THEMES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`settings__segment ${theme === key ? 'is-active' : ''}`}
              onClick={() => setTheme(key)}
              aria-pressed={theme === key}
            >
              <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings__section">
        <h3 className="settings__label">
          <Globe2 size={15} strokeWidth={1.8} aria-hidden="true" /> Station directory
        </h3>
        <button
          type="button"
          className={`settings__toggle ${showUnverified ? 'is-on' : ''}`}
          onClick={() => setShowUnverified(!showUnverified)}
          role="switch"
          aria-checked={showUnverified}
        >
          <span className="settings__toggle-text">Show unverified stations</span>
          <span className="settings__switch" />
        </button>
        <p className="settings__hint">Includes stations that may be offline or unreliable.</p>

        <button type="button" className="settings__danger" onClick={handleClearStations}>
          <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
          Clear station cache
        </button>
        <button type="button" className="settings__danger" onClick={handleClearImages}>
          <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
          Clear image cache
        </button>
      </section>

      <section className="settings__section">
        <h3 className="settings__label">
          <WifiOff size={15} strokeWidth={1.8} aria-hidden="true" /> Data
        </h3>
        <button
          type="button"
          className={`settings__toggle ${dataSaver ? 'is-on' : ''}`}
          onClick={() => setDataSaver(!dataSaver)}
          role="switch"
          aria-checked={dataSaver}
        >
          <span className="settings__toggle-text">Data saver mode</span>
          <span className="settings__switch" />
        </button>
        <p className="settings__hint">Skips station logo downloads to reduce mobile data.</p>
      </section>

      <section className="settings__section">
        <h3 className="settings__label">
          <Play size={15} strokeWidth={1.8} aria-hidden="true" /> Sleep timer default
        </h3>
        <div className="settings__chips">
          {SLEEP_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              className={`chip ${sleepTimerMinutes === m ? 'is-active' : ''}`}
              onClick={() => handleSleep(m)}
            >
              {m} min
            </button>
          ))}
          <button
            type="button"
            className={`chip ${sleepTimerMinutes === 0 ? 'is-active' : ''}`}
            onClick={() => handleSleep(0)}
          >
            Off
          </button>
        </div>
      </section>

      <section className="settings__section settings__section--about">
        <h3 className="settings__label">About</h3>
        <p className="settings__hint">
          Nostu Wavzz — rediscover the magic of radio. 50,000+ live stations, no ads, no tracking.
        </p>
        <p className="settings__hint">
          Station metadata © <a href="https://www.radio-browser.info" target="_blank" rel="noopener noreferrer" className="settings__link">radio-browser.info</a>.
        </p>
      </section>
    </div>
  );
}

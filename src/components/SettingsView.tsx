import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Moon, Monitor, Palette, Play, Search, Sun, Trash2, WifiOff, Plus, Download, Upload, Archive, X } from 'lucide-react';
import { useStore, type Density, type ThemeMode } from '../store/store';
import { clearStations } from '../lib/stationCache';
import { clearCache as clearImageCache } from '../lib/imageCache';
import { useSleepTimer } from '../lib/useSleepTimer';
import type { Station as StationType } from '../types';

const THEMES: { key: ThemeMode; label: string; icon: typeof Sun }[] = [
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'system', label: 'System', icon: Monitor },
];

const DENSITIES: { key: Density; label: string }[] = [
  { key: 'compact', label: 'Compact' },
  { key: 'normal', label: 'Normal' },
  { key: 'cozy', label: 'Cozy' },
];

const SLEEP_OPTIONS = [15, 30, 60, 90];

interface SettingRow {
  title: string;
  hint?: ReactNode;
  keyword?: string;
  stack?: boolean;
  control?: ReactNode;
}

interface SettingGroup {
  label: string;
  icon?: ReactNode;
  keyword?: string;
  rows: SettingRow[];
}

function SwitchControl({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`settings__switch-btn ${checked ? 'is-on' : ''}`}
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <span className="settings__switch" />
    </button>
  );
}

export default function SettingsView() {
  const [query, setQuery] = useState('');
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const dynamicAccent = useStore((s) => s.dynamicAccent);
  const setDynamicAccent = useStore((s) => s.setDynamicAccent);
  const pureBlack = useStore((s) => s.pureBlack);
  const setPureBlack = useStore((s) => s.setPureBlack);
  const density = useStore((s) => s.density);
  const setDensity = useStore((s) => s.setDensity);
  const dataSaver = useStore((s) => s.dataSaver);
  const setDataSaver = useStore((s) => s.setDataSaver);
  const showUnverified = useStore((s) => s.showUnverified);
  const setShowUnverified = useStore((s) => s.setShowUnverified);
  const sleepTimerMinutes = useStore((s) => s.sleepTimerMinutes);
  const crossfade = useStore((s) => s.crossfade);
  const setCrossfade = useStore((s) => s.setCrossfade);
  const crossfadeDuration = useStore((s) => s.crossfadeDuration);
  const setCrossfadeDuration = useStore((s) => s.setCrossfadeDuration);
  const addToast = useStore((s) => s.addToast);
  const setAllStations = useStore((s) => s.setAllStations);
  const setCurrentStations = useStore((s) => s.setCurrentStations);
  const setTotalStationCount = useStore((s) => s.setTotalStationCount);
  const myStations = useStore((s) => s.myStations);
  const addMyStation = useStore((s) => s.addMyStation);
  const removeMyStation = useStore((s) => s.removeMyStation);
  const importData = useStore((s) => s.importData);
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

  const [myStationName, setMyStationName] = useState('');
  const [myStationUrl, setMyStationUrl] = useState('');
  const [myStationTags, setMyStationTags] = useState('');
  const [myStationCountry, setMyStationCountry] = useState('');

  const handleAddMyStation = useCallback(() => {
    if (!myStationName.trim() || !myStationUrl.trim()) {
      addToast('Name and URL required', 'error');
      return;
    }
    try {
      new URL(myStationUrl.trim());
    } catch {
      addToast('Invalid URL', 'error');
      return;
    }
    const station: StationType = {
      stationuuid: crypto.randomUUID(),
      name: myStationName.trim(),
      url: myStationUrl.trim(),
      url_resolved: myStationUrl.trim(),
      tags: myStationTags.trim() || undefined,
      country: myStationCountry.trim() || undefined,
      countrycode: myStationCountry.trim().toUpperCase() || undefined,
      codec: 'MP3',
      bitrate: 128,
    };
    addMyStation(station);
    setMyStationName('');
    setMyStationUrl('');
    setMyStationTags('');
    setMyStationCountry('');
    addToast(`Added "${station.name}" to My Stations`);
  }, [myStationName, myStationUrl, myStationTags, myStationCountry, addMyStation, addToast]);

  const handleRemoveMyStation = useCallback(
    (uuid: string) => {
      removeMyStation(uuid);
      addToast('Removed from My Stations');
    },
    [removeMyStation, addToast]
  );

  const handleExport = useCallback(() => {
    const state = useStore.getState();
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      favorites: Array.from(state.favoriteUuids),
      recentlyPlayed: state.recentlyPlayed,
      myStations: state.myStations,
      playStats: state.playStats,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nostu-wavzz-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Data exported');
  }, [addToast]);

  const handleImport = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          if (data && typeof data === 'object') {
            importData(data);
            addToast('Data imported');
          } else {
            addToast('Invalid file format', 'error');
          }
        } catch {
          addToast('Failed to parse file', 'error');
        }
      };
      reader.readAsText(file);
    },
    [importData, addToast]
  );

  const groups = useMemo<SettingGroup[]>(
    () => [
      {
        label: 'Appearance',
        icon: <Palette size={14} strokeWidth={1.8} aria-hidden="true" />,
        keyword: 'theme color',
        rows: [
          {
            title: 'Theme',
            hint: 'Light, dark, or follow the system.',
            keyword: 'dark light mode',
            stack: true,
            control: (
              <div className="settings__segmented" role="group" aria-label="Theme">
                {THEMES.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    className={`settings__segment ${theme === key ? 'is-active' : ''}`}
                    onClick={() => setTheme(key)}
                    aria-pressed={theme === key}
                  >
                    <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            ),
          },
          {
            title: 'Density',
            hint: 'Compact, normal, or cozy spacing.',
            keyword: 'size spacing compact cozy',
            stack: true,
            control: (
              <div className="settings__segmented" role="group" aria-label="Density">
                {DENSITIES.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    className={`settings__segment ${density === key ? 'is-active' : ''}`}
                    onClick={() => setDensity(key)}
                    aria-pressed={density === key}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ),
          },
          {
            title: 'Dynamic accent from station art',
            hint: "Colors the app with the current station's artwork.",
            keyword: 'accent color artwork logo',
            control: (
              <SwitchControl
                checked={dynamicAccent}
                onChange={() => setDynamicAccent(!dynamicAccent)}
                label="Dynamic accent from station art"
              />
            ),
          },
          {
            title: 'Pure black (AMOLED)',
            hint: 'Deep black backgrounds in dark mode.',
            keyword: 'oled black dark',
            control: (
              <SwitchControl
                checked={pureBlack}
                onChange={() => setPureBlack(!pureBlack)}
                label="Pure black (AMOLED)"
              />
            ),
          },
        ],
      },
      {
        label: 'Station directory',
        icon: <Download size={14} strokeWidth={1.8} aria-hidden="true" />,
        keyword: 'cache sync',
        rows: [
          {
            title: 'Show unverified stations',
            hint: 'Includes stations that may be offline or unreliable.',
            keyword: 'verified offline reliable',
            control: (
              <SwitchControl
                checked={showUnverified}
                onChange={() => setShowUnverified(!showUnverified)}
                label="Show unverified stations"
              />
            ),
          },
          {
            title: 'Clear station cache',
            hint: 'Removes the saved station list. Sync to reload.',
            keyword: 'reset list delete',
            control: (
              <button type="button" className="settings__danger" onClick={handleClearStations}>
                <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />
                Clear
              </button>
            ),
          },
          {
            title: 'Clear image cache',
            hint: 'Frees storage used by station logos.',
            keyword: 'photos storage delete',
            control: (
              <button type="button" className="settings__danger" onClick={handleClearImages}>
                <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />
                Clear
              </button>
            ),
          },
        ],
      },
      {
        label: 'Data',
        icon: <WifiOff size={14} strokeWidth={1.8} aria-hidden="true" />,
        keyword: 'network mobile',
        rows: [
          {
            title: 'Data saver mode',
            hint: 'Skips station logo downloads to reduce mobile data.',
            keyword: 'save data logos',
            control: (
              <SwitchControl
                checked={dataSaver}
                onChange={() => setDataSaver(!dataSaver)}
                label="Data saver mode"
              />
            ),
          },
        ],
      },
      {
        label: 'Playback',
        icon: <Play size={14} strokeWidth={1.8} aria-hidden="true" />,
        keyword: 'sleep timer',
        rows: [
          {
            title: 'Crossfade between stations',
            hint: 'Fades the current station into the next when switching.',
            keyword: 'fade transition blend gapless',
            control: (
              <SwitchControl
                checked={crossfade}
                onChange={() => setCrossfade(!crossfade)}
                label="Crossfade between stations"
              />
            ),
          },
          {
            title: 'Crossfade duration',
            hint: 'How long the fade takes when switching stations.',
            keyword: 'fade length seconds',
            stack: true,
            control: (
              <div className="settings__slider-row">
                <input
                  type="range"
                  className="settings__slider"
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={crossfadeDuration}
                  disabled={!crossfade}
                  onChange={(e) => setCrossfadeDuration(parseFloat(e.target.value))}
                  aria-label="Crossfade duration"
                />
                <span className="settings__slider-value">{crossfadeDuration.toFixed(1)}s</span>
              </div>
            ),
          },
          {
            title: 'Sleep timer default',
            hint: 'Fades playback out and stops after the chosen time.',
            keyword: 'sleep fade stop timer',
            stack: true,
            control: (
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
            ),
          },
        ],
      },
      {
        label: 'My Stations',
        icon: <Archive size={14} strokeWidth={1.8} aria-hidden="true" />,
        keyword: 'custom personal stations',
        rows: [
          {
            title: 'Add station',
            hint: 'Name and stream URL required. Tags and country optional.',
            keyword: 'add custom station',
            stack: true,
            control: (
              <div className="settings__my-station-form">
                <input
                  type="text"
                  className="settings__input"
                  placeholder="Station name"
                  value={myStationName}
                  onChange={(e) => setMyStationName(e.target.value)}
                  aria-label="Station name"
                />
                <input
                  type="url"
                  className="settings__input"
                  placeholder="Stream URL (e.g. https://stream.example.com/live.mp3)"
                  value={myStationUrl}
                  onChange={(e) => setMyStationUrl(e.target.value)}
                  aria-label="Stream URL"
                />
                <input
                  type="text"
                  className="settings__input"
                  placeholder="Tags (comma separated, e.g. rock, news)"
                  value={myStationTags}
                  onChange={(e) => setMyStationTags(e.target.value)}
                  aria-label="Tags"
                />
                <input
                  type="text"
                  className="settings__input"
                  placeholder="Country (e.g. United States)"
                  value={myStationCountry}
                  onChange={(e) => setMyStationCountry(e.target.value)}
                  aria-label="Country"
                />
                <button type="button" className="btn-primary" onClick={handleAddMyStation}>
                  <Plus size={13} strokeWidth={1.8} aria-hidden="true" />
                  Add
                </button>
              </div>
            ),
          },
          ...(myStations.length > 0
            ? myStations.map((s) => ({
                key: s.stationuuid,
                title: s.name,
                hint: `${s.country ?? ''} ${s.tags ?? ''}`,
                keyword: s.name,
                stack: true,
                control: (
                  <button
                    type="button"
                    className="settings__danger settings__danger--sm"
                    onClick={() => handleRemoveMyStation(s.stationuuid)}
                  >
                    <X size={12} strokeWidth={2} aria-hidden="true" />
                    Remove
                  </button>
                ),
              }))
            : []),
        ],
      },
      {
        label: 'Backup & Restore',
        icon: <Upload size={14} strokeWidth={1.8} aria-hidden="true" />,
        keyword: 'import export backup data',
        rows: [
          {
            title: 'Export data',
            hint: 'Downloads favorites, My Stations, recent, and play stats as JSON.',
            keyword: 'export backup download',
            stack: true,
            control: (
              <button type="button" className="btn-primary" onClick={handleExport}>
                <Download size={13} strokeWidth={1.8} aria-hidden="true" />
                Export
              </button>
            ),
          },
          {
            title: 'Import data',
            hint: 'Select a JSON file from a previous export.',
            keyword: 'import restore backup',
            stack: true,
            control: (
              <input
                type="file"
                className="settings__file-input"
                accept="application/json"
                onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
                aria-label="Import data"
              />
            ),
          },
        ],
      },
      {
        label: 'About',
        keyword: 'info version',
        rows: [
          {
            title: 'Nostu Wavzz',
            hint: (
              <>
                Rediscover the magic of radio. 50,000+ live stations, no ads, no tracking.
                Station metadata ©{' '}
                <a
                  href="https://www.radio-browser.info"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="settings__link"
                >
                  radio-browser.info
                </a>
                .
              </>
            ),
          },
        ],
      },
    ],
    [
      theme,
      setTheme,
      density,
      setDensity,
      dynamicAccent,
      setDynamicAccent,
      pureBlack,
      setPureBlack,
      showUnverified,
      setShowUnverified,
      dataSaver,
      setDataSaver,
      sleepTimerMinutes,
      handleSleep,
      handleClearStations,
      handleClearImages,
      crossfade,
      setCrossfade,
      crossfadeDuration,
      setCrossfadeDuration,
      myStations,
      addMyStation,
      removeMyStation,
      myStationName,
      myStationUrl,
      myStationTags,
      myStationCountry,
      handleAddMyStation,
      handleRemoveMyStation,
      handleExport,
      handleImport,
      importData,
      addToast,
    ]
  );

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!q) return groups;
    return groups
      .map((g) => {
        const groupMatch = `${g.label} ${g.keyword ?? ''}`.toLowerCase().includes(q);
        return {
          ...g,
          rows: groupMatch
            ? g.rows
            : g.rows.filter((r) => `${r.title} ${r.keyword ?? ''}`.toLowerCase().includes(q)),
        };
      })
      .filter((g) => g.rows.length > 0);
  }, [groups, q]);

  return (
    <div className="settings">
      <div className="settings__header">
        <h2 className="grid-title">Settings</h2>
      </div>

      <div className="settings__search">
        <Search size={16} strokeWidth={1.8} className="settings__search-icon" aria-hidden="true" />
        <input
          type="search"
          className="settings__search-input"
          placeholder="Search settings"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search settings"
        />
        {query && (
          <button type="button" className="settings__search-clear" onClick={() => setQuery('')}>
            Clear
          </button>
        )}
      </div>

      {visible.length === 0 && <p className="settings__no-results">No settings match &quot;{query}&quot;.</p>}

      {visible.map((g) => (
        <section key={g.label} className="settings__group">
          <h3 className="settings__group-head">
            {g.icon}
            {g.label}
          </h3>
          {g.rows.map((r) => (
            <div key={r.title} className={`settings__row ${r.stack ? 'settings__row--stack' : ''}`}>
              <div className="settings__row-text">
                <span className="settings__row-title">{r.title}</span>
                {r.hint && <span className="settings__row-hint">{r.hint}</span>}
              </div>
              {r.control && (r.stack ? <div className="settings__row-stack">{r.control}</div> : r.control)}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

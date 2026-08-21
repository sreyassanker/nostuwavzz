import { useMemo } from 'react';
import { useStore } from '../store/store';
import { Trash2, Clock, Play, Globe, TrendingUp, Trophy, Radio } from 'lucide-react';
import StationLogo from './StationLogo';
import type { Station } from '../types';

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function StatsDashboard({ onPlayStation }: { onPlayStation?: (s: Station) => void }) {
  const playStats = useStore((s) => s.playStats);
  const allStations = useStore((s) => s.allStations);
  const resetPlayStats = useStore((s) => s.resetPlayStats);
  const addToast = useStore((s) => s.addToast);

  const entries = useMemo(() => Object.entries(playStats), [playStats]);

  const totalPlays = useMemo(() => entries.reduce((a, [, v]) => a + v.plays, 0), [entries]);
  const totalSeconds = useMemo(() => entries.reduce((a, [, v]) => a + v.seconds, 0), [entries]);
  const unique = entries.length;

  const topByPlays = useMemo(() => [...entries].sort((a, b) => b[1].plays - a[1].plays).slice(0, 8), [entries]);
  const topByTime = useMemo(() => [...entries].sort((a, b) => b[1].seconds - a[1].seconds).slice(0, 8), [entries]);
  const recent = useMemo(() => [...entries].sort((a, b) => b[1].lastPlayed - a[1].lastPlayed).slice(0, 6), [entries]);

  const byCountry = useMemo(() => {
    const map: Record<string, { plays: number; seconds: number; name: string }> = {};
    for (const [, v] of entries) {
      const key = v.country?.trim() || 'Unknown';
      const cur = map[key] ?? (map[key] = { plays: 0, seconds: 0, name: key });
      cur.plays += v.plays;
      cur.seconds += v.seconds;
    }
    return Object.values(map).sort((a, b) => b.plays - a.plays).slice(0, 6);
  }, [entries]);

  // Find Station objects for top entries to enable Play
  const stationMap = useMemo(() => {
    const m = new Map<string, Station>();
    for (const s of allStations) m.set(s.stationuuid, s);
    return m;
  }, [allStations]);

  const maxPlays = topByPlays[0]?.[1].plays || 1;
  const maxTime = topByTime[0]?.[1].seconds || 1;
  const maxCountryPlays = byCountry[0]?.plays || 1;

  if (entries.length === 0) {
    return (
      <div className="stats stats--empty">
        <div className="stats-empty__icon"><Radio size={32} strokeWidth={1.5} aria-hidden="true" /></div>
        <div className="stats-empty__title">No listening data yet</div>
        <div className="stats-empty__copy">Play any station — your Wrapped-style stats will appear here. Plays, time, top countries and streaks are tracked locally.</div>
      </div>
    );
  }

  return (
    <div className="stats">
      {/* Hero */}
      <div className="stats-hero">
        <div className="stats-hero__left">
          <div className="stats-hero__eyebrow"><TrendingUp size={12} strokeWidth={2} aria-hidden="true" /> Your listening</div>
          <div className="stats-hero__title">Wrapped</div>
          <div className="stats-hero__sub">Spotify-style insights — 100% local, no tracking.</div>
        </div>
        <div className="stats-hero__art" aria-hidden="true">
          <span className="stats-hero__orb stats-hero__orb--1" />
          <span className="stats-hero__orb stats-hero__orb--2" />
          <span className="stats-hero__orb stats-hero__orb--3" />
        </div>
      </div>

      {/* KPI */}
      <div className="stats-kpis">
        <div className="stats-kpi">
          <span className="stats-kpi__icon"><Play size={14} fill="currentColor" aria-hidden="true" /></span>
          <span className="stats-kpi__value">{totalPlays.toLocaleString()}</span>
          <span className="stats-kpi__label">plays</span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi__icon"><Clock size={14} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className="stats-kpi__value">{formatSeconds(totalSeconds)}</span>
          <span className="stats-kpi__label">listened</span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi__icon"><Globe size={14} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className="stats-kpi__value">{unique}</span>
          <span className="stats-kpi__label">stations</span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi__icon"><Trophy size={14} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className="stats-kpi__value">{byCountry.length}</span>
          <span className="stats-kpi__label">countries</span>
        </div>
      </div>

      {/* Top by plays */}
      <section className="stats-section">
        <h3 className="stats-section__title"><Trophy size={14} strokeWidth={2} aria-hidden="true" /> Top stations — by plays</h3>
        <div className="stats-list">
          {topByPlays.map(([uuid, v]) => {
            const st = stationMap.get(uuid);
            return (
              <div key={uuid} className="stats-row" onClick={() => st && onPlayStation?.(st)} role={st ? 'button' : undefined} tabIndex={st ? 0 : undefined}>
                <div className="stats-row__art">
                  {st ? <StationLogo station={st} size={36} /> : <span className="stats-row__fallback">{(v.name || '?')[0]}</span>}
                </div>
                <div className="stats-row__main">
                  <div className="stats-row__name">{v.name}</div>
                  <div className="stats-row__meta">{v.country || 'Unknown'} · {formatDate(v.lastPlayed)}</div>
                  <div className="stats-bar"><span className="stats-bar__fill" style={{ width: `${Math.max(6, (v.plays / maxPlays) * 100)}%` }} /></div>
                </div>
                <div className="stats-row__side">
                  <span className="stats-row__value">{v.plays}</span>
                  <span className="stats-row__unit">plays</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Top by time */}
      <section className="stats-section">
        <h3 className="stats-section__title"><Clock size={14} strokeWidth={1.8} aria-hidden="true" /> Top stations — by time</h3>
        <div className="stats-list">
          {topByTime.map(([uuid, v]) => {
            const st = stationMap.get(uuid);
            return (
              <div key={uuid} className="stats-row" onClick={() => st && onPlayStation?.(st)} role={st ? 'button' : undefined}>
                <div className="stats-row__art">
                  {st ? <StationLogo station={st} size={36} /> : <span className="stats-row__fallback">{(v.name || '?')[0]}</span>}
                </div>
                <div className="stats-row__main">
                  <div className="stats-row__name">{v.name}</div>
                  <div className="stats-row__meta">{v.country || 'Unknown'}</div>
                  <div className="stats-bar stats-bar--time"><span className="stats-bar__fill" style={{ width: `${Math.max(6, (v.seconds / maxTime) * 100)}%` }} /></div>
                </div>
                <div className="stats-row__side">
                  <span className="stats-row__value">{formatSeconds(v.seconds)}</span>
                  <span className="stats-row__unit">listened</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* By country */}
      <section className="stats-section">
        <h3 className="stats-section__title"><Globe size={14} strokeWidth={1.8} aria-hidden="true" /> Top countries</h3>
        <div className="stats-countries">
          {byCountry.map((c) => (
            <div key={c.name} className="stats-country">
              <span className="stats-country__name">{c.name}</span>
              <span className="stats-country__bar"><span className="stats-country__fill" style={{ width: `${(c.plays / maxCountryPlays) * 100}%` }} /></span>
              <span className="stats-country__val">{c.plays} plays · {formatSeconds(c.seconds)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Recently played */}
      <section className="stats-section">
        <h3 className="stats-section__title"><Clock size={14} strokeWidth={1.8} aria-hidden="true" /> Recently played</h3>
        <div className="stats-recent">
          {recent.map(([uuid, v]) => (
            <span key={uuid} className="stats-recent__pill">{v.name} <em>{formatDate(v.lastPlayed)}</em></span>
          ))}
        </div>
      </section>

      <div className="stats-actions">
        <button
          type="button"
          className="stats-reset"
          onClick={() => {
            if (!confirm('Reset all listening stats? This cannot be undone.')) return;
            resetPlayStats();
            addToast('Listening stats reset');
          }}
        >
          <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" /> Reset stats
        </button>
      </div>
    </div>
  );
}

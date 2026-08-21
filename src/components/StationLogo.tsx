import { useEffect, useState } from 'react';
import { getFaviconWithCache } from '../lib/imageCache';
import { useStore } from '../store/store';
import { countryCodeToFlag } from '../lib/utils';
import type { Station } from '../types';

interface StationLogoProps {
  station: Station;
  size?: number;
  className?: string;
}

export default function StationLogo({ station, size = 40, className }: StationLogoProps) {
  const dataSaver = useStore((s) => s.dataSaver);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const url = station.favicon;

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setSrc(null);
    if (!url || dataSaver) return;
    getFaviconWithCache(url)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setFailed(true);
          return;
        }
        setSrc(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url, dataSaver]);

  const flag = countryCodeToFlag(station.countrycode || '') || '📻';

  if (!src || failed) {
    return <span className={className}>{flag}</span>;
  }

  return (
    <img
      src={src}
      alt={station.name}
      loading="lazy"
      decoding="async"
      className={className}
      style={{ objectFit: 'cover', borderRadius: 8, width: size, height: size, flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
  );
}

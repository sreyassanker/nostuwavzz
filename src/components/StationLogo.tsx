import { memo, useEffect, useRef, useState } from 'react';
import { getFaviconWithCache } from '../lib/imageCache';
import { useStore } from '../store/store';
import { countryCodeToFlag } from '../lib/utils';
import type { Station } from '../types';

interface StationLogoProps {
  station: Station;
  size?: number;
  className?: string;
  /** Delay image fetch by this many ms (use to avoid jank during animations) */
  deferMs?: number;
}

/**
 * Debounced favicon loader.
 * Waits 80ms before fetching so rapid parent re-renders
 * (e.g. play/pause toggles) don't trigger duplicate network requests.
 */
export default memo(function StationLogo({ station, size = 40, className, deferMs = 0 }: StationLogoProps) {
  const dataSaver = useStore((s) => s.dataSaver);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const url = station.favicon;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  useEffect(() => {
    // Clear any pending fetch from previous render
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setFailed(false);
    setSrc(null);
    setImgLoaded(false);
    if (!url || dataSaver) return;

    // Debounce: wait 80ms (or deferMs) before kicking off the fetch
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      getFaviconWithCache(url)
        .then((result) => {
          // Guard against stale closure — only update if URL hasn't changed
          if (urlRef.current !== url) return;
          if (!result) {
            setFailed(true);
            return;
          }
          setSrc(result);
        })
        .catch(() => {
          if (urlRef.current === url) setFailed(true);
        });
    }, Math.max(80, deferMs));

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
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
      className={`${className} ${imgLoaded ? 'station-logo--loaded' : 'station-logo--loading'}`}
      style={{ objectFit: 'cover', borderRadius: 8, width: size, height: size, flexShrink: 0 }}
      onLoad={() => setImgLoaded(true)}
      onError={() => setFailed(true)}
    />
  );
});

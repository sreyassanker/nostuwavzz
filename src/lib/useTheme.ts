import { useEffect } from 'react';
import { useStore } from '../store/store';
import { useMediaQuery } from './useMediaQuery';

export function useTheme() {
  const theme = useStore((s) => s.theme);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');

  useEffect(() => {
    const dark = theme === 'dark' || (theme === 'system' && systemDark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', dark ? '#0f0f0d' : '#e8e6dc');
    }
  }, [theme, systemDark]);
}

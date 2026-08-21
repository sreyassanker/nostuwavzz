import { useEffect } from 'react';
import { useStore } from '../store/store';
import { useMediaQuery } from './useMediaQuery';
import { applyAccentVars } from './colorExtract';

export function useTheme() {
  const theme = useStore((s) => s.theme);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const accentColor = useStore((s) => s.accentColor);
  const pureBlack = useStore((s) => s.pureBlack);
  const density = useStore((s) => s.density);

  useEffect(() => {
    const dark = theme === 'dark' || (theme === 'system' && systemDark);
    const el = document.documentElement;
    el.setAttribute('data-theme', dark ? 'dark' : 'light');
    el.classList.toggle('pure-black', pureBlack);
    el.setAttribute('data-density', density);
    applyAccentVars(accentColor);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', dark ? '#0f0f0d' : '#e8e6dc');
    }
  }, [theme, systemDark, accentColor, pureBlack, density]);
}

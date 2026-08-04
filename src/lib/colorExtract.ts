export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(255, 77, 109, ${alpha})`;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${m[1]}${a}`;
}

function normalize(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? `#${m[1].toLowerCase()}` : '#ff4d6d';
}

export function extractDominantColor(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        const buckets = new Map<string, number>();
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 128) continue;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          if (sat < 0.2) continue;
          if (max < 50) continue;
          if (min > 220) continue;
          const key = `${r >> 4},${g >> 4},${b >> 4}`;
          buckets.set(key, (buckets.get(key) || 0) + 1 + sat * 3);
        }

        let bestKey: string | null = null;
        let bestScore = 0;
        for (const [key, score] of buckets) {
          if (score > bestScore) {
            bestScore = score;
            bestKey = key;
          }
        }
        if (!bestKey) {
          resolve(null);
          return;
        }
        const [r, g, b] = bestKey.split(',').map((v) => Number(v) * 17);
        const hex = `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
        resolve(hex);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function applyAccentVars(accent: string): void {
  const el = document.documentElement;
  const normalized = normalize(accent);
  el.style.setProperty('--accent', normalized);
  el.style.setProperty('--accent-soft', hexWithAlpha(normalized, 0.25));
  el.style.setProperty('--accent-ring', hexWithAlpha(normalized, 0.2));
  el.style.setProperty('--accent-strong', hexWithAlpha(normalized, 0.8));
  el.style.setProperty('--accent-glow', hexWithAlpha(normalized, 0.12));
}

export function resetAccentVars(): void {
  applyAccentVars('#ff4d6d');
}

import { useEffect, useRef } from 'react';
import { audioEngine } from '../lib/audioEngine';
import { useStore } from '../store/store';

export default function AudioVisualizer({ height = 48 }: { height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPlaying = useStore((s) => s.player.isPlaying);
  const visualizerEnabled = useStore((s) => s.visualizerEnabled);
  const accentColor = useStore((s) => s.accentColor);

  useEffect(() => {
    if (!visualizerEnabled || !isPlaying) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let analyser = audioEngine.getAnalyser();
    const fallbackData = new Uint8Array(32);
    const bufferLen = analyser ? analyser.frequencyBinCount : 128;
    const data = new Uint8Array(bufferLen);

    const dpr = window.devicePixelRatio || 1;

    function resize() {
      const c = canvasRef.current;
      if (!c || !ctx) return;
      const rect = c.getBoundingClientRect();
      c.width = rect.width * dpr;
      c.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function draw() {
      raf = requestAnimationFrame(draw);
      const an = audioEngine.getAnalyser();
      let useFallback = false;
      if (an) {
        analyser = an;
        an.getByteFrequencyData(data);
      } else {
        useFallback = true;
        // generate soft pseudo-random spectrum
        const t = Date.now() / 250;
        for (let i = 0; i < fallbackData.length; i++) {
          fallbackData[i] = 48 + Math.sin(t + i * 0.7) * 28 + Math.random() * 18;
        }
      }

      const c = canvasRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx!.clearRect(0, 0, w, h);

      const bars = 32;
      const step = Math.floor(bufferLen / bars);
      const barW = (w / bars) * 0.62;
      const gap = (w / bars) * 0.38;
      const cx = w / 2;

      for (let i = 0; i < bars; i++) {
        let avg: number;
        if (useFallback) {
          avg = (fallbackData[i % fallbackData.length] || 0) / 255;
        } else {
          let sum = 0;
          for (let j = 0; j < step; j++) sum += data[i * step + j] || 0;
          avg = sum / step / 255;
        }
        const eased = Math.pow(avg, 0.75);
        const barH = Math.max(2, eased * (h - 4));
        const x = i * (barW + gap);
        const y = (h - barH) / 2;

        // Color: accent with opacity falloff from center
        const dist = Math.abs(i - bars / 2) / (bars / 2);
        const alpha = 0.9 - dist * 0.35;
        ctx!.fillStyle = accentColor;
        ctx!.globalAlpha = Math.max(0.35, alpha * (0.55 + eased * 0.45));

        // Rounded bars
        const r = Math.min(4, barW / 2);
        ctx!.beginPath();
        // @ts-ignore roundRect may not be in older lib
        if (ctx!.roundRect) ctx!.roundRect(x, y, barW, barH, r);
        else {
          ctx!.moveTo(x + r, y);
          ctx!.lineTo(x + barW - r, y);
          ctx!.quadraticCurveTo(x + barW, y, x + barW, y + r);
          ctx!.lineTo(x + barW, y + barH - r);
          ctx!.quadraticCurveTo(x + barW, y + barH, x + barW - r, y + barH);
          ctx!.lineTo(x + r, y + barH);
          ctx!.quadraticCurveTo(x, y + barH, x, y + barH - r);
          ctx!.lineTo(x, y + r);
          ctx!.quadraticCurveTo(x, y, x + r, y);
        }
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;

      // Subtle center glow when accent is vibrant
      ctx!.fillStyle = accentColor;
      ctx!.globalAlpha = 0.08;
      ctx!.beginPath();
      ctx!.ellipse(cx, h / 2, w * 0.22, h * 0.9, 0, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.globalAlpha = 1;
    }
    draw();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [isPlaying, visualizerEnabled, accentColor]);

  if (!visualizerEnabled) return null;
  if (!isPlaying) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-mute)', fontSize: 11 }}>Visualizer paused</div>;

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height, display: 'block', borderRadius: 10 }}
      aria-hidden="true"
    />
  );
}

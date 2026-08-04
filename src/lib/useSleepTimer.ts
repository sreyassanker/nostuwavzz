import { useCallback, useRef, useEffect } from 'react';
import { useStore } from '../store/store';
import { audioEngine } from './audioEngine';

export function useSleepTimer() {
  const setSleepTimer = useStore((s) => s.setSleepTimer);
  const setPlayer = useStore((s) => s.setPlayer);
  const addToast = useStore((s) => s.addToast);
  const sleepRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finishSleep = useCallback(async () => {
    if (audioEngine.isPlaying()) {
      await audioEngine.fadeOut(4000);
    }
    audioEngine.stop();
    setPlayer({ isPlaying: false });
    addToast('Sleep timer ended');
  }, [setPlayer, addToast]);

  const handleSleep = useCallback(
    (mins: number) => {
      if (sleepRef.current) clearTimeout(sleepRef.current);
      if (mins > 0) {
        sleepRef.current = setTimeout(() => {
          void finishSleep();
        }, mins * 60000);
        addToast(`Sleep timer: ${mins} min`);
      } else {
        addToast('Sleep timer off');
      }
      setSleepTimer(mins);
    },
    [setSleepTimer, finishSleep, addToast]
  );

  useEffect(() => {
    const target = useStore.getState().sleepTimerTarget;
    if (target) {
      const remainingMs = target - Date.now();
      if (remainingMs > 0) {
        const remainingMins = Math.ceil(remainingMs / 60000);
        sleepRef.current = setTimeout(() => {
          void finishSleep();
        }, remainingMs);
        useStore.getState().setSleepTimer(remainingMins);
      } else {
        useStore.getState().setSleepTimer(0);
      }
    }
  }, [finishSleep]);

  return { handleSleep };
}

import { useCallback, useRef, useEffect } from 'react';
import { useStore } from '../store/store';
import { audioEngine } from './audioEngine';

export function useSleepTimer() {
  const setSleepTimer = useStore((s) => s.setSleepTimer);
  const setPlayer = useStore((s) => s.setPlayer);
  const addToast = useStore((s) => s.addToast);
  const sleepRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (sleepRef.current) {
      clearTimeout(sleepRef.current);
      sleepRef.current = null;
    }
  }, []);

  const finishSleep = useCallback(async () => {
    if (audioEngine.isPlaying()) {
      await audioEngine.fadeOut(4000);
    }
    audioEngine.stop();
    setPlayer({ isPlaying: false });
    setSleepTimer(0);
    addToast('Sleep timer ended');
  }, [setPlayer, setSleepTimer, addToast]);

  const handleSleep = useCallback(
    (mins: number) => {
      clearTimer();
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
    [clearTimer, setSleepTimer, finishSleep, addToast]
  );

  useEffect(() => {
    const state = useStore.getState();
    const target = state.sleepTimerTarget;
    if (target) {
      const remainingMs = target - Date.now();
      if (remainingMs <= 0) {
        state.setSleepTimer(0);
      } else {
        sleepRef.current = setTimeout(() => {
          void finishSleep();
        }, remainingMs);
      }
    }
    return () => clearTimer();
  }, [finishSleep, clearTimer, setSleepTimer]);

  return { handleSleep, clearTimer };
}
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Deck navigation: scroll-snap sections driven by wheel/touch, plus keyboard
 * (←/→, Space, Esc) and a Presentation Mode that goes fullscreen and hides
 * the chrome. The current slide is derived from scroll position so both
 * input methods stay in sync.
 */
export function useDeck(total: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [presenting, setPresenting] = useState(false);
  /** Where we are heading; lets rapid key presses chain even while a smooth scroll is in flight. */
  const target = useRef(0);

  const go = useCallback(
    (next: number) => {
      const el = ref.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(total - 1, next));
      target.current = clamped;
      el.scrollTo({ top: clamped * el.clientHeight, behavior: 'smooth' });
    },
    [total],
  );
  const step = useCallback((delta: number) => go(target.current + delta), [go]);

  const togglePresenting = useCallback(async () => {
    if (presenting) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      setPresenting(false);
    } else {
      await document.documentElement.requestFullscreen?.().catch(() => undefined);
      setPresenting(true);
    }
  }, [presenting]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const i = Math.round(el.scrollTop / el.clientHeight);
        setIndex(i);
        if (Math.abs(el.scrollTop - i * el.clientHeight) < 2) target.current = i; // settled (wheel/touch)
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          step(e.shiftKey && e.key === ' ' ? -1 : 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          step(-1);
          break;
        case 'Home':
          go(0);
          break;
        case 'End':
          go(total - 1);
          break;
        case 'Escape':
          if (presenting) void togglePresenting();
          break;
        case 'p':
        case 'P':
          void togglePresenting();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, step, presenting, togglePresenting, total]);

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setPresenting(false);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  return { ref, index, go, presenting, togglePresenting };
}

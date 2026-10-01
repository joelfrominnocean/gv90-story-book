import { useEffect, useState, type RefObject } from "react";
import { SANS, SERIF } from "./layout";

/** Size of the book column in CSS px. The 3D leaves and the live pages both lay out from this. */
export function useElementSize(ref: RefObject<HTMLElement | null>): { vw: number; vh: number } {
  const [size, setSize] = useState(() => ({ vw: Math.min(window.innerWidth, 480), vh: window.innerHeight }));
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize((s) => (s.vw === el.clientWidth && s.vh === el.clientHeight ? s : { vw: el.clientWidth, vh: el.clientHeight }));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Text is measured with canvas, so wait for the web fonts or the measurements are for a fallback font. */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      document.fonts.load(`400 24px ${SERIF}`),
      document.fonts.load(`500 24px ${SERIF}`),
      document.fonts.load(`italic 400 24px ${SERIF}`),
      document.fonts.load(`500 11px ${SANS}`),
    ])
      .catch(() => undefined)
      .then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

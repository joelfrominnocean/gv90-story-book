import { useEffect, useState } from "react";

/**
 * URL flags (all optional):
 *   ?chapter=N      open book N from the library (0-5); ?page=M opens it at page M (0-based)
 *   ?preview=all    ignore unlock dates (client review)
 *   ?debug=1        show a source badge on every string
 *   ?ryi=1          show the "already registered" state of the CTA
 *   ?utm_*          passed through to the RYI link
 */
export interface Route {
  chapter: number | null;
  page: number | null;
  preview: boolean;
  debug: boolean;
  ryi: boolean;
  search: string;
}

/**
 * ?debug=1 shows internal notes (sources, flags, who commented what). It works in dev and wherever the build opts in
 * with VITE_ALLOW_DEBUG=1; the public GitHub Pages build does not.
 */
const ALLOW_DEBUG = import.meta.env.DEV || import.meta.env.VITE_ALLOW_DEBUG === "1";

export function readRoute(): Route {
  const p = new URLSearchParams(window.location.search);
  const raw = p.get("chapter");
  const rawPage = p.get("page");
  return {
    chapter: raw !== null && /^\d+$/.test(raw) ? Number(raw) : null,
    page: rawPage !== null && /^\d+$/.test(rawPage) ? Number(rawPage) : null,
    preview: p.get("preview") === "all",
    debug: ALLOW_DEBUG && p.get("debug") === "1",
    ryi: p.get("ryi") === "1",
    search: window.location.search,
  };
}

/** Keeps every other param (UTMs, flags) intact; no history entries are added. */
export function writeRoute(chapter: number | null, page: number | null): void {
  const url = new URL(window.location.href);
  if (chapter === null) url.searchParams.delete("chapter");
  else url.searchParams.set("chapter", String(chapter));
  if (chapter === null || page === null || page < 0) url.searchParams.delete("page");
  else url.searchParams.set("page", String(page));
  window.history.replaceState(null, "", url);
}

export function usePrefersReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduce, setReduce] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setReduce(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

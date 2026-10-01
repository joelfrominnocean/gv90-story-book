import { asset } from "./asset";
import raw from "./content.json";
import { Content, REQUIRED_UI_KEYS, type Chapter, type Str, type UiKey } from "./schema";

export type { Chapter, Hotspot, Media, Module, Source, Str, UiKey, VideoRef } from "./schema";

/** Throws a ZodError naming the JSON path of any bad string; main.tsx renders it. */
export function loadContent(): Content {
  const parsed = Content.parse(raw);
  // Point every file path at the right base (a sub-path on GitHub Pages).
  for (const ch of parsed.chapters) {
    for (const h of ch.heroes) if (h.src) h.src = asset(h.src);
    if (ch.video) {
      if (ch.video.sources.mp4) ch.video.sources.mp4 = asset(ch.video.sources.mp4);
      if (ch.video.sources.webm) ch.video.sources.webm = asset(ch.video.sources.webm);
      if (ch.video.poster) ch.video.poster = asset(ch.video.poster);
      if (ch.video.captions.vtt) ch.video.captions.vtt = asset(ch.video.captions.vtt);
    }
  }
  const missing = REQUIRED_UI_KEYS.filter((k) => !(k in parsed.meta.ui));
  if (missing.length) throw new Error(`content.json › meta.ui is missing: ${missing.join(", ")}`);
  return parsed;
}

export const content = loadContent();

export const ui = (key: UiKey): Str => content.meta.ui[key]!;

/** Fill {tokens} in a string. */
export function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export interface UnlockState {
  open: boolean;
  /** Human date for the sealed page, or null when no date is set. */
  dateLabel: string | null;
}

export function unlockState(ch: Chapter, preview: boolean, now: Date = new Date()): UnlockState {
  const at = ch.unlock.at ? new Date(`${ch.unlock.at}T00:00:00`) : null;
  const dateLabel = at ? at.toLocaleDateString("en-AU", { day: "numeric", month: "long" }) : null;
  if (preview) return { open: true, dateLabel };
  return { open: at !== null && at.getTime() <= now.getTime(), dateLabel };
}

/** Pass UTM parameters from the eDM link through to the RYI URL. */
export function ctaHref(search: string): string {
  const out = new URL(content.meta.ryiUrl.url);
  const params = new URLSearchParams(search);
  for (const [k, v] of params) if (k.toLowerCase().startsWith("utm_")) out.searchParams.set(k, v);
  return out.toString();
}

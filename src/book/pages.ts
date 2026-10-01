import type { Chapter } from "../content";
import { ui } from "../content";

/**
 * A chapter is a book; a book is a run of pages. Nothing scrolls.
 *   opener  title, epigraph, hero (with hotspots), watch line
 *   panel   the prologue's still frames (the first carries the title)
 *   beats   one brief bullet per page; two only when both are very short
 *   close   the quiet CTA
 *   sealed  a locked chapter's single page
 * Copy is never reworded or split: pages only decide which whole bullets sit together.
 */
export type PageSpec =
  | { kind: "opener" }
  | { kind: "panel"; hero: number }
  | { kind: "beats"; module: number; beats: number[]; first: boolean }
  | { kind: "close" }
  | { kind: "sealed" };

/** Two beats share a page only if together they stay under this many characters. */
export const PAIR_MAX_CHARS = 120;

const len = (c: Chapter, module: number, beat: number): number | null => c.modules[module]?.beats[beat]?.text?.length ?? null;

export function buildPages(ch: Chapter, open: boolean): PageSpec[] {
  if (!open) return [{ kind: "sealed" }];
  const pages: PageSpec[] = [];
  if (ch.heroes.length > 1) ch.heroes.forEach((_, i) => pages.push({ kind: "panel", hero: i }));
  else pages.push({ kind: "opener" });

  ch.modules.forEach((m, mi) => {
    let i = 0;
    while (i < m.beats.length) {
      const a = len(ch, mi, i);
      const b = len(ch, mi, i + 1);
      const pair = a !== null && b !== null && a + b <= PAIR_MAX_CHARS;
      pages.push({ kind: "beats", module: mi, beats: pair ? [i, i + 1] : [i], first: i === 0 });
      i += pair ? 2 : 1;
    }
  });
  pages.push({ kind: "close" });
  return pages;
}

export function eyebrowFor(ch: Chapter) {
  return ch.kind === "prologue" ? ui("eyebrowPrologue") : ch.kind === "epilogue" ? ui("eyebrowEpilogue") : ui("eyebrowChapter");
}

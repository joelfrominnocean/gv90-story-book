/**
 * Shared page layout. The live HTML pages and the 3D leaf textures both lay text out with these numbers,
 * so the page that fades in over a leaf sits where the leaf's printed copy was.
 * Measurements use canvas, so the web fonts must be loaded first (see useFontsReady).
 */
export const GUTTER = 28;
/** Height reserved at the top for the progress line and Library control. */
export const RAIL_H = 36;
export const BEAT_LH = 1.32;
export const BEAT_MIN = 17;
/** Gap between two beats sharing a page, in em of the beat font size. */
export const BEAT_GAP = 1.6;
/** Space kept clear under the text block on a beat page. */
export const BEAT_BOTTOM = 56;

export interface Insets {
  top: number;
  bottom: number;
}

export const SERIF = '"Cormorant Garamond", "Iowan Old Style", "Palatino Linotype", Georgia, serif';
export const SANS = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

export const serif = (fs: number, style: "normal" | "italic" = "normal", weight = 400): string =>
  `${style === "italic" ? "italic " : ""}${weight} ${fs}px ${SERIF}`;

export const beatMax = (vw: number): number => Math.min(32, Math.max(25.6, vw * 0.069));

/** Safe-area insets in CSS px (non-zero on notched phones). */
export function readInsets(): Insets {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)";
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const out = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
  el.remove();
  return out;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function ctx2d(): CanvasRenderingContext2D {
  measureCtx ??= document.createElement("canvas").getContext("2d")!;
  return measureCtx;
}

/** Greedy word wrap with canvas metrics (the browser's own wrapping is close but not identical). */
export function wrapLines(text: string, font: string, maxWidth: number, ctx: CanvasRenderingContext2D = ctx2d()): string[] {
  ctx.font = font;
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Like the browser's `text-wrap: balance`: the narrowest width that keeps the same number of lines. */
export function wrapBalanced(text: string, font: string, maxWidth: number, ctx: CanvasRenderingContext2D = ctx2d()): string[] {
  const greedy = wrapLines(text, font, maxWidth, ctx);
  if (greedy.length < 2) return greedy;
  let lo = maxWidth * 0.4;
  let hi = maxWidth;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (wrapLines(text, font, mid, ctx).length === greedy.length) hi = mid;
    else lo = mid;
  }
  return wrapLines(text, font, hi, ctx);
}

export interface BeatFit {
  fs: number;
  lines: string[][];
  blockH: number;
  top: number;
  areaH: number;
  fits: boolean;
}

/** The largest font size at which these beats fit on one page, down to BEAT_MIN. */
export function fitBeats(texts: string[], vw: number, vh: number, insets: Insets): BeatFit {
  const top = RAIL_H + insets.top;
  const areaH = vh - top - BEAT_BOTTOM - insets.bottom;
  const width = vw - GUTTER * 2;
  let best: BeatFit | null = null;
  for (let fs = beatMax(vw); fs >= BEAT_MIN; fs -= 0.5) {
    const lines = texts.map((t) => wrapLines(t, serif(fs), width));
    const blockH = lines.reduce((h, l) => h + l.length * fs * BEAT_LH, 0) + Math.max(0, texts.length - 1) * BEAT_GAP * fs;
    best = { fs, lines, blockH, top, areaH, fits: blockH <= areaH };
    if (best.fits) return best;
  }
  return best!;
}

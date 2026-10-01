import * as THREE from "three";
import { BEAT_GAP, BEAT_LH, GUTTER, RAIL_H, SANS, SERIF, fitBeats, serif, wrapBalanced, wrapLines, type Insets } from "../book/layout";
import { PAGE_H, PAGE_W, READING_FIT } from "./constants";

/**
 * Every surface of the book is drawn procedurally (no image files): hanji paper, cloth wrapper,
 * title slip, fore-edge layers, and the printed pages. Canvases are created once and redrawn in place,
 * so the three.js textures never change identity.
 */

const PAPER = "#f4efe3";
const INK = "#15130f";
/** Ink pages are printed a little darker than the brand ink: the scene lighting lifts them back to it. */
const INK_PAGE = "#0e0c09";
const JAR_PATH = "M52 9 C78 6 94 28 92 53 C90 78 69 95 45 92 C21 89 6 69 9 45 C12 23 31 8 56 11 C60 11.5 63 12.5 66 14";

export const PAGE_PX = { w: 512, h: Math.round((512 * PAGE_H) / PAGE_W) };
const COVER_PX = { w: 800, h: Math.round((800 * PAGE_H) / PAGE_W) };
export const SLIP = { w: 0.15 * PAGE_W, h: 0.62 * PAGE_H };
/** The spine label: as long as the cover slip, and a little narrower than the book is thick. */
export const spineSlipSize = (thickness: number) => ({ w: thickness * 0.8, h: SLIP.h });
/** Vertical positions of the five stitch holes, as a fraction of the cover height. */
export const HOLE_RATIOS = [0.1, 0.3, 0.5, 0.7, 0.9];
export const HOLE_X = 0.055;

type Mode = "paper" | "ink";

export interface HeroDraw {
  src: string | null;
  aspect: "4:5" | "16:9";
  assetName: string;
}

/** What to print on one leaf. Built from the content in book/drawSpecs.ts, so this file knows no copy. */
export type DrawPage =
  | { type: "opener"; mode: Mode; accent: string; eyebrow: string; title: string; epigraph: string | null; epigraphPending: boolean; hero: HeroDraw; watch: string | null }
  | { type: "panel"; mode: Mode; accent: string; hero: HeroDraw; header: { eyebrow: string; title: string } | null; watch: string | null }
  | { type: "beats"; mode: Mode; texts: (string | null)[]; pending: string[] }
  | { type: "close"; mode: Mode; accent: string; cta: string }
  | { type: "sealed"; mode: Mode; accent: string; eyebrow: string; title: string; teaser: string; opens: string };

export interface PageEnv {
  vw: number;
  vh: number;
  insets: Insets;
}

export interface TextureOptions {
  pageCount: number;
  /** A closed book for the shelf: small canvases, no printed pages. */
  lite?: boolean;
  /** Total thickness of the book in world units (for the spine label's proportions). */
  thickness: number;
  coverTitle: string;
  mode: Mode;
  /** Accent colour of the chapter: tints the wrapper and the lamp. */
  accent: string;
}

export interface BookTextures {
  cover: THREE.CanvasTexture;
  insideCover: THREE.CanvasTexture;
  slip: THREE.CanvasTexture;
  /** The title label on the spine edge. */
  spine: THREE.CanvasTexture;
  verso: THREE.CanvasTexture;
  edge: THREE.CanvasTexture;
  paperPlain: THREE.CanvasTexture;
  /** A page with no print, for the leaf the reader is on (the live HTML sits on top of it). */
  blank: THREE.CanvasTexture;
  shadow: THREE.CanvasTexture;
  glow: THREE.CanvasTexture;
  lamp: THREE.CanvasTexture;
  pages: THREE.CanvasTexture[];
  /** Draw the cover and spine title labels (needs the web fonts). */
  drawLabels(): Promise<void>;
  /** Draw (or redraw) every printed page for this viewport. Resolves when fonts and images are in. */
  drawPages(specs: DrawPage[], env: PageEnv): Promise<void>;
  dispose(): void;
}

/* ---------- helpers ---------- */

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function texture(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i]! - v) * t)).join(",")})`;
}

let noiseTile: HTMLCanvasElement | null = null;
function getNoise(): HTMLCanvasElement {
  if (noiseTile) return noiseTile;
  const [c, ctx] = canvas(256, 256);
  const img = ctx.createImageData(256, 256);
  const r = rng(7);
  for (let i = 0; i < 256 * 256; i++) {
    const v = 95 + r() * 55;
    img.data[i * 4] = v + 12;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v - 28;
    img.data[i * 4 + 3] = 20 + r() * 60;
  }
  ctx.putImageData(img, 0, 0);
  noiseTile = c;
  return c;
}

/** Hanji: warm paper, a fine grain, and long faint mulberry fibres. */
function paperBase(ctx: CanvasRenderingContext2D, w: number, h: number, mode: Mode, seed: number): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = mode === "paper" ? PAPER : INK_PAGE;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = mode === "paper" ? "multiply" : "screen";
  ctx.globalAlpha = mode === "paper" ? 0.5 : 0.09;
  ctx.fillStyle = ctx.createPattern(getNoise(), "repeat")!;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.lineCap = "round";
  const r = rng(seed);
  const k = w / 640;
  for (let i = 0; i < 380; i++) {
    const x = r() * w;
    const y = r() * h;
    const len = (18 + r() * 70) * k;
    const ang = (r() - 0.5) * 0.5 + (r() < 0.12 ? 1.2 : 0);
    ctx.strokeStyle = mode === "paper" ? `rgba(110,92,60,${0.03 + r() * 0.045})` : `rgba(230,220,200,${0.012 + r() * 0.02})`;
    ctx.lineWidth = 0.7 * k;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
  ctx.restore();
}

/** The soft dip toward the spine. */
function gutter(ctx: CanvasRenderingContext2D, w: number, h: number, side: "left" | "right", mode: Mode): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const a = side === "left" ? 0 : w;
  const b = side === "left" ? w * 0.12 : w * 0.88;
  const g = ctx.createLinearGradient(a, 0, b, 0);
  g.addColorStop(0, mode === "paper" ? "rgba(60,42,16,0.30)" : "rgba(0,0,0,0.5)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

const images = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(src: string): Promise<HTMLImageElement | null> {
  let p = images.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    images.set(src, p);
  }
  return p;
}

function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number): number {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return cx - spacing;
}

function coverFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number): void {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

/** Where the live HTML column sits on the page in reading pose, in CSS pixels. */
function layoutFor(env: PageEnv) {
  const pxPerUnit = env.vh / (PAGE_H * READING_FIT);
  const pageCssW = PAGE_W * pxPerUnit;
  const pageCssH = PAGE_H * pxPerUnit;
  return { pageCssW, colLeft: (pageCssW - env.vw) / 2, oy: (pageCssH - env.vh) / 2 };
}

const colors = (mode: Mode) =>
  mode === "paper" ? { fg: INK, muted: "#6a675f", bg: PAPER, frame: "#dedacf" } : { fg: "#f3efe6", muted: "#a8a59b", bg: INK_PAGE, frame: "#262420" };

/* Baselines: where a font puts its baseline inside a line box of a given line-height. */
const serifBase = (fs: number, lh: number) => ((lh - 1.211) / 2) * fs + 0.924 * fs;
const sansBase = (fs: number, lh: number) => ((lh - 1.211) / 2) * fs + 0.969 * fs;

/* ---------- page drawing ---------- */

function drawJar(ctx: CanvasRenderingContext2D, x: number, y: number, fg: string, sealed = false): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(0.52, 0.52);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 2.3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (sealed) {
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([0.025 * 330, 0.02 * 330]);
  }
  ctx.stroke(new Path2D(JAR_PATH));
  ctx.restore();
}

function drawLamps(ctx: CanvasRenderingContext2D, x: number, y: number, accent: string, fg: string, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const dy of [0, 6]) {
    const grad = ctx.createLinearGradient(x, 0, x + 120, 0);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.24, accent);
    grad.addColorStop(0.5, fg);
    grad.addColorStop(0.76, accent);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(x, y + dy, 120, 1);
  }
  ctx.restore();
}

/** Jar, eyebrow, title (and epigraph): returns the y just below, in page CSS px. */
function drawHeader(
  ctx: CanvasRenderingContext2D,
  env: PageEnv,
  g: ReturnType<typeof layoutFor>,
  mode: Mode,
  eyebrow: string,
  title: string,
  epigraph: string | null,
  epigraphPending = false,
): number {
  const { fg, muted } = colors(mode);
  const x = g.colLeft + GUTTER;
  let y = g.oy + RAIL_H + env.insets.top + 48;
  drawJar(ctx, x, y, fg);
  y += 52 + 24;
  ctx.fillStyle = muted;
  ctx.font = `500 11px ${SANS}`;
  spaced(ctx, eyebrow.toUpperCase(), x, y + sansBase(11, 1), 2.2);
  y += 11 + 14.4;
  const fs = Math.min(49.6, Math.max(38.4, env.vw * 0.114));
  ctx.fillStyle = fg;
  ctx.font = serif(fs, "normal", 500);
  const lines = wrapBalanced(title, serif(fs, "normal", 500), env.vw - GUTTER * 2, ctx);
  lines.forEach((line, i) => ctx.fillText(line, x, y + fs * 1.02 * i + serifBase(fs, 1.02)));
  y += fs * 1.02 * lines.length;
  if (epigraph) {
    y += 17.6;
    ctx.fillStyle = muted;
    const f = serif(22.4, "italic");
    ctx.font = f;
    const el = wrapLines(epigraph, f, env.vw - GUTTER * 2, ctx);
    el.forEach((line, i) => ctx.fillText(line, x, y + 29.12 * i + serifBase(22.4, 1.3)));
    y += 29.12 * el.length;
  } else if (epigraphPending) {
    // Pending copy keeps its place, as a labelled dashed box.
    y += 17.6;
    ctx.save();
    ctx.strokeStyle = muted;
    ctx.globalAlpha = 0.6;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x + 0.5, y + 0.5, env.vw - GUTTER * 2 - 1, 52);
    ctx.restore();
    ctx.fillStyle = fg;
    ctx.font = `600 11px ${SANS}`;
    spaced(ctx, "COPY PENDING", x + 14, y + 22, 1.76);
    y += 53;
  }
  return y;
}

async function drawHero(
  ctx: CanvasRenderingContext2D,
  hero: HeroDraw,
  mode: Mode,
  x: number,
  y: number,
  w: number,
  h: number,
  wide: boolean,
): Promise<void> {
  const { fg, muted, bg, frame } = colors(mode);
  const img = hero.src ? await loadImage(hero.src) : null;
  if (img) {
    coverFit(ctx, img, x, y, w, h);
    if (wide && mode === "ink") {
      // The same dissolve into the page as the live HTML.
      for (const top of [true, false]) {
        const grad = ctx.createLinearGradient(0, top ? y : y + h, 0, top ? y + h * 0.16 : y + h * 0.84);
        grad.addColorStop(0, bg);
        grad.addColorStop(1, "rgba(14,12,9,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, w, h);
      }
    }
    return;
  }
  // Labelled grey placeholder frame, as in the live page.
  ctx.save();
  ctx.fillStyle = frame;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = muted;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y + h);
  ctx.moveTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.stroke();
  ctx.globalAlpha = 1;
  const bw = w * 0.8;
  const bh = 70;
  ctx.fillStyle = bg;
  ctx.fillRect(x + (w - bw) / 2, y + (h - bh) / 2, bw, bh);
  ctx.textAlign = "center";
  ctx.fillStyle = fg;
  ctx.font = `500 10px ${SANS}`;
  ctx.fillText("PLACEHOLDER", x + w / 2, y + h / 2 - 8);
  ctx.fillStyle = muted;
  const f = `500 12px ${SANS}`;
  ctx.font = f;
  wrapLines(hero.assetName, f, bw - 24, ctx)
    .slice(0, 2)
    .forEach((line, i) => ctx.fillText(line, x + w / 2, y + h / 2 + 10 + i * 16));
  ctx.restore();
}

function drawWatch(ctx: CanvasRenderingContext2D, label: string, x: number, top: number, mode: Mode): void {
  const { fg } = colors(mode);
  const cy = top + 11.2 + 15.2;
  ctx.save();
  ctx.strokeStyle = fg;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x + 15.2, cy, 14.7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(x + 11.5 + 4.5, cy - 5.8);
  ctx.lineTo(x + 11.5 + 4.5 + 9.3, cy);
  ctx.lineTo(x + 11.5 + 4.5, cy + 5.8);
  ctx.fill();
  ctx.font = `500 12px ${SANS}`;
  spaced(ctx, label.toUpperCase(), x + 30.4 + 12.8, cy + 4.2, 1.92);
  ctx.restore();
}

/** Space the watch line takes, for working out how tall the hero can be. */
const WATCH_BLOCK = 22.4 + 11.2 * 2 + 30.4;
const PAGE_BOTTOM = 24;

async function drawOpenerLike(ctx: CanvasRenderingContext2D, spec: Extract<DrawPage, { type: "opener" | "panel" }>, env: PageEnv): Promise<void> {
  const g = layoutFor(env);
  const L = g.colLeft;
  const wide = spec.hero.aspect === "16:9";
  const hasHeader = spec.type === "opener" || spec.header !== null;
  const hw = wide ? env.vw : env.vw - GUTTER * 2;
  const hx = wide ? L : L + GUTTER;
  const natural = wide ? (hw * 9) / 16 : hw * 1.25;

  let y: number;
  let h: number;
  if (hasHeader) {
    const head =
      spec.type === "opener"
        ? { eyebrow: spec.eyebrow, title: spec.title, epigraph: spec.epigraph, pending: spec.epigraphPending }
        : { eyebrow: spec.header!.eyebrow, title: spec.header!.title, epigraph: null, pending: false };
    y = drawHeader(ctx, env, g, spec.mode, head.eyebrow, head.title, head.epigraph, head.pending) + 40;
    const remaining = g.oy + env.vh - y - (spec.watch ? WATCH_BLOCK : 0) - PAGE_BOTTOM - env.insets.bottom;
    h = Math.max(110, Math.min(natural, remaining));
  } else {
    // A silent panel: just the still, centred.
    h = natural;
    const top = g.oy + RAIL_H + env.insets.top;
    const area = env.vh - RAIL_H - env.insets.top - PAGE_BOTTOM - env.insets.bottom;
    y = top + (area - h) / 2;
  }
  await drawHero(ctx, spec.hero, spec.mode, hx, y, hw, h, wide);
  if (hasHeader && spec.watch) drawWatch(ctx, spec.watch, L + GUTTER, y + h + 22.4, spec.mode);
}

function drawBeats(ctx: CanvasRenderingContext2D, spec: Extract<DrawPage, { type: "beats" }>, env: PageEnv): void {
  const g = layoutFor(env);
  const { fg, muted } = colors(spec.mode);
  const x = g.colLeft + GUTTER;
  const real = spec.texts.filter((t): t is string => t !== null);
  const fit = fitBeats(real, env.vw, env.vh, env.insets);
  const blockH = real.length ? fit.blockH : 60;
  let y = g.oy + fit.top + Math.max(0, (fit.areaH - blockH) / 2);
  let ri = 0;
  spec.texts.forEach((t, i) => {
    if (t === null) {
      // Pending copy: a labelled dashed box, as in the live page.
      ctx.save();
      ctx.strokeStyle = muted;
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x + 0.5, y + 0.5, env.vw - GUTTER * 2 - 1, 60);
      ctx.restore();
      ctx.fillStyle = fg;
      ctx.font = `600 11px ${SANS}`;
      const end = spaced(ctx, "COPY PENDING", x + 14, y + 26, 1.76);
      ctx.fillStyle = muted;
      ctx.font = `500 11px ${SANS}`;
      ctx.fillText(` · ${spec.pending[i] ?? ""}`.toUpperCase().slice(0, 44), end + 6, y + 26);
      y += 60 + BEAT_GAP * fit.fs;
      return;
    }
    ctx.fillStyle = fg;
    ctx.font = serif(fit.fs);
    const lines = fit.lines[ri++]!;
    lines.forEach((line, li) => ctx.fillText(line, x, y + fit.fs * BEAT_LH * li + serifBase(fit.fs, BEAT_LH)));
    y += lines.length * fit.fs * BEAT_LH + BEAT_GAP * fit.fs;
  });
}

function drawClose(ctx: CanvasRenderingContext2D, spec: Extract<DrawPage, { type: "close" }>, env: PageEnv): void {
  const g = layoutFor(env);
  const { fg, muted } = colors(spec.mode);
  const x = g.colLeft + GUTTER;
  const top = g.oy + RAIL_H + env.insets.top;
  const area = env.vh - RAIL_H - env.insets.top - PAGE_BOTTOM - env.insets.bottom;
  const ctaH = 11.2 + 25.5 + 7.2 + 1;
  const block = 7 + 28 + ctaH;
  let y = top + (area - block) / 2;
  drawLamps(ctx, x, y, spec.accent, fg);
  y += 7 + 28;
  ctx.fillStyle = fg;
  ctx.font = serif(23.2, "italic");
  ctx.fillText(spec.cta, x, y + 11.2 + serifBase(23.2, 1.1));
  const w = ctx.measureText(spec.cta).width;
  ctx.strokeStyle = muted;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1;
  const lineY = y + 11.2 + 25.5 + 7.2 + 0.5;
  ctx.beginPath();
  ctx.moveTo(x, lineY);
  ctx.lineTo(x + w + 10.4 + 17.6, lineY);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = fg;
  ctx.beginPath();
  ctx.moveTo(x + w + 10.4, y + 11.2 + 14);
  ctx.lineTo(x + w + 10.4 + 17.6, y + 11.2 + 14);
  ctx.stroke();
}

/** The sealed page, laid out like the HTML one: centred, never blank. */
function drawSealed(ctx: CanvasRenderingContext2D, spec: Extract<DrawPage, { type: "sealed" }>, env: PageEnv): void {
  const g = layoutFor(env);
  const { fg, muted } = colors(spec.mode);
  const maxW = Math.min(env.vw, 27 * 16);
  const colW = maxW - GUTTER * 2;
  const x = g.colLeft + (env.vw - maxW) / 2 + GUTTER;
  const fs = Math.min(49.6, Math.max(38.4, env.vw * 0.114));
  const titleLines = wrapBalanced(spec.title, serif(fs, "normal", 500), colW, ctx);
  const teaserLines = wrapLines(spec.teaser, serif(22.4, "italic"), colW, ctx);
  const gap = 17.6;
  const blockH = 52 + gap + 11 + gap * 0.4 + fs * 1.02 * titleLines.length + gap + 7 + gap + 29.12 * teaserLines.length + gap * 0.5 + 11;
  const top = g.oy + RAIL_H + env.insets.top;
  const area = env.vh - RAIL_H - env.insets.top - 32 - env.insets.bottom;
  let y = top + Math.max(0, (area - blockH) / 2);

  drawJar(ctx, x, y, fg, true);
  y += 52 + gap;
  ctx.fillStyle = muted;
  ctx.font = `500 11px ${SANS}`;
  spaced(ctx, spec.eyebrow.toUpperCase(), x, y + sansBase(11, 1), 2.2);
  y += 11 + gap * 0.4;
  ctx.fillStyle = fg;
  ctx.font = serif(fs, "normal", 500);
  titleLines.forEach((line, i) => ctx.fillText(line, x, y + fs * 1.02 * i + serifBase(fs, 1.02)));
  y += fs * 1.02 * titleLines.length + gap;
  drawLamps(ctx, x, y, spec.accent, fg, 0.45);
  y += 7 + gap;
  ctx.fillStyle = muted;
  ctx.font = serif(22.4, "italic");
  teaserLines.forEach((line, i) => ctx.fillText(line, x, y + 29.12 * i + serifBase(22.4, 1.3)));
  y += 29.12 * teaserLines.length + gap * 0.5;
  ctx.font = `500 11px ${SANS}`;
  spaced(ctx, spec.opens.toUpperCase(), x, y + sansBase(11, 1.4), 1.76);
}

async function drawPage(ctx: CanvasRenderingContext2D, spec: DrawPage, env: PageEnv, seed: number): Promise<void> {
  const { w, h } = PAGE_PX;
  paperBase(ctx, w, h, spec.mode, seed);
  const g = layoutFor(env);
  const s = w / g.pageCssW;
  ctx.save();
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  switch (spec.type) {
    case "opener":
    case "panel":
      await drawOpenerLike(ctx, spec, env);
      break;
    case "beats":
      drawBeats(ctx, spec, env);
      break;
    case "close":
      drawClose(ctx, spec, env);
      break;
    case "sealed":
      drawSealed(ctx, spec, env);
      break;
  }
  ctx.restore();
  gutter(ctx, w, h, "left", spec.mode);
}

/* ---------- other surfaces ---------- */

function drawVerso(ctx: CanvasRenderingContext2D, mode: Mode): void {
  const { w, h } = PAGE_PX;
  paperBase(ctx, w, h, mode, 31);
  // A ruled frame, after the reference photo: heavy rules top and bottom, hairlines at the sides.
  ctx.strokeStyle = mode === "paper" ? "rgba(21,19,15,0.72)" : "rgba(243,239,230,0.4)";
  const x1 = w * 0.1;
  const x2 = w * 0.87;
  const rule = (y: number, lw: number) => {
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
  };
  const k = w / 640;
  rule(h * 0.07, 5 * k);
  rule(h * 0.07 + 11 * k, 1.6 * k);
  rule(h * 0.93, 5 * k);
  rule(h * 0.93 - 11 * k, 1.6 * k);
  ctx.lineWidth = 1.6 * k;
  for (const x of [x1, x2]) {
    ctx.beginPath();
    ctx.moveTo(x, h * 0.07 + 11 * k);
    ctx.lineTo(x, h * 0.93 - 11 * k);
    ctx.stroke();
  }
  // A small moon jar, the one recurring mark.
  ctx.save();
  ctx.translate(w * 0.5 - w * 0.025, h * 0.5 - w * 0.045);
  ctx.scale(w * 0.0009, w * 0.0009);
  ctx.strokeStyle = mode === "paper" ? "rgba(21,19,15,0.38)" : "rgba(243,239,230,0.3)";
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.stroke(new Path2D(JAR_PATH));
  ctx.restore();
  gutter(ctx, w, h, "right", mode);
}

function drawCover(ctx: CanvasRenderingContext2D, accent: string): void {
  const { w, h } = COVER_PX;
  // Each book's wrapper is ink with a faint tint of its chapter accent, so the shelf is not six identical books.
  ctx.fillStyle = mixHex("#1b1915", accent, 0.14);
  ctx.fillRect(0, 0, w, h);
  const r = rng(11);
  // Cloth weave: fine threads in both directions.
  for (let y = 0; y < h; y += 2) {
    ctx.fillStyle = `rgba(255,250,235,${0.012 + r() * 0.02})`;
    ctx.fillRect(0, y, w, 1);
  }
  for (let x = 0; x < w; x += 2) {
    ctx.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.06})`;
    ctx.fillRect(x, 0, 1, h);
  }
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = ctx.createPattern(getNoise(), "repeat")!;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  // Soft wear toward the edges.
  const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.2, w * 0.5, h * 0.5, h * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.38)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  // Five stitch holes along the spine edge.
  for (const ratio of HOLE_RATIOS) {
    const x = HOLE_X * w;
    const y = ratio * h;
    ctx.fillStyle = "#070605";
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Spine crease.
  const crease = ctx.createLinearGradient(0, 0, w * 0.05, 0);
  crease.addColorStop(0, "rgba(0,0,0,0.5)");
  crease.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = crease;
  ctx.fillRect(0, 0, w * 0.05, h);
}

function drawSlip(ctx: CanvasRenderingContext2D, w: number, h: number, title: string): void {
  paperBase(ctx, w, h, "paper", 5);
  ctx.strokeStyle = "rgba(21,19,15,0.7)";
  ctx.lineWidth = 3;
  ctx.strokeRect(9, 9, w - 18, h - 18);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(16, 16, w - 32, h - 32);
  // The title reads top to bottom, as on a traditional book slip.
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 96;
  ctx.font = serif(size, "normal", 500);
  const target = h * 0.8;
  const measured = ctx.measureText(title).width;
  if (measured > target) {
    size = size * (target / measured);
    ctx.font = serif(size, "normal", 500);
  }
  ctx.fillText(title, 0, 4);
  ctx.restore();
}

function drawEdge(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = "#e9e2d0";
  ctx.fillRect(0, 0, w, h);
  const r = rng(3);
  for (let y = 0; y < h; y += 4) {
    ctx.fillStyle = `rgba(80,64,40,${0.22 + r() * 0.28})`;
    ctx.fillRect(0, y + 1, w, 1);
    if (r() < 0.3) {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(0, y + 2, w, 1);
    }
  }
}

function drawShadow(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, "rgba(0,0,0,0.85)");
  g.addColorStop(0.55, "rgba(0,0,0,0.4)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** White, so the lamp's material colour (the chapter accent) tints it. */
function drawGlow(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(1, h / w);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.35, "rgba(255,255,255,0.28)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-w / 2, -w / 2, w, w);
  ctx.restore();
}

function drawLamp(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.2, "rgba(255,255,255,1)");
  g.addColorStop(0.8, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/* ---------- factory ---------- */

export function createBookTextures(opts: TextureOptions): BookTextures {
  const { pageCount, coverTitle, mode, accent, lite = false, thickness } = opts;
  const [coverC, coverCtx] = canvas(lite ? 160 : COVER_PX.w, lite ? Math.round((160 * PAGE_H) / PAGE_W) : COVER_PX.h);
  if (lite) {
    // The wrapper is only glimpsed edge-on on the shelf: a plain tinted cloth is enough.
    coverCtx.fillStyle = mixHex("#1b1915", accent, 0.14);
    coverCtx.fillRect(0, 0, coverC.width, coverC.height);
  } else drawCover(coverCtx, accent);
  const pw = lite ? 64 : PAGE_PX.w;
  const ph = lite ? Math.round((64 * PAGE_H) / PAGE_W) : PAGE_PX.h;
  const [insideC, insideCtx] = canvas(pw, ph);
  paperBase(insideCtx, pw, ph, mode, 41);
  gutter(insideCtx, pw, ph, "right", mode);
  const [plainC, plainCtx] = canvas(256, 256);
  paperBase(plainCtx, 256, 256, mode, 51);
  const [versoC, versoCtx] = canvas(lite ? 16 : PAGE_PX.w, lite ? 24 : PAGE_PX.h);
  if (!lite) drawVerso(versoCtx, mode);
  const [blankC, blankCtx] = canvas(lite ? 16 : PAGE_PX.w, lite ? 24 : PAGE_PX.h);
  if (!lite) {
    paperBase(blankCtx, PAGE_PX.w, PAGE_PX.h, mode, 61);
    gutter(blankCtx, PAGE_PX.w, PAGE_PX.h, "left", mode);
  }
  const [edgeC, edgeCtx] = canvas(16, 128);
  drawEdge(edgeCtx, 16, 128);
  const [shadowC, shadowCtx] = canvas(256, 256);
  drawShadow(shadowCtx, 256, 256);
  const [glowC, glowCtx] = canvas(256, 64);
  drawGlow(glowCtx, 256, 64);
  const [lampC, lampCtx] = canvas(256, 8);
  drawLamp(lampCtx, 256, 8);
  const [slipC, slipCtx] = canvas(lite ? 24 : 192, lite ? 150 : Math.round(192 * (SLIP.h / SLIP.w)));
  const spineSize = spineSlipSize(thickness);
  const spineW = 128;
  const [spineC, spineCtx] = canvas(spineW, Math.round(spineW * (spineSize.h / spineSize.w)));

  const pageCanvases = Array.from({ length: lite ? 0 : pageCount }, (_, i) => {
    const [c, ctx] = canvas(PAGE_PX.w, PAGE_PX.h);
    paperBase(ctx, PAGE_PX.w, PAGE_PX.h, mode, 70 + i);
    return { c, ctx };
  });

  const edge = texture(edgeC);
  edge.wrapS = edge.wrapT = THREE.RepeatWrapping;
  const pages = pageCanvases.map((p) => texture(p.c));
  const t: BookTextures = {
    cover: texture(coverC),
    insideCover: texture(insideC),
    slip: texture(slipC),
    spine: texture(spineC),
    verso: texture(versoC),
    edge,
    paperPlain: texture(plainC),
    blank: texture(blankC),
    shadow: texture(shadowC),
    glow: texture(glowC),
    lamp: texture(lampC),
    pages,
    async drawLabels() {
      // Canvas text needs the web fonts loaded first.
      await Promise.all([
        document.fonts.load(`500 48px ${SERIF}`),
        document.fonts.load(`italic 400 24px ${SERIF}`),
        document.fonts.load(`400 24px ${SERIF}`),
        document.fonts.load(`500 11px ${SANS}`),
      ]).catch(() => undefined);
      if (!lite) drawSlip(slipCtx, slipC.width, slipC.height, coverTitle);
      drawSlip(spineCtx, spineC.width, spineC.height, coverTitle);
      t.slip.needsUpdate = true;
      t.spine.needsUpdate = true;
    },
    async drawPages(specs, env) {
      await t.drawLabels();
      await Promise.all(
        specs.map(async (spec, i) => {
          const p = pageCanvases[i];
          if (!p) return;
          await drawPage(p.ctx, spec, env, 70 + i);
          pages[i]!.needsUpdate = true;
        }),
      );
    },
    dispose() {
      [t.cover, t.insideCover, t.slip, t.spine, t.verso, t.edge, t.paperPlain, t.blank, t.shadow, t.glow, t.lamp, ...t.pages].forEach((x) => x.dispose());
    },
  };
  return t;
}

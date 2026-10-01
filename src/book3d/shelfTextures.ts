import * as THREE from "three";
import { SERIF, SANS } from "../book/layout";

/** Procedural surfaces for the library: timber, hanji light, and the paper band on a sealed book. */

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

/** Dark, close-grained timber. `vertical` runs the grain up the page (the back wall); otherwise along it (the boards). */
export function timberTexture(vertical: boolean, seed: number, base: [number, number, number]): THREE.CanvasTexture {
  const w = vertical ? 512 : 1024;
  const h = vertical ? 1024 : 256;
  const [c, ctx] = canvas(w, h);
  const r = rng(seed);
  ctx.fillStyle = `rgb(${base.join(",")})`;
  ctx.fillRect(0, 0, w, h);
  // Long, slightly wandering grain lines.
  const lines = vertical ? 260 : 220;
  for (let i = 0; i < lines; i++) {
    const pos = r() * (vertical ? w : h);
    const amp = 1 + r() * 4;
    const freq = 0.004 + r() * 0.01;
    const phase = r() * 6.28;
    const light = r() < 0.5;
    ctx.strokeStyle = light ? `rgba(120,86,56,${0.025 + r() * 0.06})` : `rgba(0,0,0,${0.06 + r() * 0.12})`;
    ctx.lineWidth = 0.6 + r() * 1.6;
    ctx.beginPath();
    const len = vertical ? h : w;
    for (let t = 0; t <= len; t += 8) {
      const off = pos + Math.sin(t * freq + phase) * amp;
      if (vertical) ctx.lineTo(off, t);
      else ctx.lineTo(t, off);
    }
    ctx.stroke();
  }
  // A few darker pores.
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.1})`;
    if (vertical) ctx.fillRect(r() * w, r() * h, 1, 2 + r() * 8);
    else ctx.fillRect(r() * w, r() * h, 2 + r() * 8, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Soft warm light, as if through a hanji screen out of frame at the upper left. Used additively. */
export function hanjiLightTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 640);
  const g = ctx.createRadialGradient(150, 130, 10, 150, 130, 560);
  g.addColorStop(0, "rgba(255,238,205,0.95)");
  g.addColorStop(0.3, "rgba(255,228,190,0.38)");
  g.addColorStop(0.7, "rgba(255,220,180,0.08)");
  g.addColorStop(1, "rgba(255,220,180,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 640);
  // The faintest paper grain so the light is not a clean digital gradient.
  const r = rng(9);
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${r() * 0.05})`;
    ctx.fillRect(r() * 512, r() * 640, 1 + r() * 3, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The paper belly band around a sealed book: a day and a month, no more. */
export function bandTexture(lines: string[], accent: string): THREE.CanvasTexture {
  const w = 96;
  const h = 128;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = "#e8e1d0";
  ctx.fillRect(0, 0, w, h);
  const r = rng(5);
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = `rgba(110,92,60,${0.04 + r() * 0.05})`;
    ctx.beginPath();
    const x = r() * w;
    const y = r() * h;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 6);
    ctx.stroke();
  }
  // Fine rules top and bottom, like a printed obi.
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(0, 6, w, 1.5);
  ctx.fillRect(0, h - 7.5, w, 1.5);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#15130f";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const [big, small] = lines;
  ctx.font = `500 ${big && big.length > 2 ? 40 : 58}px ${SERIF}`;
  ctx.fillText(big ?? "", w / 2, h * 0.42);
  ctx.font = `600 15px ${SANS}`;
  // Letter-spaced month.
  const text = (small ?? "").toUpperCase();
  const spacing = 3;
  const total = [...text].reduce((a, ch) => a + ctx.measureText(ch).width + spacing, -spacing);
  let x = (w - total) / 2;
  ctx.textAlign = "left";
  for (const ch of text) {
    ctx.fillText(ch, x, h * 0.78);
    x += ctx.measureText(ch).width + spacing;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A faint spine for the background books: darker bands near head and tail, and a label. Tinted per book by instance colour. */
export function fillerSpineTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 128);
  ctx.fillStyle = "#cfcac0";
  ctx.fillRect(0, 0, 64, 128);
  const r = rng(21);
  // Head and tail bands.
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(0, 6, 64, 5);
  ctx.fillRect(0, 117, 64, 5);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(0, 12, 64, 2);
  // A label, sometimes.
  ctx.fillStyle = "rgba(240,232,214,0.42)";
  ctx.fillRect(14, 30 + r() * 20, 36, 26 + r() * 20);
  // Mottled cloth.
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = `rgba(0,0,0,${r() * 0.12})`;
    ctx.fillRect(r() * 64, r() * 128, 1 + r() * 2, 1 + r() * 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}

/** The glow behind a book you can pick: a soft rounded halo, tinted by the book's accent. Used additively. */
export function haloTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 256);
  const g = ctx.createRadialGradient(64, 128, 6, 64, 128, 150);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.save();
  ctx.translate(64, 128);
  ctx.scale(0.62, 1);
  ctx.translate(-64, -128);
  ctx.fillRect(-60, 0, 250, 256);
  ctx.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft bed of embers: warm, elongated, a little mottled. Used additively under the logs. */
export function emberTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 48);
  ctx.save();
  ctx.translate(128, 24);
  ctx.scale(1, 0.19);
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 128);
  g.addColorStop(0, "rgba(255,150,60,0.95)");
  g.addColorStop(0.5, "rgba(255,90,20,0.45)");
  g.addColorStop(1, "rgba(255,60,10,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-128, -128, 256, 256);
  ctx.restore();
  const r = rng(13);
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(0,0,0,${r() * 0.35})`;
    ctx.fillRect(r() * 256, 12 + r() * 24, 2 + r() * 8, 1 + r() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

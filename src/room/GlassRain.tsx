import { useEffect, useRef } from "react";

interface Streak {
  x: number;
  y: number;
  len: number;
  speed: number;
  a: number;
  w: number;
}
interface Drop {
  x: number;
  y: number;
  r: number;
  /** Grown enough to run: it slides, stops, slides, and leaves a trail. */
  run: boolean;
  v: number;
  wait: number;
  from: number;
  limit: number;
}

/**
 * Rain, as you see it from inside a glasshouse: the weather outside, falling in slanted streaks at three distances (far ones short,
 * slow and faint; near ones long and bright), and the weather on the glass, a scatter of beads that grow and a few that let go and
 * run. It draws at half the pixels and 30 frames a second, only while `active`. The page puts it inside a mask shaped like the
 * glass that you can actually see, so it never lands on furniture or plants. A laptop fan should never come on because of it.
 */
export function GlassRain({ width, height, active, fps = 30, quality = 0.6 }: { width: number; height: number; active: boolean; fps?: number; quality?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !active || width < 8 || height < 8) return;
    cv.width = Math.max(2, Math.round(width * quality));
    cv.height = Math.max(2, Math.round(height * quality));
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(quality, quality);
    const k = height / 800;
    const SLANT = 0.2; // x travelled per y: the rain leans in the wind
    // ---- the weather outside: three depths of falling streaks
    const streaks: Streak[] = [];
    const layers: { n: number; len: [number, number]; speed: [number, number]; a: [number, number]; w: number }[] = [
      { n: 0.000046, len: [12, 26], speed: [400, 580], a: [0.1, 0.2], w: 1.0 },
      { n: 0.000028, len: [24, 46], speed: [620, 840], a: [0.16, 0.3], w: 1.3 },
      { n: 0.000011, len: [48, 90], speed: [900, 1200], a: [0.26, 0.42], w: 1.8 },
    ];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    for (const L of layers) {
      const count = Math.min(420, Math.round(width * height * L.n));
      for (let i = 0; i < count; i++) streaks.push({ x: rnd(-height * SLANT, width), y: rnd(-80, height), len: rnd(L.len[0], L.len[1]) * k, speed: rnd(L.speed[0], L.speed[1]) * k, a: rnd(L.a[0], L.a[1]), w: L.w * Math.max(0.8, k) });
    }
    // ---- the weather on the glass
    const drops: Drop[] = [];
    const MAX = Math.round(46 * Math.min(1.7, width / 1400));
    const MAX_RUN = 7;
    const spawn = () => {
      if (drops.length >= MAX) return;
      drops.push({ x: Math.random() * width, y: Math.random() * height * 0.95, r: (1.3 + Math.random() * 1.4) * k, run: false, v: 0, wait: 0, from: 0, limit: (3.4 + Math.random() * 1.6) * k });
    };
    for (let i = 0; i < MAX * 0.6; i++) spawn();
    let last = performance.now();
    let acc = 0;
    let id = 0;
    const step = 1000 / fps;
    const frame = (now: number) => {
      id = requestAnimationFrame(frame);
      acc += now - last;
      last = now;
      if (acc < step - 2) return;
      const dt = Math.min(0.1, acc / 1000);
      acc = 0;
      ctx.clearRect(0, 0, width, height);
      // outside: streaks
      ctx.lineCap = "round";
      for (const s of streaks) {
        s.y += s.speed * dt;
        s.x += s.speed * SLANT * dt;
        if (s.y - s.len > height || s.x > width + 20) {
          s.y = rnd(-120, -4);
          s.x = rnd(-height * SLANT, width);
        }
        ctx.strokeStyle = `rgba(214,230,248,${s.a})`;
        ctx.lineWidth = s.w;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.len * SLANT, s.y - s.len);
        ctx.stroke();
      }
      // on the glass: beads and runners
      if (Math.random() < dt * 1.4) spawn();
      let runners = 0;
      for (const d of drops) if (d.run) runners++;
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]!;
        if (!d.run) {
          d.r += dt * 0.16 * k;
          if (d.r > d.limit && runners < MAX_RUN && Math.random() < dt * 0.9) {
            d.run = true;
            runners++;
            d.v = (10 + Math.random() * 24) * k;
            d.from = d.y;
          }
        } else {
          d.wait -= dt;
          if (d.wait <= 0) {
            d.y += d.v * dt;
            d.r = Math.max(1.8 * k, d.r - dt * 0.06 * k);
            if (Math.random() < dt * 0.6) {
              d.wait = 0.5 + Math.random() * 1.8;
              d.v = (10 + Math.random() * 28) * k;
            }
          }
          ctx.strokeStyle = "rgba(205,224,244,0.2)";
          ctx.lineWidth = Math.max(1.2, d.r * 0.7);
          ctx.beginPath();
          ctx.moveTo(d.x, d.from);
          ctx.lineTo(d.x, d.y);
          ctx.stroke();
        }
        if (d.y > height + 12) drops.splice(i, 1);
      }
      // a running drop swallows the beads it touches, and runs a little faster for it
      for (const a of drops) {
        if (!a.run) continue;
        for (let j = drops.length - 1; j >= 0; j--) {
          const b = drops[j]!;
          if (b === a || b.run) continue;
          if (Math.hypot(a.x - b.x, a.y - b.y) < (a.r + b.r) * 0.9) {
            a.r = Math.min(5 * k, Math.sqrt(a.r * a.r + b.r * b.r));
            a.v *= 1.12;
            drops.splice(j, 1);
          }
        }
      }
      for (const d of drops) {
        ctx.fillStyle = "rgba(200,222,244,0.14)";
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = Math.max(0.9, d.r * 0.3);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, Math.PI * 0.05, Math.PI * 0.95); // the lit lower rim of a drop
        ctx.stroke();
      }
    };
    id = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(id);
      ctx.clearRect(0, 0, width, height);
    };
  }, [width, height, active, fps, quality]);

  return <canvas ref={ref} className="gh__rain" style={{ width, height }} aria-hidden="true" />;
}

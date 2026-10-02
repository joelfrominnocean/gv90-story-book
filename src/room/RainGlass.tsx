import { useEffect, useRef } from "react";

interface Bead {
  x: number;
  y: number;
  r: number;
  vy: number;
  /** Seconds until it moves again; beads stick, slide, stick. */
  wait: number;
  sliding: boolean;
  from: number;
  limit: number;
}

/**
 * Rain on a window, drawn on a canvas the size of the glass: streaks falling outside, and beads on the glass that grow, let
 * go, run down in stops and starts, and join each other. Cheap on purpose (a few dozen shapes at 30 frames a second), so the
 * room can stay open on a laptop without the fan coming on. It does not run while `active` is false.
 */
export function RainGlass({ width, height, active }: { width: number; height: number; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !active || width < 8 || height < 8) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(height * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const k = height / 460;
    const beads: Bead[] = [];
    const streaks = Array.from({ length: Math.round(46 * Math.min(1.4, width / 400)) }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      len: (14 + Math.random() * 24) * k,
      v: (520 + Math.random() * 300) * k,
      a: 0.07 + Math.random() * 0.13,
    }));
    const slant = 0.14;
    let last = performance.now();
    let acc = 0;
    let id = 0;

    const spawn = () => {
      if (beads.length > 34) return;
      beads.push({ x: Math.random() * width, y: Math.random() * height * 0.92, r: (1 + Math.random() * 1.8) * k, vy: 0, wait: 0, sliding: false, from: 0, limit: (3 + Math.random() * 2.2) * k });
    };
    for (let i = 0; i < 14; i++) spawn();

    const frame = (now: number) => {
      id = requestAnimationFrame(frame);
      acc += now - last;
      last = now;
      if (acc < 33) return; // about 30 frames a second
      const dt = Math.min(0.08, acc / 1000);
      acc = 0;
      ctx.clearRect(0, 0, width, height);

      // rain falling outside
      ctx.lineWidth = 1;
      for (const s of streaks) {
        s.y += s.v * dt;
        s.x -= s.v * dt * slant;
        if (s.y > height + s.len) {
          s.y = -s.len;
          s.x = Math.random() * (width + 40);
        }
        ctx.strokeStyle = `rgba(214,228,255,${s.a})`;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + s.len * slant, s.y - s.len);
        ctx.stroke();
      }

      if (Math.random() < dt * 2.6) spawn();
      for (let i = beads.length - 1; i >= 0; i--) {
        const b = beads[i]!;
        if (!b.sliding) {
          b.r += dt * 0.28 * k;
          if (b.r > b.limit && Math.random() < dt * 3) {
            b.sliding = true;
            b.vy = (22 + Math.random() * 50) * k;
            b.from = b.y;
          }
        } else {
          b.wait -= dt;
          if (b.wait <= 0) {
            b.y += b.vy * dt;
            b.r = Math.max(1.5 * k, b.r - dt * 0.12 * k);
            b.x += Math.sin(b.y * 0.05) * dt * 4 * k;
            if (Math.random() < dt * 1.1) {
              b.wait = 0.2 + Math.random() * 1.1;
              b.vy = (18 + Math.random() * 56) * k;
            }
          }
          // the trail it leaves behind
          ctx.strokeStyle = "rgba(200,220,250,0.1)";
          ctx.lineWidth = Math.max(1, b.r * 0.55);
          ctx.beginPath();
          ctx.moveTo(b.x, b.from);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        if (b.y > height + 10) beads.splice(i, 1);
      }
      // beads that touch join into one
      for (let i = 0; i < beads.length; i++) {
        for (let j = beads.length - 1; j > i; j--) {
          const a = beads[i]!;
          const c = beads[j]!;
          if (Math.hypot(a.x - c.x, a.y - c.y) < (a.r + c.r) * 0.8) {
            a.r = Math.min(6.4 * k, Math.sqrt(a.r * a.r + c.r * c.r));
            a.y = Math.max(a.y, c.y);
            a.sliding = a.sliding || c.sliding;
            a.vy = Math.max(a.vy, c.vy);
            a.from = Math.min(a.from, c.from);
            beads.splice(j, 1);
          }
        }
      }
      for (const b of beads) {
        ctx.fillStyle = "rgba(190,212,242,0.1)";
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.38)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, Math.PI * 1.05, Math.PI * 1.65);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fillRect(b.x - b.r * 0.35, b.y - b.r * 0.4, Math.max(1, b.r * 0.3), Math.max(1, b.r * 0.3));
      }
    };
    id = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(id);
      ctx.clearRect(0, 0, width, height);
    };
  }, [width, height, active]);

  return <canvas ref={ref} className="room__rain" style={{ width, height }} aria-hidden="true" />;
}

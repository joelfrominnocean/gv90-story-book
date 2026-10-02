/**
 * Rain, built the way rain is built: not a hiss, but thousands of tiny separate impacts, each a little different. Three kinds
 * of impact (a tick on glass, a splash on a leaf or a puddle, a duller thud on a roof) are made once, then scattered
 * at random through long stereo buffers at different densities, pitches, loudnesses and places. A thin sheet of low "wash"
 * (the sound of all the drops too far away to hear one at a time) sits underneath, drifting in strength like gusts.
 *
 * The buffers are long and of different lengths, and every one is placed so that its end wraps round to its start, so they loop
 * without a seam and the layers never line up the same way twice. The work is split into small pieces so the page never stalls.
 *
 * Every impact is a burst of NOISE shaped by a broad filter, never a sine: a pitched impact (a "plink") rings like a bell or a glass
 * chime once there are a hundred a second, and that is exactly the wrong sound for rain. Nothing here has a pitch.
 *
 * This is a stand-in for a real recording (which will always sound better), shaped to behave like one.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const logRand = (a: number, b: number) => Math.exp(rand(Math.log(a), Math.log(b)));
const yieldNow = () => new Promise<void>((r) => setTimeout(r, 0));

export interface RainBuffers {
  /** Close and bright: ticks and splashes on the glass. Wide in the stereo field. */
  glass: AudioBuffer;
  /** Lower and farther: the roof, the leaves, the ground. */
  roof: AudioBuffer;
  /** The distant sheet of rain, in gusts. */
  wash: AudioBuffer;
  /** Big single drips from an eave or a leaf: played one at a time by the caller. */
  plops: AudioBuffer[];
}

/* ---- the three impacts: bursts of noise through a broad band-pass filter, with a fast decay ---- */

/**
 * One burst of noise, shaped by a state-variable band-pass filter. `q` is kept low (under about 1.2) on purpose: a narrow, ringing
 * filter would give the burst a pitch, and a pitch is a bell. `centre` sets the colour (high = a tick, low = a thud), `decay` the length.
 */
function burst(sr: number, centre: number, q: number, decay: number, seconds: number): Float32Array {
  const len = Math.max(8, Math.floor(sr * seconds));
  const a = new Float32Array(len);
  // a trapezoidal state-variable filter: stable at every frequency and Q (the simpler textbook form blows up for bright bursts)
  const g = Math.tan((Math.PI * Math.min(centre, sr * 0.45)) / sr);
  const k = 1 / q;
  const a1 = 1 / (1 + g * (g + k));
  const a2 = g * a1;
  const a3 = g * a2;
  let ic1 = 0;
  let ic2 = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const v3 = rand(-1, 1) - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    // a short, soft attack (no click from the buffer's first sample, and no hard edge to the drop), then an exponential fall
    a[i] = v1 * Math.exp(-t / decay) * (1 - Math.exp(-t / 0.0008));
  }
  // bring every burst to the same peak, so loudness is set by the scatter and not by the filter
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(a[i]!));
  if (peak > 0) for (let i = 0; i < len; i++) a[i]! *= 1 / peak;
  return a;
}

/** A tick on glass: small, soft, over in a few thousandths of a second. Kept below the bright edge so that a thousand of them are a texture, not a rattle. */
const tick = (sr: number) => burst(sr, rand(1800, 4200), rand(0.6, 0.85), rand(0.0016, 0.0038), 0.018);
/** A fine splash: a little lower and rounder than a tick, still short. */
const splash = (sr: number) => burst(sr, rand(1000, 2600), rand(0.5, 0.7), rand(0.004, 0.009), 0.05);
/** A soft thud far off on a roof: low, gentle, well short of a drum. */
const thud = (sr: number) => burst(sr, rand(120, 380), rand(0.5, 0.65), rand(0.02, 0.04), 0.14);

/* ---- scattering them ---- */

async function scatter(
  sr: number,
  seconds: number,
  density: number,
  pick: () => Float32Array,
  gain: [number, number],
  rate: [number, number],
  spread: number,
  targetRms: number,
): Promise<[Float32Array, Float32Array]> {
  const N = Math.floor(sr * seconds);
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  const events = Math.floor(density * seconds);
  for (let e = 0; e < events; e++) {
    const g = pick();
    const r = rand(rate[0], rate[1]);
    const amp = logRand(gain[0], gain[1]);
    const pan = rand(-spread, spread);
    const gl = Math.cos(((pan + 1) * Math.PI) / 4) * amp;
    const gr = Math.sin(((pan + 1) * Math.PI) / 4) * amp;
    const pos = Math.floor(Math.random() * N);
    const outLen = Math.floor(g.length / r);
    for (let k = 0; k < outLen; k++) {
      const x = k * r;
      const i0 = Math.floor(x);
      const fr = x - i0;
      const s = g[i0]! * (1 - fr) + (g[i0 + 1] ?? 0) * fr;
      const idx = (pos + k) % N; // wraps round: the loop has no seam
      L[idx]! += s * gl;
      R[idx]! += s * gr;
    }
    if (e % 250 === 249) await yieldNow();
  }
  normalise(L, R, targetRms);
  return [L, R];
}

function normalise(L: Float32Array, R: Float32Array, rms: number): void {
  let sum = 0;
  for (let i = 0; i < L.length; i += 7) sum += L[i]! * L[i]! + R[i]! * R[i]!;
  const k = rms / Math.sqrt(sum / ((L.length / 7) * 2) || 1);
  for (let i = 0; i < L.length; i++) {
    // a soft ceiling, so the loudest drops stay drops and never clip
    L[i] = Math.tanh(L[i]! * k * 1.4) / 1.4;
    R[i] = Math.tanh(R[i]! * k * 1.4) / 1.4;
  }
}

/** The distant wash: band-limited noise with a slow, wandering level, cross-faded at the ends so it loops. */
async function wash(sr: number, seconds: number, rms: number): Promise<[Float32Array, Float32Array]> {
  const fade = Math.floor(sr * 1.6);
  const N = Math.floor(sr * seconds) + fade;
  const out: Float32Array[] = [];
  for (let ch = 0; ch < 2; ch++) {
    const a = new Float32Array(N);
    let lp1 = 0;
    let lp2 = 0;
    let hp = 0;
    // a slow random walk for the gusts
    let level = 0.8;
    let target = 0.8;
    for (let i = 0; i < N; i++) {
      if (i % Math.floor(sr * 2.2) === 0) target = rand(0.45, 1);
      level += (target - level) * 0.00004;
      const n = rand(-1, 1);
      lp1 += (n - lp1) * 0.13;
      lp2 += (lp1 - lp2) * 0.13;
      hp += (lp2 - hp) * 0.012;
      a[i] = (lp2 - hp) * level;
    }
    if (ch === 0) await yieldNow();
    out.push(a);
  }
  const len = N - fade;
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    L[i] = out[0]![i]!;
    R[i] = out[1]![i]!;
  }
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    L[i] = L[i]! * w + out[0]![len + i]! * (1 - w);
    R[i] = R[i]! * w + out[1]![len + i]! * (1 - w);
  }
  normalise(L, R, rms);
  return [L, R];
}

const toBuffer = (ctx: BaseAudioContext, L: Float32Array, R: Float32Array): AudioBuffer => {
  const b = ctx.createBuffer(2, L.length, ctx.sampleRate);
  b.copyToChannel(L as Float32Array<ArrayBuffer>, 0);
  b.copyToChannel(R as Float32Array<ArrayBuffer>, 1);
  return b;
};

/**
 * Calm rain is fine, close-packed and even: hundreds of small soft drops a second, none much louder than the next, over a steady
 * bed of wash. (A storm is the opposite: a few big separate drops with gaps between them.) So the densities are high, the loudness
 * range is narrow, there are no thuds in the close glass layer, and the heavy drips are rare and soft.
 */
export async function synthRain(ctx: BaseAudioContext): Promise<RainBuffers> {
  const sr = ctx.sampleRate;
  const ticks = Array.from({ length: 40 }, () => tick(sr));
  const splashes = Array.from({ length: 30 }, () => splash(sr));
  const thuds = Array.from({ length: 20 }, () => thud(sr));
  await yieldNow();
  const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
  const pickGlass = () => (Math.random() < 0.72 ? pick(ticks) : pick(splashes));
  const pickRoof = () => {
    const r = Math.random();
    return r < 0.4 ? pick(thuds) : r < 0.8 ? pick(splashes) : pick(ticks);
  };
  const [gl, gr] = await scatter(sr, 23, 520, pickGlass, [0.08, 0.2], [0.9, 1.2], 0.95, 0.06);
  const [rl, rr] = await scatter(sr, 31, 210, pickRoof, [0.05, 0.12], [0.85, 1.1], 0.6, 0.045);
  const [wl, wr] = await wash(sr, 17, 0.07);
  // a few soft drips from an eave, rarely: low noise thuds, gentle, never tones
  const plops = Array.from({ length: 8 }, () => {
    const g = burst(sr, rand(200, 460), rand(0.5, 0.65), rand(0.03, 0.05), 0.2);
    const b = ctx.createBuffer(1, g.length, sr);
    b.copyToChannel(g as Float32Array<ArrayBuffer>, 0);
    return b;
  });
  return { glass: toBuffer(ctx, gl, gr), roof: toBuffer(ctx, rl, rr), wash: toBuffer(ctx, wl, wr), plops };
}

/** Peakiness of a signal: white noise is about 3, rain is far higher because it is made of separate hits. Dev check. */
export function kurtosis(buf: AudioBuffer): number {
  const d = buf.getChannelData(0);
  let m = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 3) {
    m += d[i]!;
    n++;
  }
  m /= n;
  let v = 0;
  let q = 0;
  for (let i = 0; i < d.length; i += 3) {
    const x = d[i]! - m;
    v += x * x;
    q += x * x * x * x;
  }
  return (q / n) / Math.pow(v / n, 2);
}

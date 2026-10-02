import { asset } from "../content/asset";
import { synthRain, kurtosis, type RainBuffers } from "./rainSynth";
import manifest from "./room.manifest.json";

export interface Track {
  title: string;
  /** Path under public/, e.g. "/assets/room/audio/01.m4a". */
  file: string;
  mood: string;
  /** Level correction in dB, so every track plays at about the same loudness. */
  gainDb?: number;
  /** "placeholder" until the music has been decided formally. */
  status: "placeholder" | "final";
  source: string;
}

export const tracks: Track[] = manifest.tracks as Track[];

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** The rain's overall level, as a fraction of what it was: turned down a quarter. One place to change it, for the synthesised rain and for a recording alike. */
const RAIN_TRIM = 0.75;

/**
 * Makes a recording loop without a seam: the last `seconds` are folded into the first `seconds` with an equal-power crossfade, and the
 * buffer is shortened by that much, so that its end runs straight on into its start.
 */
function crossfadeLoop(ctx: BaseAudioContext, buf: AudioBuffer, seconds: number): AudioBuffer {
  const X = Math.min(Math.floor(seconds * buf.sampleRate), Math.floor(buf.length / 3));
  const L = buf.length - X;
  const out = ctx.createBuffer(buf.numberOfChannels, L, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.set(src.subarray(0, L));
    for (let i = 0; i < X; i++) {
      const th = (i / X) * (Math.PI / 2);
      dst[i] = src[i]! * Math.sin(th) + src[L + i]! * Math.cos(th);
    }
  }
  return out;
}

/** The average level of a recording (RMS of its first channel, sampled), so that any recording can be set to one loudness. */
function rmsOf(buf: AudioBuffer): number {
  const d = buf.getChannelData(0);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 7) {
    sum += d[i]! * d[i]!;
    n++;
  }
  return Math.sqrt(sum / Math.max(1, n));
}

/**
 * The room's sound. Everything except the music is synthesised: rain on glass (two wide layers, a low roof layer, and
 * individual drops that never fall in the same pattern), the needle's crackle, the moon jar's ring, and distant thunder.
 * The music is a normal <audio> element routed through a gain node, so it can fade, and so the phone treats it as media.
 *
 * Browsers only let audio start from a tap, so nothing sounds until `unlock()` is called inside one (the needle drop).
 */
export class RoomAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private duckBus!: GainNode;
  private rainBus!: GainNode;
  private rainSoft: BiquadFilterNode | null = null;
  private musicBus!: GainNode;
  private fxBus!: GainNode;
  private el: HTMLAudioElement | null = null;
  private elSource: MediaElementAudioSourceNode | null = null;
  private trackGain: GainNode | null = null;
  private ringBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private idx = 0;
  private sound = false;
  private rainOn = false;
  private rain: RainBuffers | null = null;
  private rainBuilding = false;
  private recordOn = false;
  private timers: number[] = [];
  private dropTimer: number | undefined;
  private crackleTimer: number | undefined;
  /** Called when the current track changes, so the page can show it or set the media controls. */
  onTrack: (t: Track, index: number) => void = () => {};
  /** Called when playback stops or starts for reasons other than a tap (a track list that cannot load, say). */
  onPlaying: (playing: boolean) => void = () => {};

  /** Dev only: how peaky the rain is (white noise is about 3; rain is made of separate hits, so far higher). */
  rainStats(): { glass: number; roof: number; wash: number } | null {
    return this.rain ? { glass: kurtosis(this.rain.glass), roof: kurtosis(this.rain.roof), wash: kurtosis(this.rain.wash) } : null;
  }

  get soundOn(): boolean {
    return this.sound;
  }
  get playing(): boolean {
    return this.recordOn;
  }
  get index(): number {
    return this.idx;
  }

  /** Call inside the tap. Creates and resumes the audio context while the browser still allows it. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.duckBus = ctx.createGain();
      this.rainBus = ctx.createGain();
      this.rainBus.gain.value = 0;
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0;
      this.fxBus = ctx.createGain();
      // A touch of warmth: a record never has the top octave of a stream.
      const warm = ctx.createBiquadFilter();
      warm.type = "lowpass";
      warm.frequency.value = 11000;
      this.musicBus.connect(warm).connect(this.duckBus);
      // the top of the rain is rolled off well below where a drop gets bright: soft rain heard through glass, never a rattle
      const soft = ctx.createBiquadFilter();
      soft.type = "lowpass";
      soft.frequency.value = 4200;
      soft.Q.value = 0.5;
      this.rainSoft = soft;
      this.rainBus.connect(soft).connect(this.duckBus);
      this.fxBus.connect(this.duckBus);
      this.duckBus.connect(this.master).connect(ctx.destination);
      this.noise = this.makeNoise(ctx, 4);
      document.addEventListener("visibilitychange", () => {
        // The picture sleeps when the tab is hidden; the sound carries on (that is the point of leaving it open).
        if (!document.hidden && this.sound) void ctx.resume();
      });
    }
    void this.ctx?.resume();
  }

  /** Master switch: the whole room. Turning it on starts the rain. */
  setSound(on: boolean): void {
    if (!this.ctx) return;
    this.sound = on;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 1 : 0, t, on ? 0.6 : 0.25);
    if (on) {
      void this.ctx.resume();
      this.startRain();
      if (this.recordOn) this.el?.play().catch(() => undefined);
    } else if (this.el && !this.el.paused) {
      // Quiet, then stop reading from the network.
      this.timers.push(window.setTimeout(() => !this.sound && this.el?.pause(), 600));
    }
  }

  /** Quieter while a book is open, so the room is still there behind the page. */
  duck(on: boolean): void {
    if (!this.ctx) return;
    this.duckBus.gain.setTargetAtTime(on ? 0.3 : 1, this.ctx.currentTime, 0.5);
  }

  /* ---------------- the record ---------------- */

  /** Needle down: the thump, the crackle, then the music fades in. */
  playRecord(index = this.idx): void {
    if (!this.ctx || tracks.length === 0) return;
    this.idx = ((index % tracks.length) + tracks.length) % tracks.length;
    this.recordOn = true;
    if (!this.sound) this.setSound(true);
    this.needleDrop();
    this.crackle(true);
    this.timers.push(
      window.setTimeout(() => {
        if (!this.recordOn) return;
        this.load(this.idx);
        const t = this.ctx!.currentTime;
        this.musicBus.gain.cancelScheduledValues(t);
        this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
        this.musicBus.gain.setTargetAtTime(0.85, t, 1.2);
        this.el?.play().catch(() => this.onPlaying(false));
      }, 900),
    );
    this.mediaSession();
  }

  /** Needle up: the music fades out, the crackle ends with a last tick. */
  stopRecord(): void {
    if (!this.ctx) return;
    this.recordOn = false;
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setTargetAtTime(0, t, 0.35);
    this.crackle(false);
    this.tick(0.07);
    this.timers.push(window.setTimeout(() => !this.recordOn && this.el?.pause(), 1500));
  }

  /** Another record: the needle lifts, a gap of crackle, then the next one. */
  next(): void {
    if (!this.ctx) return;
    const to = (this.idx + 1) % Math.max(1, tracks.length);
    this.stopRecord();
    this.timers.push(window.setTimeout(() => this.playRecord(to), 1100));
  }

  private load(i: number): void {
    const track = tracks[i];
    if (!track) return;
    if (!this.el) {
      this.el = new Audio();
      this.el.preload = "auto";
      this.el.loop = false;
      this.el.addEventListener("ended", () => this.recordOn && this.next());
      this.el.addEventListener("error", () => {
        // A file that will not load is skipped; if none load, the needle comes up.
        if (!this.recordOn) return;
        failures++;
        if (failures >= tracks.length) {
          this.stopRecord();
          this.onPlaying(false);
        } else this.next();
      });
      let failures = 0;
      this.el.addEventListener("playing", () => (failures = 0));
      this.elSource = this.ctx!.createMediaElementSource(this.el);
      this.trackGain = this.ctx!.createGain();
      this.elSource.connect(this.trackGain).connect(this.musicBus);
    }
    if (this.trackGain) this.trackGain.gain.value = Math.pow(10, (track.gainDb ?? 0) / 20);
    const url = new URL(track.file, window.location.href).href;
    if (this.el.src !== url) this.el.src = url;
    this.onTrack(track, i);
  }

  private mediaSession(): void {
    if (!("mediaSession" in navigator)) return;
    const track = tracks[this.idx];
    if (!track) return;
    // The lock screen and the browser's media keys show the room as a player, and the controls work: play, pause, next, previous.
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: "The Making of GV90", album: "Listening room" });
    navigator.mediaSession.playbackState = this.recordOn ? "playing" : "paused";
    const set = (a: MediaSessionAction, f: () => void) => {
      try {
        navigator.mediaSession.setActionHandler(a, f);
      } catch {
        /* an action this browser does not offer */
      }
    };
    set("play", () => this.playRecord());
    set("pause", () => {
      this.stopRecord();
      this.onPlaying(false);
    });
    set("stop", () => {
      this.stopRecord();
      this.onPlaying(false);
    });
    set("nexttrack", () => this.next());
    set("previoustrack", () => {
      this.stopRecord();
      this.timers.push(window.setTimeout(() => this.playRecord(this.idx - 1), 1100));
    });
  }

  /* ---------------- the room ---------------- */

  /**
   * The moon jar: a finger on porcelain. A low ring with a little shimmer, a different pitch each time. It is its own small sound,
   * wired straight to the output: touching the jar never starts the rain or a record, and never changes the Sound switch.
   */
  ring(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.ringBus) {
      this.ringBus = ctx.createGain();
      this.ringBus.gain.value = 0.55;
      this.ringBus.connect(ctx.destination);
    }
    const bus = this.ringBus;
    const f0 = [196, 208, 220, 233, 247][Math.floor(Math.random() * 5)]! * rand(0.985, 1.015);
    const now = ctx.currentTime;
    // Partials of a struck vessel are not harmonic.
    [[1, 0.5, 4.2], [2.02, 0.22, 3], [2.76, 0.16, 2.2], [4.1, 0.07, 1.4], [5.4, 0.04, 0.9]].forEach(([ratio, gain, decay]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f0 * ratio!;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain! * 0.5, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decay!);
      o.connect(g).connect(bus);
      o.start(now);
      o.stop(now + decay! + 0.1);
    });
  }

  /** A page of paper turning: a soft swish that rises in pitch, and a small flap at the end. */
  pageTurn(): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.sound) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(3800, t + 0.26);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    src.connect(bp).connect(g).connect(this.fxBus);
    src.start(t, rand(0, 3));
    src.stop(t + 0.4);
    this.timers.push(window.setTimeout(() => this.tick(0.035), 290));
  }

  /** Thunder a few seconds after the flash: far away, low, slow. */
  thunder(afterSeconds = rand(2.4, 4.6)): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.sound) return;
    const t0 = ctx.currentTime + afterSeconds;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(220, t0);
    lp.frequency.exponentialRampToValueAtTime(70, t0 + 5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.9);
    g.gain.exponentialRampToValueAtTime(0.18, t0 + 2.2);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + 2.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 6.5);
    src.connect(lp).connect(g).connect(this.fxBus);
    src.start(t0, rand(0, 2));
    src.stop(t0 + 7);
  }

  /**
   * Audition switch: `?rain=<name>` plays /assets/room/audition/<name>.mp3 in place of the synthesised rain, looped without a seam and set to
   * the loudness of the synthetic rain, so the two can be compared fairly. Those files are not in the repo (they are third-party recordings
   * whose licences have not been traced); if one is missing, the synthesised rain plays as usual. Returns whether a recording is playing.
   */
  private async startRecordedRain(): Promise<boolean> {
    const ctx = this.ctx;
    const name = new URLSearchParams(window.location.search).get("rain");
    if (!ctx || !name || !/^[\w-]+$/.test(name)) return false;
    try {
      const res = await fetch(new URL(asset(`/assets/room/audition/${name}.mp3`), window.location.href).href);
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("audio")) return false;
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      if (this.rainOn || !this.sound) return true;
      const loop = crossfadeLoop(ctx, buf, Math.min(4, buf.duration / 4));
      const src = ctx.createBufferSource();
      src.buffer = loop;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = Math.min(6, 0.1 / Math.max(1e-4, rmsOf(loop)));
      if (this.rainSoft) this.rainSoft.frequency.value = 20000; // a real recording needs no softening
      src.connect(g).connect(this.rainBus);
      src.start(0, rand(0, loop.duration));
      this.rainOn = true;
      this.rainBus.gain.setTargetAtTime(1 * RAIN_TRIM, ctx.currentTime, 2.5);
      return true;
    } catch {
      return false;
    }
  }

  private async startRain(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || this.rainOn || this.rainBuilding) return;
    this.rainBuilding = true; // one attempt at a time while the recording loads
    const recorded = await this.startRecordedRain();
    this.rainBuilding = false;
    if (recorded) return;
    // The buffers take a second or two to make (in small pieces, so nothing stalls); it starts as soon as it is ready.
    if (!this.rain) {
      this.rainBuilding = true;
      this.rain = await synthRain(ctx);
      this.rainBuilding = false;
    }
    if (this.rainOn || !this.sound) return;
    const rain = this.rain;
    this.rainOn = true;
    this.rainBus.gain.setTargetAtTime(0.8 * RAIN_TRIM, ctx.currentTime, 2.5);
    const layer = (buf: AudioBuffer, base: number, spread: number) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = base;
      src.connect(g).connect(this.rainBus);
      src.start(0, rand(0, buf.duration));
      // the level of each layer wanders, slowly and never the same way twice
      const wander = () => {
        g.gain.setTargetAtTime(base * rand(1 - spread, 1 + spread), ctx.currentTime, rand(2, 4));
        this.timers.push(window.setTimeout(wander, rand(3000, 8000)));
      };
      wander();
    };
    layer(rain.glass, 0.6, 0.12);
    layer(rain.roof, 0.3, 0.2);
    layer(rain.wash, 0.7, 0.2);
    // heavy single drips from an eave or a leaf, every few seconds
    const plop = () => {
      this.dropTimer = window.setTimeout(plop, rand(6000, 16000));
      if (!this.sound) return;
      const src = ctx.createBufferSource();
      src.buffer = rain.plops[Math.floor(Math.random() * rain.plops.length)]!;
      src.playbackRate.value = rand(0.9, 1.15);
      const g = ctx.createGain();
      g.gain.value = rand(0.02, 0.05);
      const p = ctx.createStereoPanner();
      p.pan.value = rand(-0.8, 0.8);
      src.connect(g).connect(p).connect(this.rainBus);
      src.start();
    };
    plop();
  }

  /** The surface noise and the clicks of a record. */
  private crackle(on: boolean): void {
    window.clearTimeout(this.crackleTimer);
    if (!on || !this.ctx) return;
    const click = () => {
      this.crackleTimer = window.setTimeout(click, Math.random() < 0.08 ? rand(20, 60) : rand(60, 900));
      if (this.recordOn && this.sound) this.tick(Math.random() < 0.03 ? rand(0.05, 0.1) : rand(0.008, 0.035));
    };
    click();
  }

  private tick(level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = rand(1800, 3500);
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + rand(0.004, 0.02));
    const p = ctx.createStereoPanner();
    p.pan.value = rand(-0.5, 0.5);
    src.connect(hp).connect(g).connect(p).connect(this.fxBus);
    src.start(t, rand(0, 3));
    src.stop(t + 0.03);
  }

  private needleDrop(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.85;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.fxBus);
    o.start(t);
    o.stop(t + 0.25);
    this.timers.push(window.setTimeout(() => this.tick(0.12), 850));
  }

  private makeNoise(ctx: AudioContext, seconds: number): AudioBuffer {
    // Pink-ish noise: white noise with the top rolled off, which is much more like rain than white noise is.
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
    }
    return buf;
  }

  dispose(): void {
    this.timers.forEach(window.clearTimeout);
    window.clearTimeout(this.dropTimer);
    window.clearTimeout(this.crackleTimer);
    this.el?.pause();
    void this.ctx?.close();
  }
}

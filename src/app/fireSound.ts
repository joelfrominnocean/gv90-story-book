/**
 * The fire's crackle, synthesised: a low rumble and random pops, no audio files.
 * Off until the reader turns sound on (browsers will not start audio without a tap anyway).
 * It plays only in the library, and fades out when a book is taken down.
 */
export class FireSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | undefined;
  private wanted = false;
  private noise: AudioBuffer | null = null;

  /** Call this inside the tap that turns sound on: it creates and resumes the audio context while the browser still allows it. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
      // Two seconds of noise, reused for the rumble and every pop.
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02; // brown-ish noise, for the rumble
        d[i] = w * 0.5 + last * 3;
      }
      const rumble = this.ctx.createBufferSource();
      rumble.buffer = this.noise;
      rumble.loop = true;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 260;
      const g = this.ctx.createGain();
      g.gain.value = 0.16;
      rumble.connect(lp).connect(g).connect(this.master);
      rumble.start();
      document.addEventListener("visibilitychange", () => {
        if (!this.ctx) return;
        if (document.hidden) void this.ctx.suspend();
        else if (this.wanted) void this.ctx.resume();
      });
    }
    void this.ctx?.resume();
  }

  /** Fade the fire in or out. Safe to call before `unlock` (it just remembers). */
  set(on: boolean): void {
    this.wanted = on;
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 1 : 0, t, on ? 0.5 : 0.25);
    window.clearTimeout(this.timer);
    if (on) this.schedule();
  }

  private schedule(): void {
    const next = () => {
      if (!this.wanted || !this.ctx) return;
      this.pop();
      // Crackles come in clusters: mostly short gaps, now and then a pause.
      const gap = Math.random() < 0.22 ? 250 + Math.random() * 600 : 25 + Math.random() * 130;
      this.timer = window.setTimeout(next, gap);
    };
    next();
  }

  private pop(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1200 + Math.random() * 5200;
    bp.Q.value = 0.8 + Math.random() * 2.4;
    const g = ctx.createGain();
    const vol = (Math.random() < 0.12 ? 0.55 : 0.16) * (0.4 + Math.random() * 0.6);
    const dur = 0.012 + Math.random() * 0.05;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.02);
  }
}

// Tüm sesler tarayıcıda Web Audio ile üretilir; ses dosyası indirilmez.
// Tarayıcılar sesi ancak bir dokunuş/tıklamadan sonra başlatmaya izin verir.

export type Effect = 'click' | 'water' | 'wind' | 'lava' | 'impact' | 'success' | 'whoosh' | 'shutter';

// Pentatonik, sakin bir dizi (A minör pentatonik)
const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];
const CHORDS = [
  [0, 2, 4],
  [1, 3, 5],
  [2, 4, 6],
  [0, 3, 5],
];

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private fxGain!: GainNode;
  private ambGain!: GainNode;
  private delay!: DelayNode;
  private noise!: AudioBuffer;
  private ambience: { ocean: GainNode; wind: GainNode; lava: GainNode } | null = null;
  private musicOn = true;
  private fxOn = true;
  private musicTimer = 0;
  private chord = 0;
  private lastFx = new Map<Effect, number>();

  constructor() {
    const start = () => {
      this.ensure();
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
  }

  setEnabled(music: boolean, effects: boolean) {
    this.musicOn = music;
    this.fxOn = effects;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(music ? 0.32 : 0, now, 0.5);
    this.fxGain.gain.setTargetAtTime(effects ? 0.6 : 0, now, 0.1);
    this.ambGain.gain.setTargetAtTime(effects ? 0.5 : 0, now, 0.5);
    if (music && !this.musicTimer) this.scheduleMusic();
  }

  /** Gezegenin durumuna göre arka plan sesleri (0..1) */
  setAmbience(ocean: number, wind: number, lava: number) {
    if (!this.ctx || !this.ambience) return;
    const now = this.ctx.currentTime;
    this.ambience.ocean.gain.setTargetAtTime(ocean * 0.22, now, 1.5);
    this.ambience.wind.gain.setTargetAtTime(wind * 0.16, now, 1.5);
    this.ambience.lava.gain.setTargetAtTime(lava * 0.25, now, 1.5);
  }

  play(fx: Effect) {
    if (!this.fxOn || !this.ctx) return;
    // Kaydırıcı sürüklerken sesler üst üste binmesin
    const nowMs = performance.now();
    const minGap = fx === 'click' ? 90 : fx === 'impact' || fx === 'success' ? 0 : 260;
    if (nowMs - (this.lastFx.get(fx) ?? 0) < minGap) return;
    this.lastFx.set(fx, nowMs);
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    switch (fx) {
      case 'click':
        this.tone(880 + Math.random() * 120, t0, 0.06, 0.05, 'sine');
        break;
      case 'water':
        this.noiseBurst(t0, 0.45, 'bandpass', 600, 1800, 0.18);
        break;
      case 'wind':
        this.noiseBurst(t0, 0.6, 'bandpass', 400, 1200, 0.12);
        break;
      case 'lava':
        this.noiseBurst(t0, 0.5, 'lowpass', 180, 90, 0.35);
        this.tone(55, t0, 0.5, 0.15, 'sine');
        break;
      case 'whoosh':
        this.noiseBurst(t0, 0.8, 'bandpass', 300, 2500, 0.15);
        break;
      case 'impact': {
        this.noiseBurst(t0, 2.2, 'lowpass', 900, 60, 0.9);
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(90, t0);
        o.frequency.exponentialRampToValueAtTime(28, t0 + 1.6);
        g.gain.setValueAtTime(0.7, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.8);
        o.connect(g).connect(this.fxGain);
        o.start(t0);
        o.stop(t0 + 1.9);
        break;
      }
      case 'success':
        [0, 2, 4, 7].forEach((n, i) => this.tone(SCALE[Math.min(n, SCALE.length - 1)] * 2, t0 + i * 0.12, 0.9, 0.12, 'triangle'));
        break;
      case 'shutter':
        this.noiseBurst(t0, 0.08, 'highpass', 3000, 3000, 0.3);
        this.noiseBurst(t0 + 0.09, 0.06, 'highpass', 2500, 2500, 0.2);
        break;
    }
  }

  private ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    // Uzay hissi için geri beslemeli gecikme
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    this.delay.connect(lp).connect(fb).connect(this.delay);
    lp.connect(wet).connect(this.master);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);
    this.musicGain.connect(this.delay);
    this.fxGain = ctx.createGain();
    this.fxGain.gain.value = this.fxOn ? 0.6 : 0;
    this.fxGain.connect(this.master);
    this.ambGain = ctx.createGain();
    this.ambGain.gain.value = 0;
    this.ambGain.connect(this.master);

    // Beyaz gürültü tamponu
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.ambience = {
      ocean: this.loopNoise('lowpass', 500, 0.09),
      wind: this.loopNoise('bandpass', 700, 0.23),
      lava: this.loopNoise('lowpass', 120, 0.05),
    };
    this.setEnabled(this.musicOn, this.fxOn);
  }

  private loopNoise(type: BiquadFilterType, freq: number, lfoRate: number): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const swell = ctx.createGain();
    swell.gain.value = 0.6;
    // Dalga gibi yavaş kabarıp sönme
    const lfo = ctx.createOscillator();
    lfo.frequency.value = lfoRate;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.4;
    lfo.connect(lfoAmt).connect(swell.gain);
    const level = ctx.createGain();
    level.gain.value = 0;
    src.connect(f).connect(swell).connect(level).connect(this.ambGain);
    src.start();
    lfo.start();
    return level;
  }

  private tone(freq: number, t0: number, dur: number, vol: number, type: OscillatorType, dest: AudioNode = this.fxGain) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noiseBurst(t0: number, dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = type === 'bandpass' ? 1.2 : 0.7;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.08, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.fxGain);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  /** Yavaş değişen akorlar ve arada bir çan sesi: sakin uzay müziği */
  private scheduleMusic() {
    if (!this.ctx) return;
    const step = () => {
      if (!this.ctx || !this.musicOn) {
        this.musicTimer = 0;
        return;
      }
      const t0 = this.ctx.currentTime + 0.05;
      const chord = CHORDS[this.chord % CHORDS.length];
      this.chord++;
      for (const n of chord) this.pad(SCALE[n] / 2, t0, 9);
      if (Math.random() < 0.7) {
        const note = SCALE[Math.floor(Math.random() * SCALE.length)];
        this.tone(note * 2, t0 + 2 + Math.random() * 4, 3.5, 0.05, 'sine', this.musicGain);
      }
      this.musicTimer = window.setTimeout(step, 8000);
    };
    step();
  }

  private pad(freq: number, t0: number, dur: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.06, t0 + 3);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    for (const detune of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(f);
      o.start(t0);
      o.stop(t0 + dur + 0.1);
    }
    f.connect(g).connect(this.musicGain);
  }
}

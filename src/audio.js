/**
 * Tiny procedural audio engine. No samples, no network — every boom is
 * generated from oscillators and shaped noise so the game stays self-contained.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambientGain = null;
    this.muted = false;
    this.started = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.42;
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 20;
    compressor.ratio.value = 9;
    this.master.connect(compressor).connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoise(2.4);
    this.startAmbient();
    this.started = true;
  }

  makeNoise(seconds) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  startAmbient() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 310;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.018;
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.01;
    lfo.connect(lfoGain).connect(gain.gain);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    lfo.start();
    this.ambientGain = gain;
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(muted ? 0 : 0.42, now, 0.04);
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  tone({ freq = 220, endFreq = freq, type = 'sine', dur = 0.2, gain = 0.18, delay = 0, attack = 0.006 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise({ dur = 0.4, gain = 0.2, freq = 900, q = 0.7, type = 'lowpass', delay = 0, sweepTo = null }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(env).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  play(name, intensity = 1) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'ui':
        this.tone({ freq: 560, endFreq: 720, type: 'square', dur: 0.07, gain: 0.035 });
        break;
      case 'select':
        this.tone({ freq: 380, endFreq: 560, type: 'triangle', dur: 0.09, gain: 0.06 });
        break;
      case 'deny':
        this.tone({ freq: 160, endFreq: 110, type: 'sawtooth', dur: 0.16, gain: 0.05 });
        break;
      case 'deploy':
        this.tone({ freq: 90, endFreq: 180, type: 'sawtooth', dur: 0.5, gain: 0.09 });
        this.tone({ freq: 300, endFreq: 600, type: 'triangle', dur: 0.4, gain: 0.05, delay: 0.15 });
        this.tone({ freq: 600, endFreq: 900, type: 'square', dur: 0.22, gain: 0.035, delay: 0.32 });
        break;
      case 'shoot':
        this.noise({ dur: 0.5, gain: 0.34, freq: 1600, sweepTo: 180 });
        this.tone({ freq: 170, endFreq: 48, type: 'sawtooth', dur: 0.42, gain: 0.16 });
        this.noise({ dur: 0.3, gain: 0.08, freq: 3200, type: 'highpass' });
        break;
      case 'launch':
        this.noise({ dur: 0.7, gain: 0.13, freq: 600, sweepTo: 2200, type: 'bandpass', q: 1.4 });
        break;
      case 'explode':
        this.noise({ dur: 0.9 + intensity * 0.25, gain: 0.5, freq: 1100, sweepTo: 60 });
        this.tone({ freq: 130, endFreq: 28, type: 'sine', dur: 0.85, gain: 0.34 });
        this.tone({ freq: 74, endFreq: 22, type: 'triangle', dur: 1.15, gain: 0.24, delay: 0.03 });
        this.noise({ dur: 0.15, gain: 0.14, freq: 4200, type: 'highpass' });
        break;
      case 'build':
        this.tone({ freq: 240, endFreq: 120, type: 'square', dur: 0.09, gain: 0.07 });
        this.noise({ dur: 0.08, gain: 0.12, freq: 1300, type: 'bandpass', q: 1.2 });
        break;
      case 'buildMetal':
        this.tone({ freq: 680, endFreq: 430, type: 'triangle', dur: 0.18, gain: 0.07 });
        this.tone({ freq: 1020, endFreq: 720, type: 'sine', dur: 0.25, gain: 0.04, delay: 0.02 });
        break;
      case 'harvest':
        this.noise({ dur: 0.15, gain: 0.17, freq: 700, type: 'bandpass', q: 1.6 });
        this.tone({ freq: 310, endFreq: 210, type: 'sawtooth', dur: 0.12, gain: 0.06 });
        break;
      case 'hurt':
        this.tone({ freq: 380, endFreq: 120, type: 'sawtooth', dur: 0.25, gain: 0.09 });
        break;
      case 'jump':
        this.tone({ freq: 210, endFreq: 410, type: 'triangle', dur: 0.13, gain: 0.04 });
        break;
      case 'land':
        this.tone({ freq: 110, endFreq: 65, type: 'sine', dur: 0.1, gain: 0.06 });
        break;
      case 'bounce':
        this.tone({ freq: 300, endFreq: 190, type: 'square', dur: 0.08, gain: 0.035 });
        break;
      case 'splash':
        this.noise({ dur: 0.5, gain: 0.18, freq: 1300, sweepTo: 420, type: 'bandpass', q: 0.8 });
        break;
      case 'turn':
        this.tone({ freq: 440, type: 'triangle', dur: 0.13, gain: 0.04 });
        this.tone({ freq: 660, type: 'triangle', dur: 0.18, gain: 0.04, delay: 0.09 });
        break;
      case 'victory':
        [392, 523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.36, gain: 0.075, delay: i * 0.12 }));
        this.noise({ dur: 0.7, gain: 0.05, freq: 6200, type: 'highpass', delay: 0.5 });
        break;
      case 'defeat':
        [330, 294, 247, 196].forEach((f, i) => this.tone({ freq: f, endFreq: f * 0.94, type: 'sawtooth', dur: 0.5, gain: 0.05, delay: i * 0.17 }));
        break;
      case 'tick':
        this.tone({ freq: 780, type: 'square', dur: 0.025, gain: 0.018 });
        break;
      case 'charge':
        this.tone({ freq: 220, endFreq: 560, type: 'sine', dur: 0.5, gain: 0.035 });
        break;
      default:
        break;
    }
  }
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
  }

  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.22 : 0;
  }

  noise(duration = 0.08, filterFreq = 2400, gain = 0.18) {
    const ctx = this.ensure();
    if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(this.master);
    src.start();
  }

  tone(freq = 880, duration = 0.07, type = 'sine', gain = 0.12) {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(g).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.01);
  }

  click() { this.noise(0.035, 3200, 0.13); this.tone(1650, 0.025, 'square', 0.035); }
  tap() { this.noise(0.05, 1800, 0.1); }
  slide() { this.noise(0.18, 900, 0.1); }
  insert() { this.noise(0.08, 1200, 0.14); this.tone(420, 0.08, 'sine', 0.06); }
  eject() { this.noise(0.1, 1600, 0.12); this.tone(300, 0.09, 'sine', 0.05); }
  powerOn() { this.tone(220, 0.25, 'sine', 0.08); setTimeout(() => this.tone(440, 0.18, 'sine', 0.06), 120); }
  powerOff() { this.tone(330, 0.18, 'sine', 0.06); setTimeout(() => this.tone(165, 0.22, 'sine', 0.05), 90); }
  success() { this.tone(660, 0.1, 'sine', 0.07); setTimeout(() => this.tone(880, 0.16, 'sine', 0.06), 90); }
  error() { this.tone(180, 0.18, 'square', 0.05); }
  scan() { this.tone(1200, 0.05, 'sine', 0.04); }
}

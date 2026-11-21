// Synthesized WebAudio sound only: no audio files. Engine hum, siren, gunshot,
// pickup chime, cash register, punch thud, and a looping synthwave bass line.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.musicOn = false;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Engine hum: two detuned saws through a lowpass, gain follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineOsc2 = this.ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 55.7;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp); engineOsc2.connect(lp);
    lp.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); engineOsc2.start();
    this._engineOsc2 = engineOsc2;
    // Police siren: triangle sweeping between two tones.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 0.55;
    const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 180;
    this.sirenLfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start(); this.sirenLfo.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  setEngine(speed01, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + speed01 * 0.09 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    const f = 48 + speed01 * 130;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.1);
    if (this._engineOsc2) this._engineOsc2.frequency.setTargetAtTime(f * 1.012, t, 0.1);
  }

  setSiren(on) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }

  _noiseBurst(dur, filterFreq, gainVal, type) {
    if (!this.ctx) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = type || 'lowpass'; flt.frequency.value = filterFreq;
    const g = this.ctx.createGain(); g.gain.value = gainVal;
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start();
  }

  _tone(freq, dur, type, gainVal, slideTo) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainVal, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(this.ctx.currentTime + dur + 0.02);
  }

  gunshot() { this._noiseBurst(0.16, 1800, 0.5, 'lowpass'); this._tone(160, 0.1, 'square', 0.22, 60); }
  punch() { this._noiseBurst(0.09, 500, 0.4, 'lowpass'); }
  reload() { this._tone(900, 0.06, 'square', 0.12); setTimeout(() => this._tone(1300, 0.06, 'square', 0.12), 110); }
  pickup() { this._tone(660, 0.1, 'sine', 0.22); setTimeout(() => this._tone(990, 0.16, 'sine', 0.22), 90); }
  cash() { this._tone(880, 0.09, 'triangle', 0.22); setTimeout(() => this._tone(1174, 0.09, 'triangle', 0.22), 80); setTimeout(() => this._tone(1568, 0.2, 'triangle', 0.22), 160); }
  crash() { this._noiseBurst(0.3, 900, 0.5, 'lowpass'); this._tone(90, 0.25, 'sine', 0.3, 40); }
  wantedUp() { this._tone(220, 0.18, 'square', 0.16, 440); }
  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 'triangle', 0.22), i * 120));
  }

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    // A minor synthwave bass line: A1 F1 C2 G1, 8th notes at 112 BPM.
    const bass = [55, 55, 43.65, 43.65, 65.41, 65.41, 49, 49];
    const stepDur = 60 / 112 / 2;
    const tick = () => {
      if (!this.musicOn || !this.ctx) return;
      const f = bass[this.musicStep % bass.length];
      this.musicStep++;
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 600;
      const g = this.ctx.createGain();
      const t = this.ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.075, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 0.95);
      o.connect(lp); lp.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + stepDur);
      // Sparse sparkle note every bar.
      if (this.musicStep % 16 === 0) this._tone(880 * (this.musicStep % 32 === 0 ? 1 : 1.5), 0.5, 'sine', 0.03);
      this.musicTimer = setTimeout(tick, stepDur * 1000);
    };
    tick();
  }

  stopMusic() { this.musicOn = false; if (this.musicTimer) clearTimeout(this.musicTimer); }
}

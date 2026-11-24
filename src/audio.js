// Procedural WebAudio sound effects for switches, pull-chains, fan speeds, footsteps, and victory chimes!

class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Crisp mechanical wall-switch click-clack
  playSwitch(isOn) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isOn ? 520 : 380, now);
    osc.frequency.exponentialRampToValueAtTime(isOn ? 980 : 210, now + 0.045);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  }

  // Pull-chain clink-tug + fan speed whoosh tone
  playFanSpeed(speedIndex) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // 1. Metallic pull-chain bead clink
    const clinkOsc = this.ctx.createOscillator();
    const clinkGain = this.ctx.createGain();
    clinkOsc.type = 'sine';
    const baseFreqs = [340, 520, 680, 880];
    const targetFreq = baseFreqs[speedIndex] || 440;

    clinkOsc.frequency.setValueAtTime(1200, now);
    clinkOsc.frequency.exponentialRampToValueAtTime(targetFreq, now + 0.09);

    clinkGain.gain.setValueAtTime(0.24, now);
    clinkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    clinkOsc.connect(clinkGain);
    clinkGain.connect(this.ctx.destination);
    clinkOsc.start(now);
    clinkOsc.stop(now + 0.12);

    // 2. Soft musical speed indicator note
    const noteOsc = this.ctx.createOscillator();
    const noteGain = this.ctx.createGain();
    noteOsc.type = 'triangle';
    noteOsc.frequency.setValueAtTime(targetFreq, now + 0.04);

    noteGain.gain.setValueAtTime(0.18, now + 0.04);
    noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    noteOsc.connect(noteGain);
    noteGain.connect(this.ctx.destination);
    noteOsc.start(now + 0.04);
    noteOsc.stop(now + 0.25);
  }

  // Cheerful arpeggio when a checklist goal is completed!
  playTaskComplete() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const now = this.ctx.currentTime + idx * 0.075;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.27);
    });
  }

  // Fanfare when the whole house checklist is cleared!
  playHouseCleared() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const melody = [
      { f: 523.25, t: 0.0, d: 0.14 },
      { f: 659.25, t: 0.12, d: 0.14 },
      { f: 783.99, t: 0.24, d: 0.14 },
      { f: 1046.5, t: 0.36, d: 0.35 },
      { f: 987.77, t: 0.56, d: 0.14 },
      { f: 1046.5, t: 0.70, d: 0.45 },
    ];

    melody.forEach((n) => {
      const start = this.ctx.currentTime + n.t;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, start);

      gain.gain.setValueAtTime(0.24, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + n.d);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + n.d + 0.02);
    });
  }

  // Subtle wooden floor footstep
  playStep() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(115 + Math.random() * 25, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.06);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }
}

export const sound = new SoundManager();

// Sound, made rather than loaded: every noise here is an oscillator or a burst of noise shaped by
// a filter, so the game ships no audio file at all. The engine follows the car's speed, the siren
// follows the nearest cruiser, and the radio is a slow arpeggio from one of four scales.
import { RADIO } from './config.js';

const MUSIC_VOLUME = 0.1;

export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let step = 0;
  let nextNote = 0;
  let station = 0;
  let listener = { x: 0, y: 0 };

  const ensure = () => {
    if (ctx) return ctx;
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.85;
    master.connect(ctx.destination);

    // A second of white noise, reused by every bang and skid.
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

    // The engine: a sawtooth through a low-pass, quiet until a car is driven.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();

    // The siren: one tone, bent up and down, silent until the police are close.
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 720;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
    return ctx;
  };

  const at = (x, y) => {
    const d = Math.hypot(x - listener.x, y - listener.y);
    return Math.max(0, 1 - d / 1400);
  };

  const burst = (x, y, { freq = 900, q = 1, gain = 0.5, decay = 0.16, type = 'lowpass', sweep = 0 }) => {
    if (!ensure() || muted) return;
    const amount = at(x, y);
    if (amount <= 0.02) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const env = ctx.createGain();
    const now = ctx.currentTime;
    env.gain.setValueAtTime(gain * amount, now);
    env.gain.exponentialRampToValueAtTime(0.0008, now + decay);
    if (sweep) filter.frequency.linearRampToValueAtTime(Math.max(120, freq + sweep), now + decay);
    src.connect(filter).connect(env).connect(master);
    src.start(now);
    src.stop(now + decay + 0.02);
  };

  const tone = (x, y, { freq = 440, type = 'square', gain = 0.16, decay = 0.2, slide = 0 }) => {
    if (!ensure() || muted) return;
    const amount = at(x, y);
    if (amount <= 0.02) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    const env = ctx.createGain();
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), now + decay);
    env.gain.setValueAtTime(gain * amount, now);
    env.gain.exponentialRampToValueAtTime(0.0008, now + decay);
    osc.connect(env).connect(master);
    osc.start(now);
    osc.stop(now + decay + 0.02);
  };

  const audio = {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.85;
      return muted;
    },
    setListener(x, y) {
      listener.x = x;
      listener.y = y;
    },
    shot(weapon, x, y) {
      burst(x, y, { freq: weapon === 'costa' ? 520 : 1500, gain: 0.55, decay: weapon === 'costa' ? 0.3 : 0.13, sweep: -900 });
      tone(x, y, { freq: 150, type: 'square', gain: 0.1, decay: 0.07, slide: -90 });
    },
    punch(x, y) {
      burst(x, y, { freq: 320, gain: 0.3, decay: 0.09 });
    },
    explosion(x, y) {
      burst(x, y, { freq: 260, gain: 0.85, decay: 0.9, sweep: -200 });
      tone(x, y, { freq: 60, type: 'sine', gain: 0.4, decay: 0.7, slide: -30 });
    },
    crash(x, y) {
      burst(x, y, { freq: 1800, gain: 0.35, decay: 0.22, sweep: -1200 });
    },
    door(x, y) {
      burst(x, y, { freq: 700, gain: 0.22, decay: 0.1 });
    },
    pickup(kind) {
      tone(listener.x, listener.y, { freq: kind === 'cash' ? 880 : 660, type: 'triangle', gain: 0.16, decay: 0.18, slide: 220 });
    },
    footstep(x, y, loud) {
      if (!loud) return;
      burst(x, y, { freq: 240, gain: 0.05, decay: 0.05 });
    },
    reload() {
      burst(listener.x, listener.y, { freq: 1200, gain: 0.14, decay: 0.07 });
    },
    wanted(level) {
      tone(listener.x, listener.y, { freq: 320 + level * 60, type: 'sawtooth', gain: 0.18, decay: 0.35, slide: 140 });
    },
    missionStart() {
      tone(listener.x, listener.y, { freq: 392, type: 'triangle', gain: 0.2, decay: 0.5 });
    },
    objective() {
      tone(listener.x, listener.y, { freq: 660, type: 'triangle', gain: 0.14, decay: 0.25, slide: 120 });
    },
    missionDone() {
      tone(listener.x, listener.y, { freq: 523, type: 'triangle', gain: 0.2, decay: 0.6 });
      tone(listener.x, listener.y, { freq: 784, type: 'triangle', gain: 0.14, decay: 0.8 });
    },
    /**
     * Called every frame: the engine note follows the car's speed, the siren the nearest cruiser,
     * and the radio plays a note or two ahead of the clock so nothing stutters.
     */
    update(dt, game) {
      if (!ctx) return;
      const now = ctx.currentTime;
      const p = game.player;
      const driving = p.mode === 'car' && p.car;
      const speed = driving ? Math.abs(p.car.speed) : 0;
      if (engineGain) {
        const target = driving && !muted ? 0.05 + Math.min(0.06, speed / 8000) : 0;
        engineGain.gain.setTargetAtTime(target, now, 0.15);
        engineOsc.frequency.setTargetAtTime(52 + speed * 0.16, now, 0.1);
        engineFilter.frequency.setTargetAtTime(300 + speed * 1.4, now, 0.1);
      }
      if (sirenGain) {
        let nearest = Infinity;
        for (const car of game.cars) {
          if (!car.police) continue;
          nearest = Math.min(nearest, Math.hypot(car.x - p.x, car.y - p.y));
        }
        const amount = nearest < 1200 ? (1 - nearest / 1200) * 0.16 : 0;
        sirenGain.gain.setTargetAtTime(muted ? 0 : amount, now, 0.2);
        sirenOsc.frequency.setTargetAtTime(620 + Math.sin(now * 3.1) * 240, now, 0.05);
      }

      // The radio: a note every eighth, a bass under it every other bar.
      if (game.music && !muted && now > nextNote) {
        const scale = RADIO[station % RADIO.length];
        const beat = 0.26;
        const note = scale.scale[(step * 3) % scale.scale.length] + (step % 8 === 0 ? 12 : 0);
        const freq = scale.root * 2 ** (note / 12);
        const osc = ctx.createOscillator();
        osc.type = step % 4 === 0 ? 'triangle' : 'sine';
        osc.frequency.value = freq;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(MUSIC_VOLUME, now + 0.02);
        env.gain.exponentialRampToValueAtTime(0.0006, now + beat * 1.7);
        osc.connect(env).connect(master);
        osc.start(now);
        osc.stop(now + beat * 1.9);
        if (step % 4 === 0) {
          const bass = ctx.createOscillator();
          bass.type = 'sawtooth';
          bass.frequency.value = scale.root / 2;
          const benv = ctx.createGain();
          benv.gain.setValueAtTime(0, now);
          benv.gain.linearRampToValueAtTime(MUSIC_VOLUME * 0.9, now + 0.03);
          benv.gain.exponentialRampToValueAtTime(0.0006, now + beat * 2.2);
          bass.connect(benv).connect(master);
          bass.start(now);
          bass.stop(now + beat * 2.4);
        }
        step += 1;
        nextNote = now + beat;
      }
      void dt;
    },
    setStation(index) {
      station = index % RADIO.length;
      return RADIO[station];
    },
    get stationIndex() {
      return station;
    },
  };
  return audio;
}

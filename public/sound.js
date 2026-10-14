// Tete 21 sounds, synthesised with Web Audio: nothing to download, works offline.
(() => {
  'use strict';
  let ctx = null, master = null, verb = null, muted = false, vol = 0.7, noiseBuf = null;
  try { muted = localStorage.getItem('tete.mute') === '1'; const v = parseFloat(localStorage.getItem('tete.vol')); if (!isNaN(v)) vol = v; } catch {}

  // master volume and a small room, so chimes and fanfares ring
  function graph(c) {
    const m = c.createGain(); m.gain.value = muted ? 0 : vol; m.connect(c.destination);
    const v = c.createConvolver();
    const len = Math.floor(c.sampleRate * 1.4), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    v.buffer = ir; const vg = c.createGain(); vg.gain.value = 0.22; v.connect(vg); vg.connect(m);
    return { m, v };
  }
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); const g = graph(ctx); master = g.m; verb = g.v;
    return ctx;
  }
  function noise() {
    if (noiseBuf) return noiseBuf;
    const len = ctx.sampleRate; noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function out(node, wet) { node.connect(master); if (wet) { const g = ctx.createGain(); g.gain.value = wet; node.connect(g); g.connect(verb); } }
  function env(g, t, a, peak, d, end = 0.0001) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); }
  // filtered noise: card flicks, slides, riffles, paper notes
  function burst(t, { dur = 0.06, freq = 3000, q = 1.2, gain = 0.5, type = 'bandpass', sweepTo = null, wet = 0 } = {}) {
    const src = ctx.createBufferSource(); src.buffer = noise(); src.loop = true; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur); f.Q.value = q;
    const g = ctx.createGain(); env(g, t, 0.004, gain, dur);
    src.connect(f); f.connect(g); out(g, wet); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  // struck tones: chips, chimes, ticks
  function tone(t, { f = 880, type = 'sine', dur = 0.15, gain = 0.3, a = 0.003, wet = 0, slideTo = null } = {}) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain(); env(g, t, a, gain, dur); o.connect(g); out(g, wet); o.start(t); o.stop(t + a + dur + 0.05);
  }
  function clink(t, gain = 0.22) { const base = 2200 + Math.random() * 900; [1, 1.47, 2.09].forEach((m, i) => tone(t + i * 0.002, { f: base * m, type: i ? 'sine' : 'triangle', dur: 0.07 + Math.random() * 0.05, gain: gain / (i + 1), wet: 0.15 })); }
  // a bright brass voice for fanfares (two detuned saws through an opening filter, with vibrato)
  function brass(t, f, dur, gain = 0.16) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(); o.type = o2.type = 'sawtooth'; o.frequency.value = f; o2.frequency.value = f * 1.004;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t); lp.frequency.exponentialRampToValueAtTime(3200, t + 0.08); lp.frequency.exponentialRampToValueAtTime(1400, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.04); g.gain.setValueAtTime(gain, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = f * 0.006; vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
    o.connect(lp); o2.connect(lp); lp.connect(g); out(g, 0.35); [o, o2, vib].forEach(x => { x.start(t); x.stop(t + dur + 0.1); });
  }
  const N = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B3: 246.94, Cs4: 277.18, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5, G6: 1568, A6: 1760 };
  const SOUNDS = {
    flick(t) { burst(t, { dur: 0.05, freq: 3800, q: 0.9, gain: 0.35, sweepTo: 1800 }); },
    deal(t) { burst(t, { dur: 0.09, freq: 5200, q: 0.7, gain: 0.3, sweepTo: 1400 }); burst(t + 0.07, { dur: 0.03, freq: 2400, q: 2, gain: 0.16 }); },
    flip(t) { burst(t, { dur: 0.025, freq: 2600, q: 3, gain: 0.26 }); burst(t + 0.035, { dur: 0.04, freq: 3400, q: 2, gain: 0.2 }); },
    shuffle(t) {
      for (let i = 0; i < 26; i++) { const k = i / 26; burst(t + k * k * 0.55 + i * 0.012, { dur: 0.02, freq: 2400 + Math.random() * 1800, q: 2.5, gain: 0.16 + 0.1 * Math.sin(k * Math.PI) }); }
      burst(t + 0.78, { dur: 0.18, freq: 3000, q: 0.6, gain: 0.24, sweepTo: 900 }); burst(t + 0.95, { dur: 0.05, freq: 1800, q: 1.5, gain: 0.28 });
    },
    chip(t) { clink(t); },
    chips(t) { const n = 4 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) clink(t + i * (0.03 + Math.random() * 0.03), 0.18); },
    pot(t) { for (let i = 0; i < 10; i++) clink(t + i * 0.045 + Math.random() * 0.02, 0.16); burst(t, { dur: 0.35, freq: 2200, q: 0.5, gain: 0.12, sweepTo: 900 }); },
    turn(t) { tone(t, { f: N.E6, dur: 0.25, gain: 0.18, wet: 0.4 }); tone(t + 0.12, { f: N.A6, dur: 0.4, gain: 0.16, wet: 0.5 }); },
    tick(t) { tone(t, { f: 1500, type: 'square', dur: 0.03, gain: 0.05 }); tone(t, { f: 900, dur: 0.06, gain: 0.08 }); },
    trick(t) { burst(t, { dur: 0.03, freq: 2000, q: 2, gain: 0.3 }); tone(t + 0.02, { f: N.G5, dur: 0.18, gain: 0.14, wet: 0.3 }); tone(t + 0.1, { f: N.C6, dur: 0.3, gain: 0.14, wet: 0.4 }); },
    win(t) { [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => tone(t + i * 0.09, { f, type: 'triangle', dur: 0.35, gain: 0.2, wet: 0.4 })); tone(t + 0.36, { f: N.E6, dur: 0.6, gain: 0.14, wet: 0.6 }); },
    big21(t) { SOUNDS.win(t); for (let i = 0; i < 10; i++) tone(t + 0.45 + i * 0.06, { f: N.C6 * Math.pow(2, (i % 5) / 5), dur: 0.2, gain: 0.07, wet: 0.6 }); },
    adasi(t) {
      brass(t, N.G4, 0.14, 0.12); brass(t + 0.15, N.G4, 0.14, 0.12);
      [N.C5, N.E5, N.G5].forEach(f => brass(t + 0.32, f, 1.1, 0.11)); brass(t + 0.32, N.C4, 1.1, 0.1);
      burst(t + 0.32, { dur: 1.2, freq: 6000, q: 0.4, gain: 0.22, type: 'highpass' });
      for (let i = 0; i < 14; i++) tone(t + 0.4 + i * 0.07, { f: N.C6 * Math.pow(2, (i % 7) / 7), dur: 0.2, gain: 0.06, wet: 0.6 });
      tone(t + 0.32, { f: 65, dur: 0.5, gain: 0.4, slideTo: 45 });
    },
    series(t) {
      tone(t, { f: 80, dur: 0.5, gain: 0.5, slideTo: 38 }); burst(t, { dur: 0.12, freq: 400, q: 0.8, gain: 0.4, type: 'lowpass' });
      [N.D4, N.Cs4, N.C4, N.B3].forEach((f, i) => brass(t + 0.35 + i * 0.28, f, i === 3 ? 0.9 : 0.26, 0.12));
    },
    error(t) { tone(t, { f: 150, type: 'square', dur: 0.12, gain: 0.06 }); tone(t + 0.13, { f: 120, type: 'square', dur: 0.16, gain: 0.06 }); },
    pop(t) { tone(t, { f: 600, dur: 0.08, gain: 0.15, slideTo: 1300 }); },
    join(t) { tone(t, { f: N.C6, dur: 0.18, gain: 0.1, wet: 0.4 }); tone(t + 0.1, { f: N.G6, dur: 0.3, gain: 0.08, wet: 0.5 }); },
    spray(t) { for (let i = 0; i < 18; i++) burst(t + i * 0.035 + Math.random() * 0.02, { dur: 0.04, freq: 1500 + Math.random() * 1500, q: 1.5, gain: 0.12 }); for (let i = 0; i < 5; i++) clink(t + 0.1 + i * 0.08, 0.12); },
    whoosh(t) { burst(t, { dur: 0.25, freq: 600, q: 0.7, gain: 0.18, sweepTo: 3000 }); },
    clink(t) { [2637, 3951, 5274].forEach((f, i) => tone(t + i * 0.004, { f: f * (0.99 + Math.random() * 0.02), dur: 0.5 - i * 0.12, gain: 0.09 / (i + 1), wet: 0.6 })); tone(t + 0.09, { f: 3136, dur: 0.35, gain: 0.05, wet: 0.6 }); },
    pour(t) { burst(t, { dur: 0.5, freq: 900, q: 2, gain: 0.08, sweepTo: 1800 }); for (let i = 0; i < 6; i++) tone(t + 0.05 + i * 0.07, { f: 500 + i * 90 + Math.random() * 60, dur: 0.05, gain: 0.03 }); },
    // a win streak catches fire: a roaring swell with crackles, hotter the longer the run
    flare(t, n = 2) {
      const k = Math.min(1, (n - 1) / 4);
      burst(t, { dur: 0.55 + k * 0.3, freq: 260, q: 0.6, gain: 0.22 + k * 0.12, type: 'lowpass', sweepTo: 2600 + k * 1800, wet: 0.3 });
      for (let i = 0; i < 9 + n * 2; i++) burst(t + 0.05 + Math.random() * (0.5 + k * 0.3), { dur: 0.012, freq: 2500 + Math.random() * 3500, q: 3, gain: 0.08 + Math.random() * 0.08 });
      tone(t + 0.04, { f: 196, dur: 0.5, gain: 0.07, slideTo: 392 + k * 200, wet: 0.3 });
    },
    // a run goes cold
    fizzle(t) { burst(t, { dur: 0.6, freq: 2600, q: 1.1, gain: 0.12, sweepTo: 260, wet: 0.2 }); tone(t + 0.05, { f: 330, dur: 0.4, gain: 0.05, slideTo: 140 }); },
    // twenty-one: a brass "ta-da" over bells
    twentyone(t) {
      brass(t, N.G4, 0.12, 0.11);
      [N.C5, N.E5, N.G5].forEach(f => brass(t + 0.14, f, 0.85, 0.09)); brass(t + 0.14, N.C4, 0.85, 0.08);
      [N.C6, N.E6, N.G6].forEach((f, i) => tone(t + 0.14 + i * 0.07, { f, dur: 0.7, gain: 0.07, wet: 0.6 }));
      SOUNDS.sparkle(t + 0.2); tone(t + 0.14, { f: 65, dur: 0.35, gain: 0.3, slideTo: 44 });
    },
    // launch intro
    boom(t) { tone(t, { f: 72, dur: 0.9, gain: 0.55, slideTo: 32 }); tone(t, { f: 144, dur: 0.22, gain: 0.18, slideTo: 60 }); burst(t, { dur: 0.35, freq: 190, q: 0.7, gain: 0.5, type: 'lowpass' }); burst(t, { dur: 0.7, freq: 2600, q: 0.5, gain: 0.08, sweepTo: 380, wet: 0.6 }); },
    riser(t, d = 0.9) {
      const src = ctx.createBufferSource(); src.buffer = noise(); src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.3; f.frequency.setValueAtTime(320, t); f.frequency.exponentialRampToValueAtTime(6500, t + d);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + d * 0.96); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.06);
      src.connect(f); f.connect(g); out(g, 0.25); src.start(t); src.stop(t + d + 0.12);
      tone(t, { f: 110, dur: d, gain: 0.05, a: d * 0.8, slideTo: 440 });
    },
    snap(t) { burst(t, { dur: 0.035, freq: 2300, q: 0.9, gain: 0.55 }); tone(t, { f: 190, dur: 0.06, gain: 0.22, slideTo: 90 }); },
    stamp(t) { tone(t, { f: 150, dur: 0.17, gain: 0.42, slideTo: 64 }); burst(t, { dur: 0.05, freq: 900, q: 0.8, gain: 0.32, type: 'lowpass' }); tone(t + 0.005, { f: 2400, dur: 0.06, gain: 0.04, wet: 0.4 }); },
    sparkle(t) { for (let i = 0; i < 16; i++) tone(t + i * 0.04 + Math.random() * 0.03, { f: 2000 + Math.random() * 3600, dur: 0.12, gain: 0.05, wet: 0.7 }); },
    sting(t) { [N.C4, N.E4, N.G4, N.C5].forEach((f, i) => brass(t + i * 0.015, f, 1.5, 0.085)); brass(t, N.C4 / 2, 1.5, 0.08); SOUNDS.sparkle(t + 0.1); burst(t, { dur: 1.3, freq: 7000, q: 0.3, gain: 0.1, type: 'highpass' }); tone(t, { f: 65, dur: 0.6, gain: 0.35, slideTo: 40 }); },
  };
  let lastUnlock = 0;
  function play(name, opts = {}) {
    if (muted) return; const c = ensure(); if (!c) return;
    // a suspended context (no tap yet) would queue sounds and blurt them all out on the first tap: only queue right after a tap
    if (c.state !== 'running' && performance.now() - lastUnlock > 1500) return;
    const fn = SOUNDS[name]; if (!fn) return;
    try { fn(c.currentTime + 0.01 + (opts.delay || 0), opts.arg); } catch {}
  }
  function unlock() { const c = ensure(); lastUnlock = performance.now(); if (c && c.state !== 'running') { try { const r = c.resume(); if (r && r.catch) r.catch(() => {}); } catch {} } }
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, unlock, { passive: true }));
  function setMuted(m) { muted = !!m; try { localStorage.setItem('tete.mute', muted ? '1' : '0'); } catch {} if (master) master.gain.value = muted ? 0 : vol; }
  function setVolume(v) { vol = Math.max(0, Math.min(1, v)); try { localStorage.setItem('tete.vol', String(vol)); } catch {} if (master && !muted) master.gain.value = vol; }
  // render a list of [name, seconds, arg] to an audio buffer (used to give the intro video its soundtrack)
  async function renderOffline(list, seconds, rate = 44100) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return null;
    const saved = [ctx, master, verb, noiseBuf], wasMuted = muted;
    ctx = new OAC(2, Math.ceil(seconds * rate), rate); noiseBuf = null; muted = false; const g = graph(ctx); master = g.m; master.gain.value = 0.9; verb = g.v;
    try { for (const [name, at, arg] of list) { const fn = SOUNDS[name]; if (fn) fn(at, arg); } return await ctx.startRendering(); }
    finally { [ctx, master, verb, noiseBuf] = saved; muted = wasMuted; }
  }
  window.TeteSound = { play, setMuted, setVolume, unlock, renderOffline, get muted() { return muted; }, get volume() { return vol; } };
})();

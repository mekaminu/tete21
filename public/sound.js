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
    // the cash register: ka-ching
    cash(t) { burst(t, { dur: 0.035, freq: 3200, q: 1, gain: 0.26 }); tone(t, { f: 180, dur: 0.08, gain: 0.12, slideTo: 90 }); [2093, 2637, 3136].forEach((f, i) => tone(t + 0.07 + i * 0.045, { f, type: 'triangle', dur: 0.5, gain: 0.085, wet: 0.5 })); tone(t + 0.07, { f: 4186, dur: 0.7, gain: 0.035, wet: 0.7 }); },
    // a win streak catches fire: a roaring swell with crackles, hotter the longer the run
    flare(t, n = 2) {
      const k = Math.min(1, (n - 1) / 4);
      burst(t, { dur: 0.55 + k * 0.3, freq: 260, q: 0.6, gain: 0.22 + k * 0.12, type: 'lowpass', sweepTo: 2600 + k * 1800, wet: 0.3 });
      for (let i = 0; i < 9 + n * 2; i++) burst(t + 0.05 + Math.random() * (0.5 + k * 0.3), { dur: 0.012, freq: 2500 + Math.random() * 3500, q: 3, gain: 0.08 + Math.random() * 0.08 });
      tone(t + 0.04, { f: 196, dur: 0.5, gain: 0.07, slideTo: 392 + k * 200, wet: 0.3 });
    },
    // a run goes cold
    fizzle(t) { burst(t, { dur: 0.6, freq: 2600, q: 1.1, gain: 0.12, sweepTo: 260, wet: 0.2 }); tone(t + 0.05, { f: 330, dur: 0.4, gain: 0.05, slideTo: 140 }); },
    // twenty-one: an Afrobeat "ta-da" (talking drum pickup, the band hits, the guitar answers)
    twentyone(t) {
      const d = master, sp = 60 / 116 / 4;
      BAND.talk(t, d, 250, 150, 0.42); BAND.talk(t + sp, d, 210, 150, 0.38);
      const h = t + sp * 2; BAND.kick(h, d, 0.62); BAND.clap(h, d, 0.24); BAND.bass(h, d, 36, 0.45, 0.32); BAND.bell(h, d, 1, 0.15);
      [60, 64, 67, 72, 76].forEach((m, i) => BAND.pluck(h + i * 0.016, d, m, 0.14, { len: 1.4 }));
      BAND.hiss(h, d, 0.22, { type: 'bandpass', freq: 3200, q: 0.6, dur: 0.35 });
      for (let k = 1; k <= 6; k++) { const u = h + k * sp; BAND.hiss(u, d, k % 2 ? 0.1 : 0.05); if (k === 2 || k === 5) BAND.bell(u, d, k === 5, 0.13); if (k === 3) BAND.conga(u, d, 220, 0.2); }
      [[2, 76], [3, 79], [4, 84], [6, 79]].forEach(([k, m]) => BAND.pluck(h + k * sp, d, m, 0.2, { len: 0.8 }));
      BAND.kick(h + sp * 6, d, 0.6); BAND.bass(h + sp * 6, d, 43, 0.2, 0.36);
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
  let lastUnlock = -1e9, napT = null, napping = false;
  // the sound engine keeps the phone's audio hardware awake: after half a minute of quiet it sleeps, and wakes for the next sound
  function nap() { clearTimeout(napT); napT = setTimeout(() => { if (ctx && ctx.state === 'running') { napping = true; ctx.suspend().catch(() => {}); } }, 30000); }
  // a group of sounds that can be cut short together (the intro's soundtrack when someone skips it)
  const buses = {};
  function busOf(name) {
    let b = buses[name];
    if (!b || b.c !== ctx) { b = buses[name] = { c: ctx, dry: ctx.createGain(), wet: ctx.createGain() }; b.dry.connect(master); b.wet.connect(verb); }
    return b;
  }
  function stop(name, fade = 0.2) {
    const b = buses[name]; if (!b) return; delete buses[name];
    try { const t = b.c.currentTime; for (const g of [b.dry, b.wet]) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade); } } catch {}
    setTimeout(() => { try { b.dry.disconnect(); b.wet.disconnect(); } catch {} }, fade * 1000 + 150);
  }
  function play(name, opts = {}) { const fn = SOUNDS[name]; if (fn) run(fn, opts); }
  // recorded clips (the house voice's shouts): fetched and decoded once, then played through the same
  // speakers, volume and mute as every other sound, and under the same rule: never saved up for later
  const clips = {};
  function loadClip(url) {
    const c = ensure(); if (!c) return Promise.reject(new Error('no audio'));
    if (!clips[url]) {
      clips[url] = fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).then(b => new Promise((res, rej) => c.decodeAudioData(b, res, rej))).then(buf => {
        // speech clips start with a little silence: skip it, so a shout lands the moment it's made
        const d = buf.getChannelData(0); let i = 0; while (i < d.length && Math.abs(d[i]) < 0.01) i++;
        buf.lead = Math.max(0, i / buf.sampleRate - 0.02); return buf;
      });
      clips[url].catch(() => { delete clips[url]; });
    }
    return clips[url];
  }
  function clip(url, opts = {}) {
    if (muted) return; const asked = performance.now();
    loadClip(url).then(buf => {
      if (performance.now() - asked > 3000) return; // too late to still be the moment
      run(t => { const s = ctx.createBufferSource(); s.buffer = buf; const g = ctx.createGain(); g.gain.value = opts.gain || 1; s.connect(g); out(g, opts.wet || 0); s.start(t, buf.lead || 0);
        if (MU) try { const d = MU.dip.gain, len = Math.min(3, buf.duration - (buf.lead || 0)); d.cancelScheduledValues(t); d.setTargetAtTime(0.35, t, 0.04); d.setTargetAtTime(1, t + len, 0.3); } catch {} }, opts);
    }).catch(() => {});
  }
  function run(fn, opts = {}) {
    if (muted) return; const c = ensure(); if (!c) return;
    const go = () => {
      const keep = [master, verb];
      try { if (opts.bus) { const b = busOf(opts.bus); master = b.dry; verb = b.wet; } fn(c.currentTime + 0.01 + (opts.delay || 0), opts.arg); } catch {} finally { master = keep[0]; verb = keep[1]; }
      nap();
    };
    if (c.state === 'running') { go(); return; }
    // Sound isn't running (no tap yet, or it's napping). Never schedule onto a stopped clock: the browser saves the
    // sounds up and plays them all at the next tap, long after the moment. Wake it, and play only if it wakes promptly.
    if (!napping && performance.now() - lastUnlock > 1500) return;
    napping = false;
    const asked = performance.now();
    try { const r = c.resume(); if (r && r.then) r.then(() => { if (c.state === 'running' && performance.now() - asked < 1000) go(); }, () => {}); } catch {}
  }
  function unlock() { const c = ensure(); lastUnlock = performance.now(); napping = false; if (c && c.state !== 'running') { try { const r = c.resume(); if (r && r.catch) r.catch(() => {}); } catch {} } nap();
    // a song the browser held back starts on this tap (phones only let a song start from a tap)
    if (MU && MEL && NOW && MEL.paused && !document.hidden) resumeSong(); }
  // every kind of tap or key counts (phones only let sound start on the finger lifting); caught early, before the button's own handler plays its sound
  ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { passive: true, capture: true }));
  // can sound play right now without a tap? (installed apps and well-used sites often can; Safari never does)
  function ready(ms = 350) {
    if (muted) return Promise.resolve(false);
    const c = ensure(); if (!c) return Promise.resolve(false);
    if (c.state === 'running') return Promise.resolve(true);
    try { if (navigator.getAutoplayPolicy && navigator.getAutoplayPolicy(c) === 'disallowed') return Promise.resolve(false); } catch {}
    return new Promise(res => {
      let done = false; const fin = () => { if (!done) { done = true; res(c.state === 'running'); } };
      try { const r = c.resume(); if (r && r.then) r.then(fin, fin); } catch {}
      setTimeout(fin, ms);
    });
  }
  function setMuted(m) { muted = !!m; try { localStorage.setItem('tete.mute', muted ? '1' : '0'); } catch {} if (master) master.gain.value = muted ? 0 : vol; }
  function setVolume(v) { vol = Math.max(0, Math.min(1, v)); try { localStorage.setItem('tete.vol', String(vol)); } catch {} if (typeof djApply === 'function') djApply(); if (master && !muted) master.gain.value = vol; if (MU && ctx) try { MU.out.gain.setTargetAtTime(musicGain(), ctx.currentTime, 0.1); } catch {} }
  // render a list of [name, seconds, arg] to an audio buffer (used to give the intro video its soundtrack)
  async function renderOffline(list, seconds, rate = 44100) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return null;
    const saved = [ctx, master, verb, noiseBuf], wasMuted = muted;
    ctx = new OAC(2, Math.ceil(seconds * rate), rate); noiseBuf = null; muted = false; const g = graph(ctx); master = g.m; master.gain.value = 0.9; verb = g.v;
    try { for (const [name, at, arg] of list) { const fn = SOUNDS[name]; if (fn) fn(at, arg); } return await ctx.startRendering(); }
    finally { [ctx, master, verb, noiseBuf] = saved; muted = wasMuted; }
  }
  // ---------- music: original Afrobeat / highlife, played live by the sound engine ----------
  // Nothing here is a recording or anyone's song, so there is nothing to license. The band: kick, clap, shekere,
  // agogo bell, congas, talking drum, a warm bass and two highlife guitars (plucked strings, Karplus-Strong).
  const MIDI = m => 440 * Math.pow(2, (m - 69) / 12);
  const KS = {};
  function pluckBuf(m) { // one plucked string per note, made once
    const c = ctx, hit = KS[m]; if (hit && hit.c === c) return hit.b;
    const rate = Math.min(c.sampleRate, 32000), f = MIDI(m), N = Math.max(2, Math.round(rate / f)), len = Math.floor(rate * 1.5);
    const b = c.createBuffer(1, len, rate), d = b.getChannelData(0), line = new Float32Array(N);
    let lp = 0; for (let i = 0; i < N; i++) { lp = lp * 0.5 + (Math.random() * 2 - 1) * 0.5; line[i] = lp; } // a soft pick
    const loss = Math.pow(0.5, 1 / (f * 0.32)); let k = 0;
    for (let i = 0; i < len; i++) { const a = line[k], nk = k + 1 === N ? 0 : k + 1; line[k] = (a + line[nk]) * 0.5 * loss; d[i] = a; k = nk; }
    KS[m] = { c, b }; return b;
  }
  const PAN = (dest, p) => { if (!p || !ctx.createStereoPanner) return dest; const n = ctx.createStereoPanner(); n.pan.value = p; n.connect(dest); return n; };
  const BAND = {
    pluck(t, dest, m, vel, o = {}) {
      const s = ctx.createBufferSource(); s.buffer = pluckBuf(m);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.mute ? 1700 : 4800; f.Q.value = 0.5;
      const g = ctx.createGain(), end = o.mute || o.len || 1.1; g.gain.setValueAtTime(vel, t);
      if (o.mute) g.gain.exponentialRampToValueAtTime(0.0001, t + o.mute); else g.gain.setTargetAtTime(0.0001, t + end * 0.55, end * 0.2);
      s.connect(f); f.connect(g); g.connect(PAN(dest, o.pan)); if (o.send) g.connect(o.send); s.start(t); s.stop(t + end + 0.25);
    },
    bass(t, dest, m, dur, vel) {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), mix = ctx.createGain(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = o2.frequency.value = MIDI(m); mix.gain.value = 0.4;
      o.connect(f); o2.connect(mix); mix.connect(f); f.type = 'lowpass'; f.frequency.value = 520; f.connect(g); g.connect(dest);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.012); g.gain.setTargetAtTime(vel * 0.55, t + 0.04, 0.09); g.gain.setTargetAtTime(0.0001, t + dur, 0.04);
      [o, o2].forEach(x => { x.start(t); x.stop(t + dur + 0.3); });
    },
    kick(t, dest, vel) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(115, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.12); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32); o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.35); },
    hiss(t, dest, vel, { type = 'highpass', freq = 7000, q = 0.7, dur = 0.05, pan = 0 } = {}) {
      const s = ctx.createBufferSource(); s.buffer = noise(); const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(PAN(dest, pan)); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    },
    clap(t, dest, vel) { [0, 0.011, 0.023].forEach((d, i) => BAND.hiss(t + d, dest, vel * (i === 2 ? 1 : 0.6), { type: 'bandpass', freq: 1500, q: 0.9, dur: i === 2 ? 0.14 : 0.02 })); },
    bell(t, dest, hi, vel) { const f0 = hi ? 920 : 640; [1, 2.37].forEach((k, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = f0 * k; g.gain.setValueAtTime(vel / (i + 1.5), t); g.gain.exponentialRampToValueAtTime(0.0001, t + (i ? 0.12 : 0.28)); o.connect(g); g.connect(PAN(dest, 0.35)); o.start(t); o.stop(t + 0.3); }); },
    conga(t, dest, f0, vel, slap) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(f0 * 1.08, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.03); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (slap ? 0.07 : 0.22)); o.connect(g); g.connect(PAN(dest, -0.3)); o.start(t); o.stop(t + 0.25); if (slap) BAND.hiss(t, dest, vel * 0.6, { type: 'bandpass', freq: 2600, q: 1.2, dur: 0.04, pan: -0.3 }); },
    // the talking drum: squeezed as it's struck, so the note bends
    talk(t, dest, f0, f1, vel) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.16); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34); o.connect(g); g.connect(PAN(dest, 0.2)); o.start(t); o.stop(t + 0.36); BAND.hiss(t, dest, vel * 0.25, { type: 'bandpass', freq: 900, q: 1, dur: 0.03, pan: 0.2 }); },
  };
  // ---------- music at the table: real Afrobeats, Afrobeat and highlife songs, shuffled ----------
  // The songs live in public/music (index.json lists them) and are free to use under the Pixabay Content License.
  // They play through the sound engine, so the music steps back while someone talks and dips under each shout.
  // Each song is fetched whole (the browser keeps it for good, since its address carries a version) and the next
  // one is fetched while this one plays, so songs follow on without a gap and nothing streams in pieces.
  let MU = null, MG = null, mOn = true, mVol = 0.5, duckOn = false;
  try { mOn = localStorage.getItem('tete.music') !== 'off'; const v = parseFloat(localStorage.getItem('tete.mvol')); if (!isNaN(v)) mVol = v; } catch {}
  const MUSIC_LEVEL = 0.6;
  function musicGain() { return MUSIC_LEVEL * mVol * vol; }
  let LIST = null, ORDER = [], POS = -1, NOW = null, MEL = null, SWITCHING = false, BLOCKED = false, RETRY = 0, onSong = null;
  const BLOBS = new Map();
  function songList() {
    if (!LIST) LIST = fetch('/music/index.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(j => ({ v: String((j && j.v) || '1'), songs: j && Array.isArray(j.songs) ? j.songs.filter(x => x && typeof x.f === 'string') : [] }))
      .then(L => { if (!L.songs.length) LIST = null; return L; }, () => { LIST = null; return { v: '1', songs: [] }; });
    return LIST;
  }
  function shuffled(n, avoid) { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } if (n > 1 && a[0] === avoid) [a[0], a[1]] = [a[1], a[0]]; return a; }
  async function songUrl(L, i) {
    const s = L.songs[i]; if (BLOBS.has(s.f)) return BLOBS.get(s.f);
    const r = await fetch(`/music/${s.f}?v=${encodeURIComponent(L.v)}`); if (!r.ok) throw new Error('song ' + r.status);
    const u = URL.createObjectURL(await r.blob()); BLOBS.set(s.f, u);
    // keep just the last few songs in memory (never the one playing: it's always among the newest)
    while (BLOBS.size > 3) { const [k, old] = BLOBS.entries().next().value; BLOBS.delete(k); try { URL.revokeObjectURL(old); } catch {} }
    return u;
  }
  function graphFor(c) {
    if (MG && MG.c === c) return MG;
    MEL = new Audio(); MEL.preload = 'auto'; try { MEL.setAttribute('playsinline', ''); } catch {}
    const src = c.createMediaElementSource(MEL), duck = c.createGain(), dip = c.createGain(), out = c.createGain();
    src.connect(duck); duck.connect(dip); dip.connect(out); out.connect(c.destination); out.gain.value = 0.0001;
    MEL.addEventListener('ended', () => { if (MU) setTimeout(() => nextSong(true), 700); });
    MG = { c, src, duck, dip, out, timer: null }; return MG;
  }
  function fadeTo(m, v, secs) { try { const t = m.c.currentTime, g = m.out.gain; g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t); g.linearRampToValueAtTime(Math.max(0.0001, v), t + secs); } catch {} }
  function music(want) {
    if (want && mOn) {
      if (MU) { musicTick(); return; }
      const c = ensure(); if (!c) return;
      MU = graphFor(c); duckOn = false; MU.duck.gain.value = 1; MU.dip.gain.value = 1; MU.out.gain.value = 0.0001;
      clearInterval(MU.timer); MU.timer = setInterval(musicTick, 1000); musicTick();
    } else if (MU) {
      const m = MU; MU = null; clearInterval(m.timer); m.timer = null;
      fadeTo(m, 0.0001, 0.7); setTimeout(() => { if (!MU && MEL) try { MEL.pause(); } catch {} }, 800);
    }
  }
  // the song plays only while sound runs and the app is in view; otherwise it rests (and the engine can nap)
  function musicTick() {
    const m = MU; if (!m || !MEL) return;
    if (m.c.state !== 'running' || document.hidden) { if (!MEL.paused) try { MEL.pause(); } catch {} return; }
    nap();
    if (SWITCHING || Date.now() < RETRY) return;
    if (!NOW) { startSong(false); return; }
    if (MEL.paused && !MEL.ended) resumeSong();
  }
  function resumeSong() {
    if (!MU || !MEL || !MEL.src) return;
    fadeTo(MU, 0.0001, 0.02);
    let p; try { p = MEL.play(); } catch { BLOCKED = true; return; }
    if (p && p.then) p.then(() => { BLOCKED = false; if (MU) fadeTo(MU, musicGain(), 2); }, () => { BLOCKED = true; });
  }
  async function startSong(skipped) {
    if (SWITCHING || !MU) return; SWITCHING = true;
    try {
      const L = await songList(); if (!L.songs.length) { RETRY = Date.now() + 30000; return; }
      if (POS + 1 >= ORDER.length) { ORDER = shuffled(L.songs.length, ORDER[POS]); POS = -1; }
      POS++; const i = ORDER[POS];
      let url; try { url = await songUrl(L, i); } catch { RETRY = Date.now() + 15000; return; }
      if (!MU) return;
      NOW = L.songs[i]; MEL.src = url;
      if (MU.c.state === 'running' && !document.hidden) resumeSong();
      if (onSong) try { onSong(NOW, !!skipped); } catch {}
      const j = ORDER[POS + 1]; if (j != null) setTimeout(() => { if (MU) songUrl(L, j).catch(() => {}); }, 5000);
    } finally { SWITCHING = false; }
  }
  // the next song: straight away when one ends, or with a short fade when someone skips
  function nextSong(auto) {
    if (!MU || SWITCHING) return;
    if (auto || !MEL || MEL.paused) { NOW = null; startSong(!auto); return; }
    fadeTo(MU, 0.0001, 0.5); setTimeout(() => { NOW = null; startSong(true); }, 550);
  }
  // when someone talks on voice chat, the music steps back
  function duck(on) { if (!MU || duckOn === !!on) return; duckOn = !!on; try { const t = ctx.currentTime; MU.duck.gain.cancelScheduledValues(t); MU.duck.gain.setTargetAtTime(on ? 0.3 : 1, t, on ? 0.06 : 0.35); } catch {} }
  function setMusic(on) { mOn = !!on; try { localStorage.setItem('tete.music', mOn ? 'on' : 'off'); } catch {} djApply(); }
  function setMusicVolume(v) { mVol = Math.max(0, Math.min(1, v)); try { localStorage.setItem('tete.mvol', String(mVol)); } catch {} djApply(); if (MU && !MEL.paused) try { MU.out.gain.setTargetAtTime(musicGain(), MU.c.currentTime, 0.1); } catch {} }
  // ---------- music someone at the table plays from their computer (their YouTube Music tab, say) ----------
  // It arrives as its own stream, never mixed with anyone's voice, and plays at your music volume (on or off with the
  // music). Unlike the songs it doesn't step back when people talk: the person playing it asked for that.
  let DJEL = null, DJS = null;
  const DJ_LEVEL = 0.9;
  function djLevel() { return Math.max(0, Math.min(1, DJ_LEVEL * mVol * vol)); }
  function djApply() {
    if (!DJEL) return;
    try { DJEL.volume = djLevel(); } catch {}
    DJEL.muted = !mOn || !DJS;
    if (DJS && mOn && DJEL.paused) { const p = DJEL.play(); if (p && p.catch) p.catch(() => {}); }
  }
  function djPlay(stream) {
    if (!stream) { DJS = null; if (DJEL) { try { DJEL.pause(); } catch {} DJEL.srcObject = null; } return; }
    if (!DJEL) { DJEL = document.createElement('audio'); DJEL.id = 'dj-music'; DJEL.autoplay = true; DJEL.setAttribute('playsinline', ''); DJEL.hidden = true; document.body.appendChild(DJEL); }
    DJS = stream; if (DJEL.srcObject !== stream) DJEL.srcObject = stream;
    djApply();
  }
  // the end of the launch intro: an Afrobeat break instead of a fanfare
  SOUNDS.afrobreak = function (t) {
    const d = master, sp = 60 / 112 / 4;
    BAND.kick(t, d, 0.62); BAND.bass(t, d, 36, 0.5, 0.32); [60, 64, 67, 72, 76].forEach((m, i) => BAND.pluck(t + i * 0.018, d, m, 0.14, { len: 1.6 }));
    BAND.bell(t, d, 1, 0.16); BAND.hiss(t, d, 0.2, { type: 'bandpass', freq: 3000, q: 0.6, dur: 0.5 });
    for (let s = 1; s < 16; s++) { const u = t + s * sp;
      BAND.hiss(u, d, s % 2 ? 0.1 : 0.05);
      if ([2, 5, 7, 9, 12, 14].includes(s)) BAND.bell(u, d, s === 5 || s === 9 || s === 14, 0.12);
      if (s === 3 || s === 11) BAND.conga(u, d, 220, 0.22); if (s === 7) BAND.conga(u, d, 330, 0.16, true);
      if (s === 4 || s === 6 || s === 7) BAND.talk(u, d, s === 4 ? 260 : 180, s === 4 ? 150 : 140, 0.4);
      if (s === 8) { BAND.kick(u, d, 0.7); BAND.clap(u, d, 0.25); }
      if (s === 10) BAND.kick(u, d, 0.5);
      if (s >= 8 && s <= 14) { const lick = { 8: 79, 9: 76, 10: 74, 11: 76, 12: 72, 14: 67 }[s]; if (lick) BAND.pluck(u, d, lick, 0.22, { len: 0.6 }); }
      if (s === 12) BAND.bass(u, d, 43, 0.25, 0.36); if (s === 14) BAND.bass(u, d, 47, 0.2, 0.36);
    }
    const end = t + 16 * sp; BAND.kick(end, d, 0.62); BAND.clap(end, d, 0.24); BAND.bass(end, d, 36, 0.8, 0.34); [60, 64, 67, 72].forEach((m, i) => BAND.pluck(end + i * 0.02, d, m, 0.15, { len: 1.8 })); BAND.bell(end, d, 1, 0.14);
  };
  document.addEventListener('visibilitychange', () => { if (!MU || !MEL) return; if (document.hidden) { try { MEL.pause(); } catch {} } else musicTick(); });
  // In the Android app, while your phone's music plays for the table, the app mutes this page and plays the table's sound
  // itself (Android would pause YouTube Music for a page's voices): the game's sounds go to it as a stream (app.js)
  let TAP = null;
  function tap() {
    const c = ensure(); if (!c || !c.createMediaStreamDestination) return null;
    if (!TAP) { TAP = c.createMediaStreamDestination(); master.connect(TAP); if (MG && MG.c === c) MG.out.connect(TAP); }
    if (c.state === 'suspended') c.resume().catch(() => {});
    return TAP.stream;
  }
  function untap() { const t = TAP; if (!t) return; TAP = null; try { master.disconnect(t); } catch {} try { if (MG) MG.out.disconnect(t); } catch {} }
  window.TeteSound = { tap, untap, play, clip, loadClip, stop, ready, setMuted, setVolume, unlock, renderOffline, music, duck, setMusic, setMusicVolume, djPlay, get djLevel() { return mOn ? djLevel() : 0; }, get djPlaying() { return !!DJS; }, nextSong: () => nextSong(false), get song() { return NOW ? { title: NOW.title, artist: NOW.artist } : null; }, get songWaiting() { return !!MU && (!NOW || BLOCKED); }, set onSong(f) { onSong = typeof f === 'function' ? f : null; }, get musicOn() { return mOn; }, get musicVolume() { return mVol; }, get musicPlaying() { return !!MU; }, get muted() { return muted; }, get volume() { return vol; }, get state() { return ctx ? ctx.state : 'none'; } };
})();

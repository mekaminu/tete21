// Tete 21 launch intro: a few seconds of cinema. Tap anywhere to skip.
// An Ace spins toward you, bursts into the whole deck, the cards whirl, slam into a fan,
// TETE stamps down in gold and an Ace and a 10 flip over to make 21.
(() => {
  'use strict';
  const mark = v => { window.TETE_INTRO = v; try { window.dispatchEvent(new Event('tete:intro' + v)); } catch {} };
  let playing = false;
  // replay on demand (the profile's "Watch it"): after a tap the browser lets it play with sound
  window.TeteIntro = { play() { if (playing) return; let r = document.getElementById('intro'); if (!r) { r = document.createElement('div'); r.id = 'intro'; r.setAttribute('aria-hidden', 'true'); document.body.appendChild(r); } play(r); } };
  const root0 = document.getElementById('intro'); if (!root0) return;
  const qs = new URLSearchParams(location.search), force = qs.has('intro');
  let skip = qs.has('nointro') || (!!navigator.webdriver && !force);
  try {
    if (!force && localStorage.getItem('tete.intro') === 'off') skip = true;
    // getting back into a game after a refresh or a dropped signal: no waiting
    const cur = localStorage.getItem('tete.current'), seats = JSON.parse(localStorage.getItem('tete.seats') || '{}') || {}, s = cur && seats[cur];
    if (!force && s && s.token && (s.keep || Date.now() - (s.t || 0) < 6 * 3600e3)) skip = true;
  } catch {}
  if (skip) { root0.remove(); mark('done'); return; }
  play(root0);

  function play(root) {
  playing = true; mark('play'); window.__introT0 = performance.now();
  const SLOW = window.__introSlow || 1; // recording the intro as a video plays it in slow motion
  try { document.fonts && document.fonts.load('700 64px Cinzel'); } catch {}

  const SND = (n, d, arg) => { try { window.TeteSound && window.TeteSound.play(n, { delay: d, arg }); } catch {} };
  const W = innerWidth, H = innerHeight, small = Math.min(W, H) < 560;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cw = Math.round(Math.max(44, Math.min(96, Math.min(W, H) * 0.135)));
  root.style.setProperty('--cw', cw + 'px');
  root.innerHTML = '<div class="cam"><div class="spot"></div><div class="rays"></div><div class="stage"></div>' +
    '<div class="ititle"><div class="iword">' + 'TETE'.split('').map(c => '<span class="gold">' + c + '</span>').join('') + '</div>' +
    '<div class="i21"></div><div class="itag">The Naija card game</div></div></div>' +
    '<div class="flash"></div><div class="bars"><i></i><i></i></div><button class="skip" type="button">Skip</button>';
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const cam = $('.cam'), stage = $('.stage'), title = $('.ititle'), flash = $('.flash');
  const A = (el, kf, o) => el.animate(kf, Object.assign({ fill: 'both' }, o));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const DS = 'drop-shadow(0 2px 0 #3f2c0c) drop-shadow(0 0 18px rgba(217,178,95,.28))';
  function card(r, s, extra = '') {
    const el = document.createElement('div'); el.className = 'ic'; const red = s === '♥' || s === '♦';
    el.innerHTML = `<i class="f${red ? ' red' : ''}"><em>${r}<small>${s}</small></em><b>${s}</b><em class="br">${r}<small>${s}</small></em>${extra}</i><i class="b"></i>`;
    return el;
  }
  // the 21 line: Ace (11) + 10 = 21
  const cA = card('A', '♠'), c10 = card('10', '♥'), w21 = document.createElement('span');
  w21.className = 'w21'; w21.innerHTML = '<span class="glow"></span><span class="n21 gold">21</span>';
  $('.i21').append(cA, w21, c10);

  // lay the composition out: the fan arcs over the title, the whole thing centred between the cinema bars
  const wordH = $('.iword').offsetHeight || 80, titleH = title.offsetHeight || 220;
  const fanR = Math.min(W * 0.42, H * 0.36), ch = cw * 1.4;
  const pivotY = Math.round((fanR + ch / 2 + wordH / 2 - titleH) / 2);
  title.style.top = Math.round(H / 2 + pivotY - wordH / 2) + 'px';

  let exiting = false, finished = false; const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms * SLOW));
  function finish() { if (finished) return; finished = true; playing = false; timers.forEach(clearTimeout); root.remove(); mark('done'); }
  function skipNow() {
    if (exiting) return; exiting = true; timers.forEach(clearTimeout); mark('exit');
    const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-out', fill: 'forwards' });
    a.onfinish = finish; setTimeout(finish, 600);
  }
  root.addEventListener('pointerdown', skipNow);
  const onKey = e => { if (!finished && ['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); skipNow(); } };
  document.addEventListener('keydown', onKey);
  window.addEventListener('tete:introdone', () => document.removeEventListener('keydown', onKey), { once: true });

  if (reduce) { // a calm version: the title fades up and away
    $$('.iword span').forEach(sp => (sp.style.opacity = 1));
    A(title, [{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
    later(() => { exiting = true; mark('exit'); A(root, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 }); later(finish, 450); }, 1300);
    return;
  }

  const t = { hero: 80, land: 780, burst: 980, word: 2530, a: 2930, ten: 3050, n21: 3230, tag: 3310, sheen: 3380, exit: 4000 };
  const T = (x, y, z, rz, ry, rx, s) => `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${z.toFixed(1)}px) rotateZ(${rz.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg) rotateX(${rx.toFixed(1)}deg) scale(${s.toFixed(3)})`;
  const shake = (at, amp) => cam.animate([0, 1, 2, 3, 4, 5].map(j => ({ transform: j === 0 || j === 5 ? 'translate(0px,0px)' : `translate(${rnd(-amp, amp).toFixed(1)}px,${rnd(-amp, amp).toFixed(1)}px)` })), { duration: 320, delay: at, easing: 'linear' });

  // lights up
  A($('.spot'), [{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 650, easing: 'ease-out' });
  A($('.skip'), [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 700 });

  // 1. the Ace of Spades spins in out of the dark
  const hero = card('A', '♠', '<span class="glint"></span>'); stage.appendChild(hero);
  const hs = small ? 2.3 : 2.05;
  A(hero, [
    { transform: T(0, -40, -2600, -50, -900, 30, 1), opacity: 0 },
    { offset: 0.15, opacity: 1 },
    { transform: T(0, 0, 0, 0, 0, 0, hs), opacity: 1 }
  ], { duration: 700, delay: t.hero, easing: 'cubic-bezier(.12,.72,.2,1)' });
  A(hero.querySelector('.glint'), [{ transform: 'translateX(-120%)' }, { transform: 'translateX(120%)' }], { duration: 420, delay: t.land - 20, easing: 'ease-in-out' });
  hero.animate([
    { transform: T(0, 0, 0, 0, 0, 0, hs), opacity: 1, filter: 'brightness(1)' },
    { offset: 0.55, transform: T(0, 0, 0, -4, 0, 0, hs * 1.1), opacity: 1, filter: 'brightness(1.5)' },
    { transform: T(0, 0, 180, 10, 0, 0, hs * 2), opacity: 0, filter: 'brightness(3)' }
  ], { duration: 330, delay: t.burst - 180, easing: 'cubic-bezier(.5,0,.8,.5)', fill: 'forwards' });
  shake(t.land, 3);

  // 2. it bursts into the deck: cards tumble out in 3D, 3. whirl, 4. slam into a fan
  const RANKS = ['A', '3', '4', '5', '6', '7', '8', '9', '10'], SUITS = ['♠', '♥', '♣', '♦'];
  const deck = []; for (const s of SUITS) for (const r of RANKS) deck.push([r, s]);
  const N = small ? 27 : 36, R = Math.hypot(W, H) / 2, phiMax = 68 * Math.PI / 180, fan = [];
  const cards = deck.slice(0, N).map(([r, s], i) => {
    const el = card(r, s); stage.appendChild(el);
    const phi = -phiMax + 2 * phiMax * (i / (N - 1)), fx = fanR * Math.sin(phi), fy = pivotY - fanR * Math.cos(phi), fd = phi * 180 / Math.PI;
    fan.push([fx, fy, fd]);
    const a = (i / N) * Math.PI * 2 + rnd(-0.25, 0.25), d1 = R * rnd(0.3, 0.78), z1 = rnd(-520, 220);
    // every spin keeps one direction and lands on exactly 0 (face up, flat), so the fan stacks in deck order
    const sy = Math.random() < 0.5 ? -1 : 1, sx = Math.random() < 0.5 ? -1 : 1, sz = Math.random() < 0.5 ? -1 : 1;
    const ryF = 0, ryE = -sy * rnd(140, 320), ry1 = ryE - sy * rnd(360, 600), ry0 = ry1 - sy * rnd(200, 420);
    const rxF = 0, rxE = -sx * rnd(100, 240), rx1 = rxE - sx * rnd(180, 360), rx0 = rx1 - sx * rnd(100, 260);
    const rzF = fd, rzE = fd - sz * rnd(70, 200), rz1 = rzE - sz * rnd(160, 320), rz0 = rz1 - sz * rnd(40, 180);
    const kf = [{ offset: 0, transform: T(0, 0, -40, rz0, ry0, rx0, 0.4), easing: 'cubic-bezier(.08,.82,.25,1)' },
      { offset: 0.28, transform: T(Math.cos(a) * d1, Math.sin(a) * d1 * 0.85, z1, rz1, ry1, rx1, 1), easing: 'linear' }];
    for (let k = 1; k <= 6; k++) {
      const q = k / 6, th = a + q * 2.5, rr = d1 * (1 - 0.6 * q);
      kf.push({ offset: 0.28 + 0.5 * q, transform: T(Math.cos(th) * rr, Math.sin(th) * rr * 0.8, z1 * (1 - q) + Math.sin(q * 5 + i) * 110, rz1 + (rzE - rz1) * q, ry1 + (ryE - ry1) * q, rx1 + (rxE - rx1) * q, 1 - 0.12 * Math.sin(q * Math.PI)), easing: k === 6 ? 'cubic-bezier(.2,.9,.32,1.16)' : 'linear' });
    }
    kf.push({ offset: 1, transform: T(fx, fy, 0, rzF, ryF, rxF, 1) });
    A(el, kf, { duration: 1500 + i * 9, delay: t.burst });
    A(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 30, delay: t.burst });
    return el;
  });
  A(flash, [{ opacity: 0 }, { offset: 0.12, opacity: 0.9 }, { opacity: 0 }], { duration: 650, delay: t.burst - 30 });
  shake(t.burst, 9);
  const sparks = (n, ox, oy, dist, at) => { for (let k = 0; k < n; k++) {
    const sp = document.createElement('div'); sp.className = 'spark'; stage.appendChild(sp);
    const a = rnd(0, Math.PI * 2), d = dist * rnd(0.35, 1);
    A(sp, [{ transform: `translate3d(${ox}px,${oy}px,0) scale(1)`, opacity: 0 }, { offset: 0.03, opacity: 1 }, { transform: `translate3d(${(ox + Math.cos(a) * d).toFixed(1)}px,${(oy + Math.sin(a) * d).toFixed(1)}px,0) scale(.2)`, opacity: 0 }], { duration: rnd(650, 1100), delay: at, easing: 'cubic-bezier(.1,.8,.3,1)' });
  } };
  sparks(small ? 26 : 40, 0, 0, R * 0.55, t.burst);
  const fanLand = t.burst + 1500 + Math.round(N / 2) * 9;
  shake(fanLand - 40, 7);
  sparks(small ? 12 : 18, 0, pivotY - fanR, fanR * 0.9, fanLand - 60);

  // 5. TETE stamps down, letter by letter
  $$('.iword span').forEach((sp, j) => A(sp, [
    { transform: 'translateY(-24px) scale(2.8)', opacity: 0, filter: 'blur(10px) ' + DS },
    { offset: 0.62, transform: 'translateY(0px) scale(.94)', opacity: 1, filter: 'blur(0px) ' + DS },
    { transform: 'translateY(0px) scale(1)', opacity: 1, filter: 'blur(0px) ' + DS }
  ], { duration: 300, delay: t.word + j * 115, easing: 'cubic-bezier(.35,0,.3,1)' }));
  // 6. an Ace and a 10 flip over, and 21 lands between them
  $('.i21').style.perspective = '600px';
  A(cA, [{ transform: 'translateX(-70px) rotateY(180deg) rotateZ(-30deg) scale(.6)', opacity: 0 }, { offset: 0.25, opacity: 1 }, { transform: 'translateX(0px) rotateY(0deg) rotateZ(-9deg) scale(1)', opacity: 1 }], { duration: 560, delay: t.a, easing: 'cubic-bezier(.2,.9,.3,1.25)' });
  A(c10, [{ transform: 'translateX(70px) rotateY(-180deg) rotateZ(30deg) scale(.6)', opacity: 0 }, { offset: 0.25, opacity: 1 }, { transform: 'translateX(0px) rotateY(0deg) rotateZ(9deg) scale(1)', opacity: 1 }], { duration: 560, delay: t.ten, easing: 'cubic-bezier(.2,.9,.3,1.25)' });
  A($('.n21'), [
    { transform: 'scale(2.6)', opacity: 0, filter: 'blur(8px) ' + DS },
    { offset: 0.6, transform: 'scale(.93)', opacity: 1, filter: 'blur(0px) ' + DS },
    { transform: 'scale(1)', opacity: 1, filter: 'blur(0px) ' + DS }
  ], { duration: 340, delay: t.n21, easing: 'cubic-bezier(.35,0,.3,1)' });
  A($('.glow'), [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.4)' }, { offset: 0.3, opacity: 1, transform: 'translate(-50%,-50%) scale(1.1)' }, { opacity: 0.6, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 900, delay: t.n21 + 150 });
  A($('.rays'), [{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: t.n21 });
  $('.rays').animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 60000, iterations: Infinity });
  shake(t.n21 + 180, 4);
  later(() => { const r = $('.n21').getBoundingClientRect(); sparks(small ? 14 : 22, r.left + r.width / 2 - W / 2, r.top + r.height / 2 - H / 2, 140, 0); }, t.n21 + 170);
  A($('.itag'), [{ opacity: 0, letterSpacing: '.9em', transform: 'translateY(6px)' }, { opacity: 1, letterSpacing: '.42em', transform: 'translateY(0px)' }], { duration: 800, delay: t.tag, easing: 'cubic-bezier(.2,.8,.2,1)' });
  // 7. a sweep of light across the gold, as one band over every letter
  later(() => {
    const golds = $$('.ititle .gold'); if (!golds.length) return;
    const rs = golds.map(g => g.getBoundingClientRect()), L = Math.min(...rs.map(r => r.left)), Wt = Math.max(...rs.map(r => r.right)) - L;
    golds.forEach((g, k) => {
      const xe = rs[k].left - L, sw = Wt * 3; g.style.backgroundSize = `${sw}px 100%, 100% 100%`;
      A(g, [{ backgroundPosition: `${(-0.35 * Wt - xe - 1.5 * Wt).toFixed(1)}px 0px, 0px 0px` }, { backgroundPosition: `${(1.35 * Wt - xe - 1.5 * Wt).toFixed(1)}px 0px, 0px 0px` }], { duration: 750, easing: 'ease-in-out' });
    });
  }, t.sheen);

  // sound, if the browser lets the page play it (it usually needs one tap first)
  SND('riser', 0, 0.75); SND('whoosh', 0.08); SND('snap', 0.79); SND('boom', 0.98); SND('shuffle', 1.01);
  SND('riser', 1.58, 0.85); SND('stamp', fanLand / 1000 - 0.03); SND('snap', fanLand / 1000 - 0.02);
  [0, 1, 2, 3].forEach(j => SND('stamp', (t.word + j * 115 + 186) / 1000));
  SND('flip', (t.a + 150) / 1000); SND('flip', (t.ten + 150) / 1000); SND('sting', (t.n21 + 200) / 1000);

  // 8. fly through into the lobby (a recording can hold on the title instead)
  if (!window.__introHold) later(() => {
    if (exiting) return; exiting = true; mark('exit'); SND('whoosh');
    $('.skip').remove(); root.style.cursor = 'default';
    cards.forEach((el, i) => {
      const [x, y, d] = fan[i], k = 2.1;
      el.animate([{ transform: T(x, y, 0, d, 0, 0, 1) }, { transform: T(x * k, y * k - 80, 420, d * 1.5, 0, 0, 1.35) }], { duration: 560, easing: 'cubic-bezier(.55,0,.85,.35)', fill: 'forwards' });
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, delay: 150, fill: 'forwards' });
    });
    A(title, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.6)', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.55,0,.85,.35)' });
    A($('.bars i:first-child'), [{ transform: 'translateY(0%)' }, { transform: 'translateY(-100%)' }], { duration: 420, easing: 'ease-in' });
    A($('.bars i:last-child'), [{ transform: 'translateY(0%)' }, { transform: 'translateY(100%)' }], { duration: 420, easing: 'ease-in' });
    A(root, [{ backgroundColor: 'rgba(5,2,5,1)' }, { backgroundColor: 'rgba(5,2,5,0)' }], { duration: 520, delay: 120, easing: 'ease-in' });
    A($('.spot'), [{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 100 });
    A($('.rays'), [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
    later(finish, 720);
  }, t.exit);
  }
})();

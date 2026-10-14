'use strict';
// Tete 21 game engine — runs on the server, one Table per room code.
// Clients only ever send actions; the table decides everything.

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '3', '4', '5', '6', '7', '8', '9', '10'];
const BOT_NAMES = ['Chidi', 'Ngozi', 'Tunde', 'Amaka', 'Yemi', 'Bola', 'Emeka', 'Ifeoma'];
const BOT_COLORS = ['#8e44ad', '#c0392b', '#2980b9', '#d35400', '#16a085', '#7f8c8d', '#2c3e50', '#a04000'];

const val = c => (c.r === 'A' ? 11 : +c.r);
const cname = c => `${c.r}${c.s}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (+n || 0).toLocaleString('en-GB');
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function makeDeck(n) { const d = []; for (let k = 0; k < n; k++) for (const s of SUITS) for (const r of RANKS) d.push({ s, r, k, id: `${r}${s}${k}` }); return shuffle(d); }
const enc = c => (c ? c.r + c.s + c.k + (c.taken ? 't' : '') : null);
function cleanName(n) { return String(n || '').replace(/[^\p{L}\p{N} '._-]/gu, '').trim().slice(0, 14); }
function cleanAv(av) {
  if (!av || typeof av !== 'object') return null;
  if (av.kind === 'emoji' && typeof av.emoji === 'string') return { kind: 'emoji', emoji: [...av.emoji].slice(0, 2).join('') };
  if (av.kind === 'initial' && /^#[0-9a-f]{6}$/i.test(av.color || '')) return { kind: 'initial', color: av.color };
  return null;
}
function newToken() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
// treats you can buy for your seat, a friend or the whole table (play chips go to the house)
const TREATS = { chapman: { e: '🍹', n: 'Chapman', price: 30 }, palm: { e: '🥥', n: 'Palm wine', price: 40 }, zobo: { e: '🍷', n: 'Zobo', price: 25 }, malt: { e: '🍺', n: 'Malt', price: 30 }, suya: { e: '🍢', n: 'Suya', price: 60 }, puff: { e: '🍩', n: 'Puff-puff', price: 20 }, jollof: { e: '🍛', n: 'Jollof', price: 80 }, pepper: { e: '🍲', n: 'Pepper soup', price: 70 } };
const REACTS = ['Oya!', 'Chai!', 'Na wa o!', 'E choke!', 'Wahala!', 'Ehen!', 'Abeg!', '🔥', '😂', '👏', '🙏', '😱'];
const THANKS = ['E se o! 🙏', 'Thank you o!', 'Ah, my person!', 'Oya, more!', 'Big man! 🔥'];
function sbDesc(type, mine, theirs) { return type === 'first' ? '1st card flushed beats the 2nd' : type === 'cardvcard' ? `board card #${mine + 1} beats #${theirs + 1}` : "final total beats the other's"; }

class Table {
  constructor(code, cfg, send) {
    this.code = code;
    this.send = send; // (table) => void : broadcast snapshots
    this.players = [];
    this.buyIn = Math.min(1e7, Math.max(50, Math.round(+cfg.buyIn) || 1000));
    this.wager = Math.min(this.buyIn, Math.max(5, +cfg.wager || 50));
    this.tableName = String(cfg.tableName || '').replace(/[^\p{L}\p{N} '._&-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Table';
    this.timer = [0, 15, 20, 30].includes(+cfg.timer) ? +cfg.timer : 20;
    this.seats = Math.min(8, Math.max(2, +cfg.seats || 4));
    this.decks = this.seats > 6 ? 2 : 1;
    this.fill = cfg.fill !== false;
    this.side = cfg.side !== false;
    this.series = !!cfg.series;
    this.tieSplit = cfg.tie === 'split';
    this.persistent = !!cfg.keep;
    this.pub = !!cfg.pub;
    this.rid = (typeof cfg.rid === 'string' && /^[a-z0-9]{6,16}$/.test(cfg.rid)) ? cfg.rid : newToken().slice(0, 10);
    this.dealer = -1; this.handNo = 0; this.pot = 0; this.deck = []; this.board = [];
    this.leadSuit = null; this.phase = -1; this.turn = -1; this.deadline = 0;
    this.sideBets = []; this.participants = []; this.busy = false; this.started = false;
    this.trickWinner = null; this.boardSize = 0; this.boardTop = 0; this.tiebreak = false; this.next = null; this.msgHost = '';
    this.fxq = []; this.fxn = 0; this.sbid = 0; this.pend = null; this.closed = false; this.hostId = 0;
    this.createdAt = Date.now(); this.lastActivity = Date.now();
  }
  log(t, cls = '') { this.fx({ k: 'log', t, cls }); }
  fx(e) { e.n = ++this.fxn; this.fxq.push(e); if (this.fxq.length > 40) this.fxq.shift(); this.sync(); }
  sync() { this.lastActivity = Date.now(); if (this._syncT) return; this._syncT = setTimeout(() => { this._syncT = null; this.send(this); }, 40); }

  // ----- people -----
  addHuman(conn, name, av, mic, cam, uid) {
    name = cleanName(name) || 'Guest';
    let p = null;
    if (!this.started) {
      if (this.players.filter(x => !x.gone).length >= this.seats) return { error: 'The table is full.' };
      p = this.mkPlayer(this.players.length, name, false);
      this.players.push(p);
      this.log(`${esc(name)} joined the table`, 'hi');
    } else {
      const bi = this.players.findIndex(x => x.isBot);
      const gi = this.players.findIndex(x => x.gone && !x.isBot);
      if (gi >= 0) { p = this.mkPlayer(gi, name, false); p.color = this.players[gi].color; p.sitout = true; p.joinedMid = true; this.players[gi] = p; this.log(`${esc(name)} sits in from the next hand`, 'hi'); }
      else if (bi >= 0) { const bot = this.players[bi]; p = this.mkPlayer(bot.id, name, false); p.color = bot.color; p.sitout = true; p.joinedMid = true; this.players[bi] = p; this.log(`${esc(name)} takes ${esc(bot.name)}'s seat from the next hand`, 'hi'); }
      else if (this.players.length < this.seats) { p = this.mkPlayer(this.players.length, name, false); p.sitout = true; p.joinedMid = true; this.players.push(p); this.log(`${esc(name)} joined; sits in from the next hand`, 'hi'); }
      else return { error: 'The table is full.' };
    }
    p.conn = conn; p.av = cleanAv(av); p.mic = !!mic; p.cam = !!cam; p.token = newToken(); p.uid = (typeof uid === 'string' && /^[0-9a-f]{16}$/.test(uid)) ? uid : null;
    this.sync(); if (this.onSave) this.onSave();
    return { id: p.id, token: p.token };
  }
  updateHuman(id, h) { const p = this.players[id]; if (!p || p.isBot) return; const nm = cleanName(h.name); if (nm) p.name = nm; p.av = cleanAv(h.av); p.mic = !!h.mic; p.cam = !!h.cam; this.sync(); }
  // connection dropped: hold the seat for a while
  disconnect(id) {
    const p = this.players[id]; if (!p || p.gone || p.isBot) return;
    p.conn = null; p.away = true; this.log(`${esc(p.name)} lost connection — seat held`);
    clearTimeout(p.awayT); if (!this.persistent) p.awayT = setTimeout(() => { if (p.away && !p.conn) this.removeHuman(id); }, 120000);
    const P = this.pend; if (P && P.pid === id && !P.timed) setTimeout(() => { if (this.pend === P && !p.conn) P.done(null); }, 30000);
    this.sync(); if (this.onSave) this.onSave();
  }
  resume(token, conn, hashFn) {
    if (!token) return null; const h = hashFn ? hashFn(token) : null;
    const p = this.players.find(x => !x.isBot && !x.gone && ((x.token && x.token === token) || (h && x.tokenHash && x.tokenHash === h))); if (!p) return null;
    if (!p.token) p.token = token;
    const prev = p.conn && p.conn !== conn ? p.conn : null;
    clearTimeout(p.awayT); p.conn = conn; if (p.away) { p.away = false; this.log(`${esc(p.name)} is back`); }
    this.sync(); if (this.onSave) this.onSave(); return { id: p.id, token: p.token, prev };
  }
  reclaim(id, conn) {
    const p = this.players[id]; if (!p || p.isBot || p.gone || p.conn) return null;
    clearTimeout(p.awayT); p.conn = conn; p.away = false; p.token = newToken(); p.tokenHash = null;
    this.log(`${esc(p.name)} is back`); this.sync(); if (this.onSave) this.onSave();
    return { id: p.id, token: p.token };
  }
  removeHuman(id) {
    const p = this.players[id]; if (!p || p.gone) return;
    clearTimeout(p.awayT); p.gone = true; p.away = false; p.conn = null; this.log(`${esc(p.name)} left the table`);
    if (this.handStart && this.handStart.has(p)) { const start = this.handStart.get(p); this.handStart.delete(p); if (this.onLeave) try { this.onLeave(p, p.chips - start); } catch (e) { console.error('leave hook', e); } }
    if (this.pend && this.pend.pid === p.id) this.pend.done(null);
    if (id === this.hostId && !this.persistent) { const h = this.players.find(x => !x.isBot && !x.gone); if (h) { this.hostId = h.id; this.log(`${esc(h.name)} is now the host`, 'hi'); } }
    if (!this.started) this.compact();
    if (this.onSave) this.onSave();
    this.sync();
  }
  // before the game starts, drop seats of people who left so nobody shows up twice
  compact() {
    if (this.started) return;
    const keep = this.players.filter(p => !p.gone); if (keep.length === this.players.length) return;
    const hostP = this.players[this.hostId];
    keep.forEach((p, i) => { p.id = i; if (p.conn) p.conn.pid = i; });
    this.players = keep;
    let hi = keep.indexOf(hostP); if (hi < 0) hi = keep.findIndex(p => !p.isBot); this.hostId = Math.max(0, hi);
    this.idsChanged = true;
  }
  mkPlayer(id, name, isBot) { return { id, name, isBot, chips: this.buyIn, color: isBot ? BOT_COLORS[id % 8] : '#b8862c', hand: [], dropped: null, picked: [], sitout: false, strikes: 0, revealed: false, av: null, conn: null, gone: false, joinedMid: false, mic: false, cam: false, satOutByTimer: false, streak: 0 }; }
  fillBots() {
    if (!this.fill) return;
    const used = new Set(this.players.map(p => p.name.toLowerCase()));
    const names = shuffle([...BOT_NAMES]).filter(n => !used.has(n.toLowerCase()));
    while (this.players.length < this.seats && names.length) { const p = this.mkPlayer(this.players.length, names.shift(), true); const r = Math.random(); p.cam = r < .45; p.mic = r < .7; this.players.push(p); }
  }
  humansPresent() { return this.players.filter(p => !p.isBot && !p.gone).length; }
  humansConnected() { return this.players.filter(p => !p.isBot && !p.gone && p.conn).length; }
  hostConnected() { const h = this.players[this.hostId]; return !!(h && !h.isBot && !h.gone && h.conn); }

  // ----- persistence (between hands) -----
  toJSON(hashFn) {
    const S = this;
    return { code: S.code, cfg: { buyIn: S.buyIn, wager: S.wager, tableName: S.tableName, timer: S.timer, seats: S.seats, fill: S.fill, side: S.side, series: S.series, tie: S.tieSplit ? 'split' : 'playoff', keep: true, pub: S.pub, rid: S.rid }, pot: S.pot, handNo: S.handNo, dealer: S.dealer, hostId: S.hostId, createdAt: S.createdAt,
      players: S.players.filter(p => !p.isBot && !p.gone).map(p => ({ id: p.id, name: p.name, chips: p.chips, av: p.av, color: p.color, uid: p.uid || null, streak: p.streak || 0, tokenHash: p.tokenHash || (p.token && hashFn ? hashFn(p.token) : null) })) };
  }
  static fromJSON(o, send) {
    const t = new Table(o.code, o.cfg, send); t.pot = o.pot || 0; t.handNo = o.handNo || 0; t.createdAt = o.createdAt || Date.now(); t.persistent = true;
    // compact ids so seats are contiguous; everyone is away until they resume
    o.players.forEach((q, i) => { const p = t.mkPlayer(i, cleanName(q.name) || 'Guest', false); p.chips = Math.max(0, Math.floor(+q.chips || 0)); p.av = cleanAv(q.av); p.token = null; p.tokenHash = typeof q.tokenHash === 'string' ? q.tokenHash : null; p.uid = typeof q.uid === 'string' && /^[0-9a-f]{16}$/.test(q.uid) ? q.uid : null; p.streak = Math.max(0, Math.min(99, q.streak | 0)); p.away = true; p.oldId = q.id; t.players.push(p); });
    const host = t.players.find(p => p.oldId === o.hostId); t.hostId = host ? host.id : 0; t.dealer = t.players.length - 1;
    return t;
  }
  // ----- snapshot per viewer -----
  snapshot(forId) {
    const S = this;
    return {
      now: Date.now(), tn: S.tableName, w: S.wager, bi: S.buyIn, dk: S.decks, tm: S.timer, sd: S.side ? 1 : 0, hn: S.handNo, pot: S.pot, ph: S.phase, turn: S.turn, dl: S.deadline, dlr: S.dealer, tw: S.trickWinner, ls: S.leadSuit, bs: S.boardSize, bt: S.boardTop, bd: S.board.map(enc), pa: S.participants, tb: S.tiebreak ? 1 : 0, st: S.started ? 1 : 0, bz: S.busy ? 1 : 0, cd: S.code.toUpperCase(), kp: S.persistent ? 1 : 0, mh: S.msgHost, host: S.hostId, nx: S.next, me: forId, sr: S.series ? 1 : 0, ad: S.adasiTurn ?? -1, ts: S.tieSplit ? 1 : 0,
      pl: S.players.map(p => { const show = p.id === forId || S.phase >= 6 || p.revealed; return [p.id, p.name, p.isBot ? 1 : 0, p.chips, show ? p.hand.map(enc) : p.hand.map((c, i) => 'x' + p.id + '_' + i), enc(p.dropped), p.sitout ? 1 : 0, p.strikes, p.av ? [p.av.kind[0], p.av.color || p.av.emoji || ''] : null, show ? 1 : 0, p.gone ? 1 : 0, p.mic ? 1 : 0, p.cam ? 1 : 0, p.satOutByTimer ? 1 : 0, p.away ? 1 : 0, p.color, p.treat || '', p.streak || 0]; }),
      sbs: S.sideBets.slice(-8).map(b => [b.id, b.a, b.b, b.type, b.amt, b.mine, b.theirs, b.status, b.result || '', b.winner ?? -1]),
    };
  }

  // ----- actions from clients -----
  waitFor(pid, kinds, ms) {
    return new Promise(res => {
      let to = null; const p = this.players[pid];
      if (!p || p.gone) { res(null); return; }
      if (!(ms > 0) && !p.isBot && !p.conn) ms = 30000;
      const P = { pid, kinds, timed: ms > 0, done: a => { clearTimeout(to); if (this.pend === P) this.pend = null; res(a); } };
      this.pend = P;
      if (ms > 0) to = setTimeout(() => { if (this.pend === P) { this.pend = null; res(null); } }, ms);
    });
  }
  action(pid, a) {
    const p = this.players[pid]; if (!p || p.gone || !a || typeof a !== 'object') return;
    const P = this.pend;
    switch (a.type) {
      case 'start': if ((pid === this.hostId || !this.hostConnected()) && !this.started) this.start(); break;
      case 'drop': case 'take': case 'stay': case 'adasi': if (P && P.pid === pid && P.kinds.includes(a.type)) P.done(a); break;
      case 'deal': case 'next': if (pid === this.hostId && P && P.kinds.includes(a.type)) P.done(a); break;
      case 'rejoin': p.sitout = false; p.satOutByTimer = false; p.strikes = 0; this.log(`${esc(p.name)} rejoins`); break;
      case 'rebuy': if (p.chips < this.wager) { if (this.canBuy && !this.canBuy(p, this.buyIn)) { this.fx({ k: 'toast', pid, t: 'Not enough free chips in your balance to rebuy. Spin the daily wheel in your profile.', ms: 4000 }); break; } p.chips += this.buyIn; p.sitout = false; this.log(`${esc(p.name)} rebuys ${fmt(this.buyIn)}`, 'hi'); if (this.onSave) this.onSave(); } break;
      case 'sb': this.proposeSB(pid, a); break;
      case 'sb_ans': this.answerSB(pid, a); break;
      case 'rebuy_all': if (pid === this.hostId && P && P.kinds.includes('rebuy_all')) P.done(a); break;
      case 'spray': this.spray(pid, a); break;
      case 'treat': this.treat(pid, a); break;
      case 'react': this.react(pid, a); break;
    }
    this.sync();
  }

  // ----- game flow -----
  start() {
    this.fillBots(); this.started = true; this.dealer = this.players.length - 1;
    if (this.players.length < 2) { this.started = false; this.fx({ k: 'toast', pid: this.hostId, t: 'Need at least one more player. Let a friend join, or fill empty seats with computer players.', ms: 4000 }); this.sync(); return; }
    this.sync(); this.playHand(this.players.map(p => p.id)).catch(e => console.error('hand error', e));
  }
  total(p) { return p.hand.reduce((a, c) => a + val(c), 0); }
  hasAdasi(p) { return p.hand.filter(c => c.r === 'A').length >= 2; }
  static seriesIn(cards) { const m = {}; for (const c of cards) { (m[c.r] = m[c.r] || []).push(c); if (m[c.r].length === 3) return m[c.r]; } return null; }
  nextOf(id, ids) { const all = this.players.length; for (let k = 1; k <= all; k++) { const n = (id + k) % all; if (ids.includes(n)) return n; } return ids[0]; }
  orderFrom(start, ids) { const out = [start]; let cur = start; while (out.length < ids.length) { cur = this.nextOf(cur, ids); if (out.includes(cur)) break; out.push(cur); } return out; }
  setPhase(i) { this.phase = i; this.sync(); }
  async playHand(participants, redeal) {
    const S = this; if (S.closed) return;
    while (S.humansConnected() === 0) { if (S.closed) return; S.paused = true; S.sync(); await sleep(1500); }
    S.paused = false;
    S.busy = true; S.handNo++; S.trickWinner = null; S.board = []; S.boardSize = 0; S.boardTop = 0; S.deadline = 0; S.next = null; S.msgHost = '';
    S.players.forEach(p => { p.hand = []; p.dropped = null; p.picked = []; p.revealed = false; if (p.joinedMid) { p.joinedMid = false; p.sitout = false; } if (p.gone) p.sitout = true; if (p.chips < S.wager) p.sitout = true; });
    if (!S.tiebreak && !redeal) participants = S.players.filter(p => !p.sitout && !p.gone && !(p.away && !p.isBot)).map(p => p.id);
    else participants = participants.filter(id => S.players[id] && !S.players[id].sitout);
    S.participants = participants;
    if (S.humansPresent() === 0) { S.busy = false; return; }
    if (participants.length < 2) {
      S.busy = false; S.phase = 6; S.msgHost = 'Not enough players with chips for a hand. Rebuy, or wait for someone to join.'; S.sync();
      await S.waitFor(S.hostId, ['rebuy_all', 'next'], 0);
      S.players.forEach(p => { if (p.gone) return; const need = Math.max(0, S.buyIn - p.chips); if (need && S.canBuy && !S.canBuy(p, need)) return; p.chips = Math.max(p.chips, S.buyIn); p.sitout = false; p.satOutByTimer = false; });
      return S.playHand(S.players.map(p => p.id));
    }
    if (redeal) { /* same dealer, pot stays */ } else if (S.tiebreak) S.tiebreak = false; else S.dealer = S.nextOf(S.dealer, participants);
    if (!redeal || !S.handStart) S.handStart = new Map(S.players.filter(p => !p.isBot && !p.gone).map(p => [p, p.chips]));
    S.deck = makeDeck(S.decks); S.turn = -1; S.sideBets = S.sideBets.filter(b => b.status !== 'pending').slice(-8);
    // 0 wager
    S.setPhase(0);
    if (redeal) { S.log(`<b>Redeal</b> · pot of ${fmt(S.pot)} stays`, 'hi'); S.msgHost = 'Redealing. The pot stays on the table.'; S.sync(); await sleep(1500); }
    else {
      S.log(`<b>Hand ${S.handNo}</b> · dealer button on ${esc(S.players[S.dealer].name)}`, 'hi');
      for (const id of participants) { const p = S.players[id]; p.chips -= S.wager; S.pot += S.wager; S.fx({ k: 'chip', from: id, to: 'pot', cls: 'c25' }); await sleep(140); }
      S.msgHost = 'Side bets are open before the deal. Propose one from the top bar.'; S.sync();
      setTimeout(() => S.maybeBotProposes(), 900);
      await S.waitFor(S.hostId, ['deal'], 8000);
    }
    // 1 deal
    S.setPhase(1); S.fx({ k: 'shuffle' }); await sleep(1150); // the dealer riffles the deck on the felt first
    for (let r = 0; r < 3; r++) for (const id of participants) { S.players[id].hand.push(S.deck.pop()); S.sync(); await sleep(140); }
    await sleep(400);
    if (S.series) { for (const id of participants) { const p = S.players[id]; const tri = Table.seriesIn(p.hand); if (tri) { p.revealed = true; S.sync(); await sleep(500); S.fx({ k: 'series', pid: id, cards: tri.map(enc), who: p.name }); S.log(`<b>Series!</b> ${esc(p.name)} was dealt ${tri.map(cname).join(' ')} — redeal, pot stays`, 'hi'); await sleep(4200); S.handNo--; return S.playHand(participants, true); } } }
    // 2 flush
    S.setPhase(2); S.boardSize = participants.length + 1; S.boardTop = 0; S.sync(); await sleep(300);
    for (let i = 0; i < S.boardSize; i++) { S.board.push(S.deck.pop()); S.sync(); await sleep(380); }
    S.log(`Board: ${S.board.map(cname).join(' ')}`);
    if (S.series) { const tri = Table.seriesIn(S.board); if (tri) { await sleep(400); S.fx({ k: 'series', pid: -1, cards: tri.map(enc), who: 'the board' }); S.log(`<b>Series on the board!</b> ${tri.map(cname).join(' ')} — redeal, pot stays`, 'hi'); S.sideBets.forEach(b => { if (b.status === 'pending' || b.status === 'open') b.status = 'declined'; }); await sleep(4200); S.handNo--; return S.playHand(participants, true); } }
    await S.settleSideBets('flush'); await sleep(500);
    // 3 drop
    S.setPhase(3); S.leadSuit = null;
    for (const id of S.orderFrom(S.nextOf(S.dealer, participants), participants)) {
      const p = S.players[id]; let card; S.turn = id;
      if (S.hasAdasi(p)) { S.adasiTurn = id; S.deadline = S.timer ? Date.now() + S.timer * 1000 : 0; S.sync();
        if (p.isBot) { await sleep(1800 + Math.random() * 800); } else { await S.waitFor(id, ['adasi'], S.timer ? S.timer * 1000 : 0); }
        S.adasiTurn = -1; S.deadline = 0; return S.adasiWin(p, participants); }
      if (p.isBot) { S.deadline = S.timer ? Date.now() + S.timer * 1000 : 0; S.sync(); await sleep(650 + Math.random() * 500); card = S.botDrop(p); }
      else card = await S.humanDrop(p);
      S.deadline = 0; p.hand = p.hand.filter(c => c !== card); p.dropped = card;
      S.log(!S.leadSuit ? `${esc(p.name)} leads with ${cname(card)} — lead suit ${card.s}` : `${esc(p.name)} drops ${cname(card)}`);
      if (!S.leadSuit) S.leadSuit = card.s;
      S.sync(); await sleep(350);
    }
    // 4 trick
    S.setPhase(4); S.turn = -1;
    const played = participants.map(id => ({ p: id, card: S.players[id].dropped })).filter(t => t.card && t.card.s === S.leadSuit).sort((a, b) => val(b.card) - val(a.card));
    const winner = played[0].p; S.trickWinner = winner; S.sync();
    S.log(`${esc(S.players[winner].name)} wins the trick (${cname(played[0].card)})`, 'hi'); S.fx({ k: 'bubble', pid: winner, t: 'Trick!' });
    await sleep(1500);
    // 5 pick
    S.setPhase(5);
    for (const id of S.orderFrom(winner, participants)) {
      if (S.boardTop >= S.board.length) break;
      const p = S.players[id]; S.turn = id; S.sync();
      if (S.total(p) > 21) { S.log(`${esc(p.name)} is already over 21 and can't pick`); S.fx({ k: 'bubble', pid: id, t: 'Bust' }); await sleep(900); continue; }
      if (p.isBot) { S.deadline = S.timer ? Date.now() + S.timer * 1000 : 0; S.sync(); await S.botPick(p); } else await S.humanPick(p);
      S.deadline = 0;
    }
    S.turn = -1;
    // 6 reveal
    S.setPhase(6); S.players.forEach(p => (p.revealed = true)); S.sync(); await sleep(600);
    const live = participants.map(id => S.players[id]).filter(p => S.total(p) <= 21);
    let next, winners = [];
    if (!live.length) { S.msgHost = 'Everyone is bust. The pot stays on the table for the next hand.'; S.log('All players bust — pot carries over', 'hi'); S.sync(); await sleep(1500); next = S.players.map(p => p.id); }
    else {
      const best = Math.max(...live.map(p => S.total(p))); const tied = live.filter(p => S.total(p) === best);
      if (tied.length === 1) {
        const w = tied[0]; winners = [w]; S.botReact(w.id, w.isBot ? [5, 0, 7] : [1, 3, 2, 11]); S.fx({ k: 'banner', t: `${w.name} takes ${fmt(S.pot)}` }); S.fx({ k: 'win', pid: w.id });
        S.msgHost = `<b>${esc(w.name)}</b> wins the pot with ${best}.`; S.log(`${esc(w.name)} wins ${fmt(S.pot)} with ${best}`, 'win');
        S.fx({ k: 'chip', from: 'pot', to: w.id, cls: 'c100', n2: Math.min(6, Math.ceil(S.pot / S.wager)) }); await sleep(700); w.chips += S.pot; S.pot = 0; S.sync(); await sleep(300);
        next = S.players.map(p => p.id);
      } else if (S.tieSplit) {
        winners = tied; const names = tied.map(p => p.name).join(' & '); const share = Math.floor(S.pot / tied.length); const rem = S.pot - share * tied.length;
        S.fx({ k: 'banner', t: `TIE — ${names} share ${fmt(S.pot)}` }); tied.forEach(w => S.fx({ k: 'win', pid: w.id }));
        S.msgHost = `<b>${esc(names)}</b> tie on ${best} and share the pot${rem ? ` (${fmt(rem)} stays on the table)` : ''}.`; S.log(`Tie on ${best}: ${esc(names)} share ${fmt(S.pot)}`, 'win');
        for (const w of tied) S.fx({ k: 'chip', from: 'pot', to: w.id, cls: 'c100', n2: Math.min(6, Math.ceil(share / S.wager)) });
        await sleep(700); for (const w of tied) w.chips += share; S.pot = rem; S.sync(); await sleep(300);
        next = S.players.map(p => p.id);
      } else { S.tiebreak = true; const names = tied.map(p => p.name).join(' and '); S.fx({ k: 'banner', t: 'TIE!' }); S.msgHost = `${esc(names)} tie on ${best}. They top up and go again.`; S.log(`Tie on ${best}: ${esc(names)} play off`, 'hi'); S.sync(); await sleep(1800); next = tied.map(p => p.id); }
    }
    S.streaks(winners, S.tiebreak ? next : null);
    await S.settleSideBets('reveal');
    S.endHand(winners, false);
    S.busy = false; S.next = next; S.msgHost = ''; S.sync(); if (S.onSave) S.onSave();
    await S.waitFor(S.hostId, ['next'], 12000);
    return S.playHand(next);
  }
  async adasiWin(p, participants) {
    const S = this; S.turn = -1;
    const winners = participants.map(id => S.players[id]).filter(x => S.hasAdasi(x));
    if (!winners.includes(p)) winners.unshift(p);
    winners.forEach(w => (w.revealed = true)); S.sync();
    const cards = winners.flatMap(w => w.hand.filter(c => c.r === 'A').slice(0, 2));
    const names = winners.map(w => w.name).join(' & ');
    S.fx({ k: 'adasi', pid: p.id, pids: winners.map(w => w.id), cards: cards.map(enc), who: names, pot: S.pot, split: winners.length > 1 });
    S.log(`<b>ADASI!</b> ${esc(names)} show${winners.length > 1 ? '' : 's'} ${cards.map(cname).join(' ')} and ${winners.length > 1 ? 'share' : 'takes'} ${fmt(S.pot)}`, 'win');
    await sleep(3600);
    S.phase = 6; S.players.forEach(x => (x.revealed = true));
    const share = Math.floor(S.pot / winners.length); const rem = S.pot - share * winners.length;
    for (const w of winners) { S.fx({ k: 'chip', from: 'pot', to: w.id, cls: 'c100', n2: Math.min(6, Math.ceil(share / S.wager)) }); }
    await sleep(700); for (const w of winners) w.chips += share; S.pot = rem;
    S.sideBets.forEach(b => { if (b.status === 'pending' || b.status === 'open') b.status = 'declined'; });
    S.streaks(winners, null); S.endHand(winners, true); S.botReact(p.id, [1, 3, 11, 2]);
    S.msgHost = winners.length > 1 ? `<b>${esc(names)}</b> both hold Adasi and share the pot${rem ? ` (${fmt(rem)} stays on the table)` : ''}.` : `<b>${esc(p.name)}</b> wins by Adasi.`; S.busy = false; S.next = S.players.map(x => x.id); S.sync();
    await S.waitFor(S.hostId, ['next'], 12000);
    return S.playHand(S.next);
  }
  // the hand is over: tell the host app who won and lost what (play chips move to accounts here)
  endHand(winners, adasi) {
    const S = this, start = S.handStart; S.handStart = null; if (!start || S.closed) return;
    const res = [];
    for (const [p, c0] of start) { if (p.isBot) continue; const played = S.participants.includes(p.id) && S.players[p.id] === p, won = winners.includes(p); res.push({ p, delta: p.chips - c0, played, won, adasi: !!adasi && won, total: played && !adasi ? S.total(p) : null }); }
    if (S.onHandEnd) try { S.onHandEnd(res); } catch (e) { console.error('hand end hook', e); }
  }
  // hands won in a row: flames on the seat from two, a shout from three; a play-off keeps the tied players' runs alive
  streaks(winners, held) {
    const S = this;
    for (const id of S.participants) {
      const p = S.players[id]; if (!p || p.gone) continue;
      if (winners.includes(p)) {
        p.streak = (p.streak || 0) + 1;
        if (p.streak >= 2) S.fx({ k: 'streak', pid: p.id, run: p.streak });
        if (p.streak >= 3) S.log(p.streak >= 5 ? `${esc(p.name)} is on fire: ${p.streak} wins in a row 🔥` : `${esc(p.name)} has won ${p.streak} in a row 🔥`, 'hi');
      } else if (!(held && held.includes(p.id))) {
        if ((p.streak || 0) >= 3) { S.fx({ k: 'streakend', pid: p.id, run: p.streak }); S.log(`${esc(p.name)}'s run of ${p.streak} wins is over`); }
        p.streak = 0;
      }
    }
  }
  // the table is closing in the middle of a hand: give everyone back what they put in this hand
  abandon() { const start = this.handStart; this.handStart = null; if (start) for (const [p, c0] of start) p.chips = c0; this.closed = true; if (this.pend) this.pend.done(null); }
  // chips that change hands outside the pot settle at once; the hand's books stay straight
  moved(p, delta, why, other) {
    if (this.handStart && this.handStart.has(p)) this.handStart.set(p, this.handStart.get(p) + delta);
    if (this.onMoved) try { this.onMoved(p, delta, why, other); } catch (e) { console.error('moved hook', e); }
  }
  // quick reactions that float up from your seat
  react(pid, a) { const p = this.players[pid], i = +a.r; if (!p || p.gone || !(i >= 0 && i < REACTS.length)) return; const now = Date.now(); if (now - (p.lastReact || 0) < 1200) return; p.lastReact = now; this.fx({ k: 'react', pid, r: i }); }
  botReact(not, list) { const bots = this.players.filter(p => p.isBot && !p.gone && p.id !== not); if (!bots.length || Math.random() > 0.55) return; const b = bots[Math.floor(Math.random() * bots.length)]; setTimeout(() => this.fx({ k: 'react', pid: b.id, r: list[Math.floor(Math.random() * list.length)] }), 900 + Math.random() * 900); }
  // spray money: notes from your stack onto another player's
  spray(from, a) {
    const S = this, A = S.players[from], B = S.players[+a.to]; if (!A || !B || A === B || A.gone || B.gone || !S.started) return;
    const amt = Math.floor(+a.amt || 0); if (!(amt >= 5)) return;
    if (amt > A.chips) { S.fx({ k: 'toast', pid: from, t: 'Not enough chips in front of you to spray that much.' }); return; }
    A.chips -= amt; B.chips += amt; S.moved(A, -amt, 'spray', B); S.moved(B, amt, 'spray', A);
    S.fx({ k: 'spray', from, to: B.id, amt }); S.log(`${esc(A.name)} sprays ${esc(B.name)} ${fmt(amt)}`, 'hi');
    if (B.isBot) setTimeout(() => S.fx({ k: 'bubble', pid: B.id, t: THANKS[Math.floor(Math.random() * THANKS.length)], ms: 1800 }), 1300);
    S.sync(); if (S.onSave) S.onSave();
  }
  // a drink or small chops for yourself, one player, or a round for everyone
  treat(from, a) {
    const S = this, A = S.players[from], item = TREATS[a.item]; if (!A || A.gone || !item) return;
    const to = a.to === 'all' ? S.players.filter(p => !p.gone).map(p => p.id) : [+a.to].filter(id => S.players[id] && !S.players[id].gone);
    if (!to.length) return; const cost = item.price * to.length;
    if (cost > A.chips) { S.fx({ k: 'toast', pid: from, t: `That costs ${fmt(cost)}. Not enough chips in front of you.` }); return; }
    A.chips -= cost; S.moved(A, -cost, 'treat'); to.forEach(id => (S.players[id].treat = a.item));
    S.fx({ k: 'treat', from, to, item: a.item });
    S.log(a.to === 'all' ? `${esc(A.name)} buys the table a round of ${item.n} ${item.e}` : to[0] === from ? `${esc(A.name)} gets a ${item.n} ${item.e}` : `${esc(A.name)} sends ${esc(S.players[to[0]].name)} a ${item.n} ${item.e}`, 'hi');
    if (a.to !== 'all' && to[0] !== from && S.players[to[0]].isBot) setTimeout(() => S.fx({ k: 'bubble', pid: to[0], t: THANKS[Math.floor(Math.random() * THANKS.length)], ms: 1800 }), 1200);
    S.sync(); if (S.onSave) S.onSave();
  }
  strike(p) { if (p.away) return; p.strikes++; if (p.strikes >= 3) { p.sitout = true; p.satOutByTimer = true; this.fx({ k: 'toast', pid: p.id, t: 'Three timeouts in a row — you are sat out. Tap "Rejoin" to come back.', ms: 4000 }); this.log(`${esc(p.name)} is sat out (timed out 3 times)`); } else this.fx({ k: 'toast', pid: p.id, t: `Time's up — the game acted for you (${p.strikes}/3)`, ms: 2600 }); }
  async humanDrop(p) {
    const S = this; const ms = S.timer ? S.timer * 1000 : 0; S.deadline = ms ? Date.now() + ms : 0; S.sync(); const end = Date.now() + ms;
    for (;;) {
      const a = await S.waitFor(p.id, ['drop'], ms ? Math.max(50, end - Date.now()) : 0);
      if (!a) { if (!p.gone) S.strike(p); const must = S.leadSuit && p.hand.some(c => c.s === S.leadSuit); const legal = must ? p.hand.filter(c => c.s === S.leadSuit) : p.hand.slice(); legal.sort((x, y) => val(x) - val(y)); return legal.find(x => p.hand.filter(y => y !== x).reduce((s, y) => s + val(y), 0) <= 21) || legal[0]; }
      const c = p.hand.find(x => x.id === a.card); if (!c) continue;
      const must = S.leadSuit && p.hand.some(x => x.s === S.leadSuit); if (must && c.s !== S.leadSuit) { S.fx({ k: 'nudge', pid: p.id, t: `You hold a ${S.leadSuit}, so you have to follow suit.` }); continue; }
      const kt = p.hand.filter(x => x !== c).reduce((s, x) => s + val(x), 0); if (kt > 21) { S.fx({ k: 'nudge', pid: p.id, t: `That would leave you on ${kt}, over 21. Drop a different card.` }); continue; }
      p.strikes = 0; return c;
    }
  }
  async humanPick(p) {
    const S = this;
    while (S.boardTop < S.board.length) {
      const c = S.board[S.boardTop]; const t = S.total(p);
      const ms = S.timer ? S.timer * 1000 : 0; S.deadline = ms ? Date.now() + ms : 0; S.sync();
      const a = await S.waitFor(p.id, ['take', 'stay'], ms);
      if (!a) { if (!p.gone) S.strike(p); S.log(`${esc(p.name)} timed out — stays on ${t}`); break; }
      p.strikes = 0;
      if (a.type === 'stay') { S.log(a.bust ? `${esc(p.name)} stays on ${t} (next card would bust)` : `${esc(p.name)} stays on ${t}`); S.fx({ k: 'bubble', pid: p.id, t: a.bust ? "Can't — bust" : 'Stay' }); break; }
      if (t + val(c) > 21) { S.fx({ k: 'nudge', pid: p.id, t: `${cname(c)} would take you to ${t + val(c)}. Over 21 is bust, so you can't take it.` }); continue; }
      S.takeCard(p, c); S.fx({ k: 'sel', pid: p.id, id: c.id }); S.log(`${esc(p.name)} takes ${cname(c)} → ${S.total(p)}`);
      if (S.total(p) === 21) { S.fx({ k: 'bubble', pid: p.id, t: '21!' }); await sleep(700); break; }
    }
  }
  takeCard(p, c) { c.taken = true; this.boardTop++; p.hand.push(c); p.picked.push(c); this.sync(); }
  botDrop(p) {
    const S = this; const must = S.leadSuit && p.hand.some(c => c.s === S.leadSuit);
    const opts = must ? p.hand.filter(c => c.s === S.leadSuit) : p.hand.slice();
    const score = c => { const keep = p.hand.filter(x => x !== c); const t = keep.reduce((a, x) => a + val(x), 0); if (t > 21) return -100; let s = 0; if (!S.leadSuit) s += val(c) * 1.5; else if (must) s += val(c); else s -= val(c) * .3; s += t <= 15 ? 3 : 0; return s; };
    opts.sort((a, b) => score(b) - score(a)); return opts[0];
  }
  async botPick(p) {
    const S = this;
    while (S.boardTop < S.board.length) {
      const c = S.board[S.boardTop]; const t = S.total(p); await sleep(700 + Math.random() * 500);
      if (t + val(c) > 21) { S.fx({ k: 'bubble', pid: p.id, t: 'Stay' }); S.log(`${esc(p.name)} stays on ${t}`); break; }
      const want = t + val(c) === 21 || t < 17 || (t < 19 && Math.random() < .3);
      if (!want) { S.fx({ k: 'bubble', pid: p.id, t: 'Stay' }); S.log(`${esc(p.name)} stays on ${t}`); break; }
      S.takeCard(p, c); S.fx({ k: 'bubble', pid: p.id, t: `Takes ${cname(c)}` }); S.log(`${esc(p.name)} takes ${cname(c)}`);
      if (S.total(p) === 21) { await sleep(400); S.fx({ k: 'bubble', pid: p.id, t: '21!' }); break; }
    }
    await sleep(500);
  }
  // ----- side bets -----
  proposeSB(from, a) {
    const S = this; const A = S.players[from], B = S.players[+a.to]; if (!A || !B || A === B || !S.side || !S.started || B.gone) return;
    const type = ['first', 'cardvcard', 'total'].includes(a.bt) ? a.bt : 'total'; const amt = Math.max(5, Math.floor(+a.amt || 0));
    if (amt > A.chips || amt > B.chips || S.phase >= 5 || S.phase < 0 || (type !== 'total' && S.phase >= 2)) return;
    const n = S.participants.length + 1; const mine = type === 'first' ? 0 : Math.min(n - 1, Math.max(0, +a.mine | 0)), theirs = type === 'first' ? 1 : Math.min(n - 1, Math.max(0, +a.theirs | 0)); if (type === 'cardvcard' && mine === theirs) return;
    const bet = { id: ++S.sbid, a: from, b: B.id, type, amt, mine, theirs, status: 'pending', desc: sbDesc(type, mine, theirs) };
    S.sideBets.push(bet); S.fx({ k: 'bubble', pid: from, t: `Side bet, ${B.name}?`, ms: 2000 });
    if (B.isBot) setTimeout(() => S.answerSB(B.id, { id: bet.id, yes: Math.random() < 0.72 }), 1600);
  }
  answerSB(pid, a) {
    const S = this; const bet = S.sideBets.find(b => b.id === +a.id && b.status === 'pending' && b.b === pid); if (!bet) return;
    const A = S.players[bet.a], B = S.players[bet.b];
    if (a.yes) { bet.status = 'open'; S.fx({ k: 'bubble', pid: B.id, t: "You're on!", ms: 1800 }); S.log(`${esc(B.name)} accepts ${esc(A.name)}'s side bet (${esc(bet.desc)}) for ${fmt(bet.amt)}`, 'hi'); }
    else { bet.status = 'declined'; S.fx({ k: 'bubble', pid: B.id, t: 'No thanks', ms: 1800 }); S.log(`${esc(B.name)} declines ${esc(A.name)}'s side bet (${esc(bet.desc)})`); }
    S.sync();
  }
  maybeBotProposes() {
    const S = this; if (!S.side || S.phase !== 0 || Math.random() > 0.35) return;
    const bots = S.participants.filter(id => S.players[id].isBot), humans = S.participants.filter(id => !S.players[id].isBot && !S.players[id].gone); if (!bots.length || !humans.length) return;
    const b = bots[Math.floor(Math.random() * bots.length)], h = humans[Math.floor(Math.random() * humans.length)];
    const amt = Math.min(S.wager, S.players[b].chips, S.players[h].chips); if (amt < 5) return;
    S.proposeSB(b, { to: h, bt: Math.random() < .5 ? 'first' : 'total', amt, mine: 0, theirs: 1 });
  }
  async settleSideBets(when) {
    const S = this;
    for (const bet of S.sideBets) {
      if (bet.status === 'pending' && ((when === 'flush' && bet.type !== 'total') || when === 'reveal')) { bet.status = 'declined'; continue; }
      if (bet.status !== 'open') continue;
      const A = S.players[bet.a], B = S.players[bet.b]; let res = null;
      if (when === 'flush' && bet.type !== 'total') { const ca = S.board[bet.mine], cb = S.board[bet.theirs]; if (!ca || !cb) continue; res = val(ca) > val(cb) ? 'a' : val(ca) < val(cb) ? 'b' : 'push'; bet.result = `${cname(ca)} vs ${cname(cb)}`; }
      if (when === 'reveal' && bet.type === 'total') { const ta = S.total(A), tb = S.total(B); const va = ta > 21 ? 0 : ta, vb = tb > 21 ? 0 : tb; res = va > vb ? 'a' : va < vb ? 'b' : 'push'; bet.result = `${ta > 21 ? 'bust' : ta} vs ${tb > 21 ? 'bust' : tb}`; }
      if (!res) continue;
      if (res === 'push') { bet.status = 'push'; S.log(`Side bet push: ${bet.result}`); S.fx({ k: 'toast', t: 'Side bet is a push' }); }
      else { const w = res === 'a' ? A : B, l = res === 'a' ? B : A; w.chips += bet.amt; l.chips -= bet.amt; bet.status = 'won'; bet.winner = w.id; S.fx({ k: 'chip', from: l.id, to: w.id, cls: 'c5', n2: 2 }); S.log(`Side bet: ${esc(w.name)} takes ${fmt(bet.amt)} from ${esc(l.name)} (${bet.result})`, 'hi'); S.fx({ k: 'toast', t: `Side bet: ${w.name} wins ${fmt(bet.amt)}` }); }
      S.sync(); await sleep(600);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { Table, cleanName, cleanAv, TREATS, REACTS };
else if (typeof window !== 'undefined') window.TeteEngine = { Table, cleanName, cleanAv, TREATS, REACTS };

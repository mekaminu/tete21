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
const REACTS = ['Oya!', 'Chai!', 'Na wa o!', 'E choke!', 'Wahala!', 'Ehen!', 'Abeg!', '🔥', '😂', '👏', '🙏', '😱', 'Conjour!', 'School boi!', 'Guy play nowwww!', 'Witch people!', 'You be idiot!', 'We go fry egg for you!'];
const THANKS = ['E se o! 🙏', 'Thank you o!', 'Ah, my person!', 'Oya, more!', 'Big man! 🔥'];
const BOT_CHAT = ['Ehen?', 'No wahala 👍', 'Abeg, focus on the game 😂', 'I hear you o', 'We go see 😏', 'Oya, deal!', 'You dey whine me?', 'E go better'];
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
    this.gold = !!cfg.gold;   // a Gold table: the premium look for everyone at it (who may open one is the server's call)
    this.rid = (typeof cfg.rid === 'string' && /^[a-z0-9]{6,16}$/.test(cfg.rid)) ? cfg.rid : newToken().slice(0, 10);
    this.dealer = -1; this.handNo = 0; this.pot = 0; this.deck = []; this.board = [];
    this.leadSuit = null; this.leadBy = -1; this.loans = []; this.loanN = 0; this.phase = -1; this.turn = -1; this.deadline = 0;
    this.sideBets = []; this.participants = []; this.busy = false; this.started = false;
    this.trickWinner = null; this.boardSize = 0; this.boardTop = 0; this.tiebreak = false; this.next = null; this.msgHost = '';
    this.fxq = []; this.fxn = 0; this.sbid = 0; this.pend = null; this.closed = false; this.hostId = 0;
    this.removed = new Set(); // people the host took off the table: they can only come back if the host lets them in
    this.dj = -1;             // who is playing their own music for the table (-1: nobody; the songs play)
    this.djTitle = '';        // what they're playing, when it has a name (a song file's name)
    this.createdAt = Date.now(); this.lastActivity = Date.now();
  }
  log(t, cls = '') { const b = this.logBuf || (this.logBuf = []); b.push({ at: Date.now(), t, cls }); if (b.length > 600) b.splice(0, b.length - 500); this.logDirty = true; this.fx({ k: 'log', t, cls }); }
  fx(e) { e.n = ++this.fxn; this.fxq.push(e); if (this.fxq.length > 40) this.fxq.shift(); this.sync(); }
  sync() { this.lastActivity = Date.now(); if (this._syncT) return; this._syncT = setTimeout(() => { this._syncT = null; this.send(this); }, 40); }

  // ----- people -----
  addHuman(conn, name, av, mic, cam, uid) {
    name = cleanName(name) || 'Guest';
    let p = null;
    if (!this.started) {
      if (this.slots().filter(x => !x.gone).length >= this.seats) return { error: 'The table is full.' };
      p = this.mkPlayer(this.players.length, name, false); p.seat = this.newSeat();
      this.players.push(p);
      this.log(`${esc(name)} joined the table`, 'hi');
    } else {
      // a game that's already going: you sit down watching, and tap Deal me in when you want to play for chips. A seat
      // that's in the hand being played (a computer player's, or an empty chair whose player left during it) still has
      // its cards out, so it can't change hands until the hand ends: you sit beside it and it's yours from the next one
      const inIt = x => !!this.handStart && this.participants.includes(x.id), free = x => !x.watch && !x.hid && !inIt(x) && !this.claimed(x.id);
      const gi = this.players.findIndex(x => x.gone && free(x));
      const bi = this.players.findIndex(x => x.isBot && !x.gone && free(x));
      if (gi >= 0) { const old = this.players[gi]; p = this.mkPlayer(gi, name, false); p.color = old.color; p.seat = old.seat; p.sitout = true; p.watching = true; this.players[gi] = p; this.log(`${esc(name)} sat down and is watching`, 'hi'); }
      else if (bi >= 0) { const bot = this.players[bi]; p = this.mkPlayer(bot.id, name, false); p.color = bot.color; p.seat = bot.seat; p.sitout = true; p.watching = true; this.players[bi] = p; this.log(`${esc(name)} takes ${esc(bot.name)}'s seat and is watching`, 'hi'); }
      else if (this.slots().length < this.seats) { p = this.mkPlayer(this.players.length, name, false); p.seat = this.newSeat(); p.sitout = true; p.watching = true; this.players.push(p); this.log(`${esc(name)} sat down and is watching`, 'hi'); }
      else {
        const tg = this.players.find(x => (x.isBot || x.gone) && !x.watch && !x.hid && !this.claimed(x.id)); if (!tg) return { error: 'The table is full.' };
        p = this.mkPlayer(this.players.length, name, false); p.seat = this.newSeat(); p.sitout = true; p.watching = true; p.takes = tg.id; this.players.push(p);
        this.log(`${esc(name)} sat down and is watching; ${tg.isBot ? esc(tg.name) + "'s" : 'the empty'} seat is theirs from the next hand`, 'hi');
      }
    }
    // someone who sits down in a game that's going doesn't call (drop first) on their first hand
    if (this.started) p.fresh = true;
    p.conn = conn; p.av = cleanAv(av); p.mic = !!mic; p.cam = !!cam; p.token = newToken(); p.uid = (typeof uid === 'string' && /^[0-9a-f]{16}$/.test(uid)) ? uid : null;
    // a computer player with the same name as someone sitting down (there's a real Chidi too) takes another name
    const clash = this.players.find(x => x.isBot && !x.gone && x.name.toLowerCase() === p.name.toLowerCase());
    if (clash) { const used = new Set(this.players.map(x => x.name.toLowerCase())), alt = shuffle([...BOT_NAMES]).find(n => !used.has(n.toLowerCase())); if (alt) { this.log(`The computer player ${esc(clash.name)} is ${esc(alt)} now, so there's one ${esc(p.name)} at the table`); clash.name = alt; } }
    this.sync(); if (this.onSave) this.onSave();
    return { id: p.id, token: p.token };
  }
  addWatcher(conn, name, av, uid) {
    name = cleanName(name) || 'Host';
    let p = this.players.find(x => x.watch && !x.gone && uid && x.uid === uid);
    if (!p) { p = this.mkPlayer(this.players.length, name, false); p.watch = true; p.sitout = true; p.chips = 0; p.bought = 0; p.seat = 1000 + p.id; this.players.push(p); }
    clearTimeout(p.awayT); p.away = false; p.conn = conn; p.av = cleanAv(av); p.token = newToken(); p.uid = (typeof uid === 'string' && /^[0-9a-f]{16}$/.test(uid)) ? uid : null;
    this.sync(); if (this.onSave) this.onSave();
    return { id: p.id, token: p.token };
  }
  // the host role, taken by someone (the owner) whether they play or not
  takeHost(id) {
    const p = this.players[id]; if (!p || p.isBot || p.gone) return false;
    if (this.hostId !== id) { this.hostId = id; this.log(`${esc(p.name)} is the host${p.watch ? ' (hosting, not playing)' : ''}`, 'hi'); }
    if (this.onSave) this.onSave(); this.sync(); return true;
  }
  ownerHost() { const h = this.players[this.hostId]; return !!(h && h.watch && !h.gone); }
  // the owner runs this table, hosting without playing or from his seat: then only he changes the settings
  ownerIsHost() { const h = this.players[this.hostId]; return !!(h && !h.gone && (h.watch || (this.isOwner && this.isOwner(h)))); }
  // seats: everyone but a host who isn't playing; the order around the table (and so the turn order) goes by seat
  slots() { return this.players.filter(p => !p.watch && !p.hid); }
  // a seat someone who sat down mid-hand is waiting for (it's in this hand); it's theirs when the hand ends
  claimed(id) { return this.players.some(q => q.takes === id && !q.gone); }
  applyTakeovers() {
    const S = this;
    for (const p of S.players) {
      if (p.takes == null) continue; const tg = S.players[p.takes]; p.takes = null;
      if (p.gone || !tg || tg.watch || tg.hid || !(tg.isBot || tg.gone)) continue;
      if (!tg.gone) { tg.gone = true; tg.sitout = true; }
      tg.hid = true; p.seat = tg.seat; p.color = tg.color; if (S.dealer === tg.id) S.dealer = p.id;
      S.log(`${esc(p.name)} takes ${tg.isBot ? esc(tg.name) + "'s" : 'the empty'} seat`, 'hi');
    }
  }
  newSeat() { return this.slots().reduce((m, p) => Math.max(m, p.seat != null ? p.seat : p.id), -1) + 1; }
  seatRing() { return this.slots().sort((a, b) => (a.seat - b.seat) || (a.id - b.id)).map(p => p.id); }
  // two players swap seats (between hands; asked in the middle of one, it waits for the next), or the host mixes everyone up
  swapSeats(a, b) {
    const A = this.players[a], B = this.players[b]; if (!A || !B || A.watch || B.watch || A.gone || B.gone || A.hid || B.hid) return;
    const s = A.seat; A.seat = B.seat; B.seat = s;
    this.log(`${esc(A.name)} and ${esc(B.name)} swapped seats`, 'hi'); this.fx({ k: 'seats', t: `${A.name} and ${B.name} swapped seats` });
  }
  shuffleSeats() {
    const ps = this.slots(), seats = shuffle(ps.map(p => p.seat));
    ps.forEach((p, i) => { p.seat = seats[i]; });
    this.log('The seats were shuffled', 'hi'); this.fx({ k: 'seats', t: 'The seats were shuffled' });
  }
  inHand() { return !!this.handStart || this.busy; }
  applySeatChanges() {
    const sw = this.pendingSwaps || [], sh = this.pendingShuffle; this.pendingSwaps = []; this.pendingShuffle = false;
    for (const [a, b] of sw) this.swapSeats(a, b);
    if (sh) this.shuffleSeats();
  }
  askSwap(from, a) {
    const S = this, A = S.players[from], B = S.players[+a.to]; if (!A || !B || A === B || A.gone || B.gone || A.watch || B.watch || A.isBot) return;
    if (B.isBot) return S.doSwap(A.id, B.id);
    (S.swapAsks || (S.swapAsks = new Map())).set(B.id, { from: A.id, at: Date.now() });
    S.fx({ k: 'swap_ask', pid: B.id, from: A.id, name: A.name });
    S.fx({ k: 'toast', pid: A.id, t: `Asked ${B.name} to swap seats with you`, ms: 2500 });
  }
  answerSwap(pid, a) {
    const S = this, B = S.players[pid], r = S.swapAsks && S.swapAsks.get(pid); if (!B || !r || r.from !== +a.from) return;
    S.swapAsks.delete(pid); const A = S.players[r.from]; if (!A || A.gone || Date.now() - r.at > 120000) return;
    if (!a.yes) return S.fx({ k: 'toast', pid: A.id, t: `${B.name} said not now`, ms: 2500 });
    S.doSwap(A.id, B.id);
  }
  doSwap(a, b) {
    const S = this;
    if (S.inHand()) { (S.pendingSwaps || (S.pendingSwaps = [])).push([a, b]); for (const id of [a, b]) S.fx({ k: 'toast', pid: id, t: `You swap seats with ${S.players[id === a ? b : a].name} from the next hand`, ms: 3000 }); }
    else { S.swapSeats(a, b); if (S.onSave) S.onSave(); }
  }
  shuffleAll() {
    const S = this;
    if (S.inHand()) { S.pendingShuffle = true; S.fx({ k: 'toast', pid: S.hostId, t: 'The seats get shuffled when this hand ends', ms: 3000 }); }
    else { S.shuffleSeats(); if (S.onSave) S.onSave(); }
  }
  // sitting out by choice: from the next hand if you're in this one; Deal me in brings you back from the next hand
  sit(p, out) {
    const S = this; if (p.watch) return;
    if (out) {
      if (S.handStart && S.participants.includes(p.id)) { p.sitNext = true; S.fx({ k: 'toast', pid: p.id, t: 'You sit out from the next hand', ms: 2500 }); }
      else { p.sitout = true; p.watching = true; }
      S.log(`${esc(p.name)} is sitting out for a bit`);
    } else {
      const was = p.sitout || p.sitNext;
      p.sitNext = false; p.watching = false; p.sitout = false; p.satOutByTimer = false; p.strikes = 0; p.joinedMid = false;
      if (p.chips < S.wager) S.fx({ k: 'toast', pid: p.id, t: 'Rebuy first: you need chips to cover the wager', ms: 3000 });
      else if (was) S.log(`${esc(p.name)} is in from the next hand`, 'hi');
    }
  }
  updateHuman(id, h) { const p = this.players[id]; if (!p || p.isBot) return; const nm = cleanName(h.name); if (nm) p.name = nm; p.av = cleanAv(h.av); p.mic = !!h.mic; p.cam = !!h.cam; this.sync(); }
  // connection dropped: hold the seat for a while
  disconnect(id) {
    const p = this.players[id]; if (!p || p.gone || p.isBot) return;
    if (this.dj === id) { this.dj = -1; this.djTitle = ''; }
    p.conn = null; p.away = true; this.log(p.watch ? `${esc(p.name)} stepped away${this.hostId === id ? ' (still the host)' : ''}` : `${esc(p.name)} lost connection — seat held`);
    clearTimeout(p.awayT); if (!this.persistent && !p.watch) p.awayT = setTimeout(() => { if (p.away && !p.conn) this.removeHuman(id); }, 120000);
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
  removeHuman(id, note) {
    const p = this.players[id]; if (!p || p.gone) return;
    if (this.dj === id) { this.dj = -1; this.djTitle = ''; }
    clearTimeout(p.awayT); p.gone = true; p.away = false; p.conn = null; this.log(note || `${esc(p.name)} left the table`);
    if (this.handStart && this.handStart.has(p)) { const start = this.handStart.get(p); this.handStart.delete(p); if (this.onLeave) try { this.onLeave(p, p.chips - start); } catch (e) { console.error('leave hook', e); } }
    if (this.pend && this.pend.pid === p.id) this.pend.done(null);
    if (this.vote) this.checkVote();
    if (id === this.hostId) { const h = this.players.find(x => !x.isBot && !x.gone && x.conn) || this.players.find(x => !x.isBot && !x.gone); if (h) { this.hostId = h.id; this.log(`${esc(h.name)} is now the host`, 'hi'); } }
    if (!this.started) this.compact();
    if (this.onSave) this.onSave();
    this.sync();
  }
  // the host takes someone off the table (a person or a computer player): the seat goes, mid-hand they're out of
  // the hand like anyone who leaves, and a person can only come back if the host lets them in
  // someone plays music from their computer for the table (one at a time: the latest takes over), or stops
  setDj(id, on, title) {
    const p = this.players[id]; if (!p || p.isBot || p.gone) return false;
    const t = typeof title === 'string' ? title.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 80) : '';
    if (on) {
      if (this.dj === id) { if (t === this.djTitle) return false; this.djTitle = t; this.sync(); return true; }
      this.dj = id; this.djTitle = t; this.log(`🎵 ${esc(p.name)} is playing music for the table`, 'hi');
    } else { if (this.dj !== id) return false; this.dj = -1; this.djTitle = ''; this.log(`${esc(p.name)} stopped their music`); }
    this.sync(); return true;
  }
  // the host hands the table to someone still at it (then they can leave and the game carries on)
  makeHost(id) {
    const p = this.players[id], was = this.players[this.hostId];
    if (!p || p.isBot || p.gone || p.away || id === this.hostId) return false;
    this.hostId = id;
    const by = was && !was.isBot && !was.gone ? was.name : 'The host';
    this.log(`${esc(by)} made ${esc(p.name)} the host`, 'hi');
    this.fx({ k: 'toast', pid: id, t: `${by} made you the host. You run the table now: settings, starting hands and letting people in.`, ms: 5000 });
    if (this.onSave) this.onSave();
    this.sync(); return true;
  }
  takeOff(id) {
    const p = this.players[id], h = this.players[this.hostId]; if (!p || p.gone || id === this.hostId) return false;
    if (!p.isBot) this.removed.add(p.uid || 'n:' + p.name.toLowerCase());
    this.removeHuman(id, `${esc(h ? h.name : 'The host')} took ${esc(p.name)} off the table`);
    return true;
  }
  wasRemoved(uid, name) { return (!!uid && this.removed.has(uid)) || this.removed.has('n:' + String(name || '').toLowerCase()); }
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
  mkPlayer(id, name, isBot) { return { id, name, isBot, chips: this.buyIn, color: isBot ? BOT_COLORS[id % 8] : '#b8862c', hand: [], dropped: null, picked: [], sitout: false, strikes: 0, revealed: false, av: null, conn: null, gone: false, joinedMid: false, seat: id, watch: false, watching: false, sitNext: false, mic: false, cam: false, satOutByTimer: false, streak: 0, bought: this.buyIn, wins: 0, best: 0 }; }
  fillBots() {
    if (!this.fill) return;
    const used = new Set(this.players.map(p => p.name.toLowerCase()));
    const names = shuffle([...BOT_NAMES]).filter(n => !used.has(n.toLowerCase()));
    while (this.slots().length < this.seats && names.length) { const p = this.mkPlayer(this.players.length, names.shift(), true); p.seat = this.newSeat(); const r = Math.random(); p.cam = r < .45; p.mic = r < .7; this.players.push(p); }
  }
  humansPresent() { return this.players.filter(p => !p.isBot && !p.gone && !p.watch).length; }
  humansConnected() { return this.players.filter(p => !p.isBot && !p.gone && !p.watch && p.conn).length; }
  hostConnected() { const h = this.players[this.hostId]; return !!(h && !h.isBot && !h.gone && h.conn); }

  // ----- persistence (between hands) -----
  toJSON(hashFn) {
    const S = this;
    return { code: S.code, cfg: { buyIn: S.buyIn, wager: S.wager, tableName: S.tableName, timer: S.timer, seats: S.seats, fill: S.fill, side: S.side, series: S.series, tie: S.tieSplit ? 'split' : 'playoff', keep: true, pub: S.pub, gold: S.gold, rid: S.rid }, pending: S.pendingCfg || null, loans: S.loans, removed: [...S.removed].slice(-100), hostFor: S.hostFor || null, pot: S.pot, handNo: S.handNo, dealer: S.dealer, hostId: S.hostId, createdAt: S.createdAt,
      players: S.players.filter(p => !p.isBot && !p.gone).map(p => ({ id: p.id, name: p.name, chips: p.chips, av: p.av, color: p.color, uid: p.uid || null, streak: p.streak || 0, bought: p.bought || 0, wins: p.wins || 0, best: p.best || 0, seat: p.seat, watch: p.watch ? 1 : 0, tokenHash: p.tokenHash || (p.token && hashFn ? hashFn(p.token) : null) })) };
  }
  static fromJSON(o, send) {
    const t = new Table(o.code, o.cfg, send); t.pendingCfg = o.pending && typeof o.pending === 'object' ? o.pending : null; t.pot = o.pot || 0; t.handNo = o.handNo || 0; t.createdAt = o.createdAt || Date.now(); t.persistent = true;
    t.removed = new Set(Array.isArray(o.removed) ? o.removed.filter(x => typeof x === 'string' && x.length <= 80).slice(-100) : []);
    t.hostFor = typeof o.hostFor === 'string' && /^[0-9a-f]{16}$/.test(o.hostFor) ? o.hostFor : null;
    // compact ids so seats are contiguous; everyone is away until they resume
    o.players.forEach((q, i) => { const p = t.mkPlayer(i, cleanName(q.name) || 'Guest', false); p.chips = Math.max(0, Math.floor(+q.chips || 0)); p.av = cleanAv(q.av); p.token = null; p.tokenHash = typeof q.tokenHash === 'string' ? q.tokenHash : null; p.uid = typeof q.uid === 'string' && /^[0-9a-f]{16}$/.test(q.uid) ? q.uid : null; p.streak = Math.max(0, Math.min(99, q.streak | 0)); p.bought = q.bought != null && isFinite(+q.bought) ? Math.floor(+q.bought) : t.buyIn; p.wins = Math.max(0, q.wins | 0); p.best = Math.max(0, q.best | 0); p.away = true; p.oldId = q.id; p.seat = isFinite(+q.seat) && q.seat !== null ? +q.seat : i; if (q.watch) { p.watch = true; p.sitout = true; p.chips = 0; p.bought = 0; } t.players.push(p); });
    const host = t.players.find(p => p.oldId === o.hostId); t.hostId = host ? host.id : 0; t.dealer = t.players.length - 1;
    // loans carry over with their names; a player who didn't come back can't be paid back in the game
    const idOf = old => { const p = t.players.find(x => x.oldId === old); return p ? p.id : -1; };
    t.loans = (Array.isArray(o.loans) ? o.loans : []).slice(-60).map(l => ({ id: Math.max(0, l.id | 0), from: idOf(l.from), to: idOf(l.to), amt: Math.max(0, Math.floor(+l.amt || 0)), paid: Math.max(0, Math.floor(+l.paid || 0)), fromName: cleanName(l.fromName) || 'Someone', toName: cleanName(l.toName) || 'Someone', out: !!l.out })).filter(l => l.amt > 0);
    t.loanN = t.loans.reduce((m, l) => Math.max(m, l.id), 0);
    return t;
  }
  // ----- snapshot per viewer -----
  snapshot(forId) {
    const S = this;
    return {
      now: Date.now(), gd: S.gold ? 1 : 0, oh: S.ownerIsHost() ? 1 : 0, po: S.playoff ? 1 : 0,
      // a vote on the table (redeal, or busting the board's series), the window to ask about a series on the board
      // that isn't in a row, your own series to bust or play (only you see it), and whether a redeal can be asked now
      vt: S.vote ? [S.vote.n, S.vote.kind, S.vote.from, S.vote.until, [...S.vote.yes], S.voters().map(p => p.id), (S.vote.cards || []).map(enc)] : null,
      ba: S.boardAsk ? [S.boardAsk.until, S.boardAsk.cards.map(enc)] : null,
      sa: S.seriesAsk && S.seriesAsk.pid === forId ? [S.seriesAsk.until, S.seriesAsk.cards.map(enc)] : null,
      cv: S.canVote() && !S.vote && (S.participants || []).includes(forId) ? 1 : 0, dj: S.dj, djt: S.dj >= 0 ? S.djTitle : '', tn: S.tableName, w: S.wager, bi: S.buyIn, dk: S.decks, tm: S.timer, sd: S.side ? 1 : 0, hn: S.handNo, pot: S.pot, ph: S.phase, turn: S.turn, dl: S.deadline, dlr: S.dealer, tw: S.trickWinner, ls: S.leadSuit, lb: S.leadBy, ln: S.loans.map(l => [l.id, l.from, l.to, l.amt, l.paid, l.fromName, l.toName, l.out ? 1 : 0]), bs: S.boardSize, bt: S.boardTop, bd: S.board.map(enc), bw: S.board.map(c => (c && c.taken && c.by != null ? c.by : -1)), pa: S.participants, tb: S.tiebreak ? 1 : 0, st: S.started ? 1 : 0, bz: S.busy ? 1 : 0, cd: S.code.toUpperCase(), kp: S.persistent ? 1 : 0, mh: S.msgHost, host: S.hostId, nx: S.next, me: forId, sr: S.series ? 1 : 0, ad: S.adasiTurn ?? -1, ts: S.tieSplit ? 1 : 0, fl: S.fill ? 1 : 0, pb: S.pub ? 1 : 0, pc: S.pendingCfg || null,
      pl: S.players.map(p => { const show = p.id === forId || p.revealed; return [p.id, p.name, p.isBot ? 1 : 0, p.chips, show ? p.hand.map(enc) : p.hand.map((c, i) => 'x' + p.id + '_' + i), enc(p.dropped), p.sitout ? 1 : 0, p.strikes, p.av ? [p.av.kind[0], p.av.color || p.av.emoji || ''] : null, show ? 1 : 0, p.gone ? 1 : 0, p.mic ? 1 : 0, p.cam ? 1 : 0, p.satOutByTimer ? 1 : 0, p.away ? 1 : 0, p.color, p.treat || '', p.streak || 0, p.bought || 0, p.wins || 0, p.best || 0, p.voice || null, !p.isBot && S.noRebuy && S.noRebuy(p) ? 1 : 0, p.watching ? 1 : 0, p.seat != null ? p.seat : p.id, p.watch ? 1 : 0, p.sitNext ? 1 : 0, p.hid ? 1 : 0]; }),
      sbs: S.sideBets.slice(-8).map(b => [b.id, b.a, b.b, b.type, b.amt, b.mine, b.theirs, b.status, b.result || '', b.winner ?? -1]),
    };
  }

  // ----- actions from clients -----
  waitFor(pid, kinds, ms) {
    return new Promise(res => {
      const p = this.players[pid];
      if (!p || p.gone) { res(null); return; }
      // someone who isn't there, or a host who isn't playing (Meka hosting from the side), never holds the table up
      if (!(ms > 0) && !p.isBot && (!p.conn || p.watch)) ms = 30000;
      const P = { pid, kinds, timed: ms > 0, to: null, end: 0, left: null, done: a => { clearTimeout(P.to); if (this.pend === P) this.pend = null; res(a); } };
      P.arm = t => { clearTimeout(P.to); P.left = null; P.end = Date.now() + t; P.to = setTimeout(() => { if (this.pend === P) { this.pend = null; res(null); } }, t); };
      this.pend = P;
      // while the table votes on a redeal the clock waits
      if (ms > 0) { if (this.vote) { P.left = ms; this.deadline = 0; } else P.arm(ms); }
    });
  }
  pauseClock() { const P = this.pend; if (P && P.timed && P.to) { clearTimeout(P.to); P.to = null; P.left = Math.max(3000, P.end - Date.now()); this.deadline = 0; } }
  resumeClock() {
    const P = this.pend; if (!P || !P.timed || P.to || P.left == null) return;
    P.arm(P.left); if (this.turn === P.pid) this.deadline = P.end;
    if (this.seriesAsk && this.seriesAsk.pid === P.pid) this.seriesAsk.until = P.end;
  }
  // ----- the table votes: anyone in the hand can ask to redeal it (start the hand again, the pot stays), or to bust
  // a series on the board that isn't in a row. Everyone in the hand has to say yes; one no and play goes on.
  // Computer players answer for themselves: happy with their cards (17 to 21 after their drop, or Adasi), they say no.
  // The turn clock stops while they decide.
  botLikesHand(b) {
    if (this.adasiStands(b)) return true;
    const h = b.hand, sum = h.reduce((a, c) => a + val(c), 0);
    const best = b.dropped || h.length < 3 ? sum : Math.max(...h.map(c => sum - val(c)).filter(x => x <= 21), 0);
    return best >= 17 && best <= 21;
  }
  voters() { return (this.participants || []).map(id => this.players[id]).filter(p => p && !p.isBot && !p.gone && !p.watch); }
  canVote() { return !!this.handStart && this.phase >= 1 && this.phase <= 5 && !this.abortHand && !this.closed; }
  askVote(pid, kind) {
    const S = this, p = S.players[pid];
    if (!p || p.isBot || p.gone || !S.participants.includes(pid) || !S.canVote() || S.vote) return;
    if (kind === 'board' && !S.boardAsk) return;
    const last = (S.lastAsk || (S.lastAsk = new Map())).get(pid) || 0;
    if (Date.now() - last < 25000) { S.fx({ k: 'toast', pid, t: 'You asked a moment ago. Give it a little while.', ms: 2500 }); return; }
    S.lastAsk.set(pid, Date.now());
    const ms = kind === 'board' ? 15000 : 20000; S.voteN = (S.voteN || 0) + 1;
    S.vote = { n: S.voteN, kind, from: pid, yes: new Set([pid]), until: Date.now() + ms, cards: kind === 'board' ? S.boardAsk.cards : null };
    const n = S.voteN; S.vote.t = setTimeout(() => { if (S.vote && S.vote.n === n) S.endVote(false, ''); }, ms);
    S.pauseClock();
    S.log(kind === 'board' ? `${esc(p.name)} asks to bust the series on the board` : `${esc(p.name)} asks everyone to redeal this hand`, 'hi');
    S.fx({ k: 'vote', from: pid, kind });
    // the computer players in the hand answer after a moment
    const bots = S.participants.map(id => S.players[id]).filter(b => b && b.isBot && !b.gone), no = bots.find(b => S.botLikesHand(b));
    if (no) setTimeout(() => { if (S.vote && S.vote.n === n) S.endVote(false, no.name); }, 1200 + Math.random() * 900);
    S.checkVote(); S.sync();
  }
  answerVote(pid, a) {
    const S = this, v = S.vote, p = S.players[pid]; if (!v || !p || v.n !== +a.n || !S.voters().includes(p)) return;
    if (a.yes) { v.yes.add(pid); S.checkVote(); } else S.endVote(false, p.name);
    S.sync();
  }
  checkVote() {
    const S = this, v = S.vote; if (!v || !S.voters().every(p => v.yes.has(p.id))) return;
    if (S.participants.some(id => { const b = S.players[id]; return b && b.isBot && !b.gone && S.botLikesHand(b); })) return; // a computer player says no in a moment
    S.endVote(true);
  }
  endVote(pass, who) {
    const S = this, v = S.vote; if (!v) return; clearTimeout(v.t); S.vote = null;
    if (pass) { S.abortHand = { kind: v.kind, cards: v.cards }; if (S.pend) S.pend.done(null); }
    else {
      const t = who ? `${who} said play on, so the hand carries on` : 'Not everyone said yes in time, so the hand carries on';
      S.log(esc(t)); S.fx({ k: 'toast', t, ms: 3200 }); S.resumeClock();
    }
    S.sync();
  }
  // everyone agreed: the hand starts again with the same people and the same pot (no new wagers)
  async restartHand(participants) {
    const S = this, ab = S.abortHand || {}; S.abortHand = null;
    if (S.vote) { clearTimeout(S.vote.t); S.vote = null; }
    S.boardAsk = null; S.seriesAsk = null; S.turn = -1; S.deadline = 0; S.adasiTurn = -1; S.msgHost = ''; S.sync();
    if (S.closed) return;
    if (ab.kind === 'board') {
      await sleep(300); S.fx({ k: 'series', pid: -1, cards: (ab.cards || []).map(enc), who: 'the board' });
      S.log(`<b>Series on the board!</b> ${(ab.cards || []).map(cname).join(' ')} — everyone agreed to bust it: redeal, pot stays`, 'hi');
      S.sideBets.forEach(b => { if (b.status === 'pending' || b.status === 'open') b.status = 'declined'; });
      await sleep(4200);
    } else { S.fx({ k: 'banner', t: 'REDEAL! Everyone agreed' }); S.log('<b>Everyone agreed to redeal.</b> The hand starts again and the pot stays', 'hi'); await sleep(2000); }
    if (S.closed) return; S.handNo--; return S.playHand(participants, true);
  }
  action(pid, a, owner) {
    const p = this.players[pid]; if (!p || p.gone || !a || typeof a !== 'object') return;
    const P = this.pend;
    // the owner hosting without playing runs the table, but never plays or holds chips
    if (p.watch && !['start', 'deal', 'next', 'rebuy_all', 'settings', 'shuffle', 'chat', 'react'].includes(a.type)) return;
    switch (a.type) {
      case 'start': if ((pid === this.hostId || !this.hostConnected()) && !this.started) this.start(); break;
      case 'drop': case 'take': case 'stay': case 'adasi': case 'series_ans': if (P && P.pid === pid && P.kinds.includes(a.type)) P.done(a); break;
      case 'redeal_ask': this.askVote(pid, 'redeal'); break;
      case 'board_ask': this.askVote(pid, 'board'); break;
      case 'vote': this.answerVote(pid, a); break;
      case 'deal': case 'next': if (pid === this.hostId && P && P.kinds.includes(a.type)) P.done(a); break;
      case 'rejoin': this.sit(p, false); break;
      case 'sit': this.sit(p, !!a.out); break;
      case 'swap_ask': this.askSwap(pid, a); break;
      case 'swap_ans': this.answerSwap(pid, a); break;
      case 'shuffle': if (pid === this.hostId || owner) this.shuffleAll(); break;
      case 'rebuy': if (p.chips < this.wager) { if (this.noRebuy && this.noRebuy(p)) { this.fx({ k: 'toast', pid, t: "Buying back in is off for you, so you're out for this game.", ms: 4000 }); break; } if (this.canBuy && !this.canBuy(p, this.buyIn)) { this.fx({ k: 'toast', pid, t: 'Not enough free chips in your balance to rebuy. Spin the daily wheel in your profile.', ms: 4000 }); break; } p.chips += this.buyIn; p.bought = (p.bought || 0) + this.buyIn; p.sitout = false; p.broke = false; this.log(`${esc(p.name)} rebuys ${fmt(this.buyIn)}`, 'hi'); if (this.onSave) this.onSave(); } break;
      case 'sb': this.proposeSB(pid, a); break;
      case 'sb_ans': this.answerSB(pid, a); break;
      case 'rebuy_all': if (pid === this.hostId && P && P.kinds.includes('rebuy_all')) P.done(a); break;
      case 'spray': this.spray(pid, a); break;
      case 'lend': this.lend(pid, a); break;
      case 'give': this.give(pid, a); break;
      case 'repay': this.repay(pid, a); break;
      case 'settle_loan': this.settleLoan(pid, a); break;
      case 'treat': this.treat(pid, a); break;
      case 'react': this.react(pid, a); break;
      case 'chat': this.chat(pid, a); break;
      case 'settings': this.settings(pid, a, owner); break;
    }
    this.sync();
  }

  // ----- game flow -----
  start() {
    this.fillBots(); this.started = true; this.dealer = this.players.length - 1;
    if (this.slots().length < 2) { this.started = false; this.fx({ k: 'toast', pid: this.hostId, t: 'Need at least one more player. Let a friend join, or fill empty seats with computer players.', ms: 4000 }); this.sync(); return; }
    this.sync(); this.playHand(this.players.map(p => p.id)).catch(e => console.error('hand error', e));
  }
  total(p) { return p.hand.reduce((a, c) => a + val(c), 0); }
  hasAdasi(p) { return p.hand.filter(c => c.r === 'A').length >= 2; }
  // Adasi is two Aces, and only the first to drop (the caller) can declare it before the call. Everyone else waits
  // for the call (Meka, 2026-10-17): when following the called suit makes them drop one of their Aces (their only
  // cards of that suit are Aces), the Adasi is broken and that Ace is dropped like any card. When the call misses
  // their Aces (no card of that suit, or another card of it they can drop instead), they declare on their turn.
  static adasiStands(hand, lead) {
    const aces = h => h.filter(c => c.r === 'A').length;
    if (aces(hand) < 2) return false;
    if (!lead || !hand.some(c => c.s === lead)) return true;
    return hand.some(c => c.s === lead && aces(hand.filter(x => x !== c)) >= 2);
  }
  adasiStands(p) { return Table.adasiStands(p.hand, p.dropped ? null : this.leadSuit); }
  static seriesIn(cards) { const m = {}; for (const c of cards) { (m[c.r] = m[c.r] || []).push(c); if (m[c.r].length === 3) return m[c.r]; } return null; }
  // three of a kind next to each other on the board, in the order they were opened (that one busts by itself)
  static seriesRun(cards) { for (let i = 0; i + 2 < cards.length; i++) if (cards[i] && cards[i + 1] && cards[i + 2] && cards[i].r === cards[i + 1].r && cards[i].r === cards[i + 2].r) return cards.slice(i, i + 3); return null; }
  nextOf(id, ids) { const ring = this.seatRing(); let i = ring.indexOf(id); if (i < 0) i = ring.length - 1; for (let k = 1; k <= ring.length; k++) { const n = ring[(i + k) % ring.length]; if (ids.includes(n)) return n; } return ids[0]; }
  // The deal moves round every new hand (tie play-offs too), so the first to drop is the next player each time. A
  // redeal (a series busted, a series on the board, the table voting to redeal) is the same hand again, so the same
  // person calls. Someone who has just sat down doesn't call on their first hand: the deal moves on past them (they
  // drop last), and from then on they take their turn like everyone else.
  moveDeal(participants, redeal) {
    const S = this; if (redeal) return;
    S.dealer = S.nextOf(S.dealer, participants);
    if (participants.some(id => S.players[id] && !S.players[id].fresh))
      for (let k = 0; k < participants.length; k++) { const c = S.players[S.nextOf(S.dealer, participants)]; if (!c || !c.fresh) break; S.dealer = c.id; }
    for (const id of participants) if (S.players[id]) S.players[id].fresh = false;
  }
  orderFrom(start, ids) { const out = [start]; let cur = start; while (out.length < ids.length) { cur = this.nextOf(cur, ids); if (out.includes(cur)) break; out.push(cur); } return out; }
  setPhase(i) { this.phase = i; this.sync(); }
  async playHand(participants, redeal) {
    const S = this; if (S.closed) return;
    while (S.humansConnected() === 0) { if (S.closed) return; S.paused = true; S.sync(); await sleep(1500); }
    S.paused = false;
    // a play-off (the pot stayed after a tie, or everyone bust) is for the people who were in that hand only:
    // newcomers, and anyone who dealt themselves back in, wait for the next new hand (so does a seat changing hands)
    if (!redeal) { S.applyPending(); if (!S.tiebreak) S.applyTakeovers(); S.applySeatChanges(); S.playoff = !!S.tiebreak; }
    S.busy = true; S.handNo++; S.trickWinner = null; S.leadSuit = null; S.leadBy = -1; S.board = []; S.boardSize = 0; S.boardTop = 0; S.deadline = 0; S.next = null; S.msgHost = '';
    S.players.forEach(p => { p.hand = []; p.dropped = null; p.picked = []; p.revealed = false; if (p.watch) { p.sitout = true; return; } if (p.sitNext && !redeal) { p.sitNext = false; p.sitout = true; p.watching = true; } if (p.joinedMid) { p.joinedMid = false; p.sitout = false; } if (p.gone) p.sitout = true;
      if (p.chips < S.wager) { if (!p.sitout) p.broke = true; p.sitout = true; }
      else if (p.broke && !p.gone && !p.satOutByTimer) { p.broke = false; p.sitout = false; S.log(`${esc(p.name)} is back in the game`, 'hi'); S.fx({ k: 'bubble', pid: p.id, t: "I'm back! 💪", ms: 1800 }); } });
    if (!S.tiebreak && !redeal) participants = S.players.filter(p => !p.sitout && !p.gone && !(p.away && !p.isBot)).map(p => p.id);
    else participants = participants.filter(id => { const p = S.players[id]; return p && !p.sitout && !p.gone && !(p.away && !p.isBot); });
    // a play-off with fewer than two of its players left can't be played: it's over, and this is a new hand for everyone
    if (participants.length < 2 && S.tiebreak && !redeal) { S.tiebreak = false; S.playoff = false; participants = S.players.filter(p => !p.sitout && !p.gone && !(p.away && !p.isBot)).map(p => p.id); }
    S.participants = participants;
    if (S.humansPresent() === 0) { S.busy = false; return; }
    if (participants.length < 2) {
      S.busy = false; S.phase = 6; S.msgHost = 'Not enough players with chips for a hand. Rebuy, or wait for someone to join.'; S.sync();
      await S.waitFor(S.hostId, ['rebuy_all', 'next'], 0);
      S.players.forEach(p => { if (p.gone || p.watch || p.watching || (S.noRebuy && S.noRebuy(p))) return; const need = Math.max(0, S.buyIn - p.chips); if (need && S.canBuy && !S.canBuy(p, need)) return; p.chips = Math.max(p.chips, S.buyIn); p.bought = (p.bought || 0) + need; p.sitout = false; p.satOutByTimer = false; });
      return S.playHand(S.players.map(p => p.id));
    }
    if (S.tiebreak) S.tiebreak = false;
    S.moveDeal(participants, redeal);
    if (!redeal || !S.handStart) S.handStart = new Map(S.players.filter(p => !p.isBot && !p.gone && !p.watch).map(p => [p, p.chips]));
    S.deck = makeDeck(S.decks); S.turn = -1; S.sideBets = S.sideBets.filter(b => b.status !== 'pending').slice(-8);
    S.sideBets.forEach(b => { if (b.status === 'open' && !(participants.includes(b.a) && participants.includes(b.b))) { b.status = 'declined'; S.log(`A carried side bet between ${esc(S.players[b.a].name)} and ${esc(S.players[b.b].name)} is off: one of them is out of this hand`); } });
    // 0 wager
    S.setPhase(0);
    if (S.playoff && !redeal) S.log(`Play-off for the pot of ${fmt(S.pot)}: only the players from the last hand are in it`, 'hi');
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
    if (S.abortHand) return S.restartHand(participants);
    // a series (three of a kind) in your hand: you choose, privately, to bust it (the hand is dealt again and the pot
    // stays, with the drama) or to play it. No answer in time, or a computer player: it busts, as it always has
    if (S.series) for (const id of S.orderFrom(S.nextOf(S.dealer, participants), participants)) {
      const p = S.players[id], tri = Table.seriesIn(p.hand); if (!tri) continue;
      let bust = true;
      if (!p.isBot && p.conn && !p.away) {
        S.seriesAsk = { pid: id, cards: tri, until: Date.now() + 12000 }; S.msgHost = 'One moment…'; S.sync();
        const a = await S.waitFor(id, ['series_ans'], 12000);
        S.seriesAsk = null; S.msgHost = '';
        if (S.abortHand) return S.restartHand(participants);
        bust = !a || a.bust !== false;
      }
      if (bust) { p.revealed = true; S.sync(); await sleep(500); S.fx({ k: 'series', pid: id, cards: tri.map(enc), who: p.name }); S.log(`<b>Series!</b> ${esc(p.name)} busts ${tri.map(cname).join(' ')} — redeal, pot stays`, 'hi'); await sleep(4200); S.handNo--; return S.playHand(participants, true); }
      S.sync();
    }
    // 2 flush
    S.setPhase(2); S.boardSize = participants.length + 1; S.boardTop = 0; S.sync(); await sleep(300);
    for (let i = 0; i < S.boardSize; i++) { S.board.push(S.deck.pop()); S.sync(); await sleep(380); }
    S.log(`Board: ${S.board.map(cname).join(' ')}`);
    if (S.abortHand) return S.restartHand(participants);
    if (S.series) {
      const run = Table.seriesRun(S.board), tri = run || Table.seriesIn(S.board);
      if (run) { await sleep(400); S.fx({ k: 'series', pid: -1, cards: run.map(enc), who: 'the board' }); S.log(`<b>Series on the board!</b> ${run.map(cname).join(' ')} in a row — redeal, pot stays`, 'hi'); S.sideBets.forEach(b => { if (b.status === 'pending' || b.status === 'open') b.status = 'declined'; }); await sleep(4200); S.handNo--; return S.playHand(participants, true); }
      if (tri && S.voters().length) {
        S.boardAsk = { cards: tri, until: Date.now() + 9000 };
        S.msgHost = `Series on the board, but not in a row (${tri.map(cname).join(' ')}). Anyone in the hand can ask to bust it.`;
        S.log(`Series on the board, not in a row: ${tri.map(cname).join(' ')}. Anyone in the hand can ask the table to bust it`, 'hi'); S.sync();
        while (!S.closed && !S.abortHand && (S.vote || Date.now() < S.boardAsk.until)) await sleep(250);
        S.boardAsk = null; S.msgHost = ''; S.sync();
        if (S.abortHand) return S.restartHand(participants);
      }
    }
    await S.settleSideBets('flush'); await sleep(500);
    if (S.abortHand) return S.restartHand(participants);
    // 3 drop
    S.setPhase(3); S.leadSuit = null; S.leadBy = -1;
    for (const id of S.orderFrom(S.nextOf(S.dealer, participants), participants)) {
      if (S.abortHand) return S.restartHand(participants);
      const p = S.players[id]; let card; S.turn = id;
      if (S.adasiStands(p)) { S.adasiTurn = id; S.deadline = S.timer ? Date.now() + S.timer * 1000 : 0; S.sync();
        if (p.isBot) { await sleep(1800 + Math.random() * 800); } else { await S.waitFor(id, ['adasi'], S.timer ? S.timer * 1000 : 0); }
        S.adasiTurn = -1; S.deadline = 0; if (S.abortHand) return S.restartHand(participants); return S.adasiWin(p, participants); }
      if (p.isBot) { S.deadline = S.timer ? Date.now() + S.timer * 1000 : 0; S.sync(); await sleep(650 + Math.random() * 500); if (S.abortHand) return S.restartHand(participants); card = S.botDrop(p); }
      else card = await S.humanDrop(p);
      if (S.abortHand) return S.restartHand(participants);
      if (!card) { S.deadline = 0; continue; }
      S.deadline = 0; p.hand = p.hand.filter(c => c !== card); p.dropped = card;
      // the first card dropped is the call: its suit is the one everyone must follow
      S.log(!S.leadSuit ? `${esc(p.name)} calls ${card.s} with ${cname(card)}` : `${esc(p.name)} drops ${cname(card)}`);
      if (!S.leadSuit) { S.leadSuit = card.s; S.leadBy = p.id; }
      S.sync(); await sleep(350);
    }
    if (S.abortHand) return S.restartHand(participants);
    // 4 trick
    S.setPhase(4); S.turn = -1;
    const played = participants.map(id => ({ p: id, card: S.players[id].dropped })).filter(t => t.card && t.card.s === S.leadSuit).sort((a, b) => val(b.card) - val(a.card));
    const winner = played[0].p; S.trickWinner = winner; S.sync();
    S.log(`${esc(S.players[winner].name)} wins the trick (${cname(played[0].card)})`, 'hi'); S.fx({ k: 'bubble', pid: winner, t: 'Trick!' });
    await sleep(1500);
    if (S.abortHand) return S.restartHand(participants);
    // 5 pick
    S.setPhase(5);
    for (const id of S.orderFrom(winner, participants)) {
      if (S.abortHand) return S.restartHand(participants);
      if (S.boardTop >= S.board.length) break;
      const p = S.players[id]; S.turn = id; S.sync();
      if (S.total(p) > 21) { S.log(`${esc(p.name)} is already over 21 and can't pick`); S.fx({ k: 'bubble', pid: id, t: 'Bust' }); await sleep(900); continue; }
      if (p.isBot) { S.deadline = S.timer ? Date.now() + S.timer * 1000 : 0; S.sync(); await S.botPick(p); } else await S.humanPick(p);
      S.deadline = 0;
    }
    if (S.abortHand) return S.restartHand(participants);
    // too late to redeal once the hands are turned over
    if (S.vote) { clearTimeout(S.vote.t); S.vote = null; S.resumeClock(); }
    S.turn = -1;
    // 6 reveal: hands are turned over one player at a time, in picking order. A 21 gets its moment here,
    // and only here: while people pick it stays secret, like everyone else's total
    S.msgHost = ''; S.setPhase(6); await sleep(450);
    for (const id of S.orderFrom(winner, participants)) {
      const p = S.players[id]; if (!p || p.revealed) continue;
      p.revealed = true; S.sync();
      // 7 7 7 after the drop and the picks: 21 the hard way, and the whole table salutes
      if (p.hand.length === 3 && p.hand.every(c => c.r === '7')) { S.fx({ k: 'salute', pid: id, who: p.name, cards: p.hand.map(enc) }); S.log(`<b>7 7 7!</b> Everyone salutes ${esc(p.name)} 🫡`, 'win'); await sleep(3600); }
      else if (S.total(p) === 21) { S.fx({ k: 'bubble', pid: id, t: '21!' }); await sleep(1500); } else await sleep(650);
    }
    S.players.forEach(p => (p.revealed = true)); S.sync(); await sleep(350);
    const live = participants.map(id => S.players[id]).filter(p => S.total(p) <= 21);
    let next, winners = [], held = null;
    if (!live.length) { S.msgHost = 'Everyone is bust. The pot stays on the table for the next hand.'; S.log('All players bust — pot carries over', 'hi'); S.sync(); await sleep(1500); S.tiebreak = true; next = participants.slice(); }
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
      } else { S.tiebreak = true; const names = tied.map(p => p.name).join(' and '); S.fx({ k: 'banner', t: 'TIE! Everyone plays again' }); S.msgHost = `${esc(names)} tie on ${best}. The pot stays and everyone puts in again for a bigger pot.`; S.log(`Tie on ${best}: ${esc(names)}. The pot of ${fmt(S.pot)} stays; everyone who played plays again`, 'hi'); S.sync(); await sleep(1800); held = tied.map(p => p.id); next = participants.slice(); }
    }
    S.streaks(winners, held);
    await S.settleSideBets('reveal');
    S.endHand(winners, false);
    S.busy = false; S.next = next; S.msgHost = ''; S.sync(); if (S.onSave) S.onSave();
    await S.waitFor(S.hostId, ['next'], 12000);
    return S.playHand(next);
  }
  async adasiWin(p, participants) {
    const S = this; S.turn = -1;
    // everyone holding an Adasi the call didn't break shares (before any call, that's everyone with two Aces)
    const winners = participants.map(id => S.players[id]).filter(x => S.adasiStands(x));
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
    for (const b of S.sideBets) {
      if (b.status === 'pending') { b.status = 'declined'; continue; }
      if (b.status !== 'open') continue;
      const A = S.players[b.a], B = S.players[b.b], aW = winners.includes(A), bW = winners.includes(B);
      if (b.type === 'total' && aW !== bW) { const w = aW ? A : B, l = aW ? B : A; w.chips += b.amt; l.chips -= b.amt; b.status = 'won'; b.winner = w.id; b.result = 'Adasi'; S.fx({ k: 'chip', from: l.id, to: w.id, cls: 'c5', n2: 2 }); S.log(`Side bet: ${esc(w.name)} takes ${fmt(b.amt)} from ${esc(l.name)} (Adasi beats any total)`, 'hi'); S.fx({ k: 'toast', t: `Side bet: ${w.name} wins ${fmt(b.amt)} with Adasi` }); }
      else if (b.type === 'total') { b.result = 'carried over'; S.log(`Side bet between ${esc(A.name)} and ${esc(B.name)} carries to the next hand`); }
      else b.status = 'declined';
    }
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
  // the host (or anyone seated while the host is away) changes the table's settings: names, buy-in, timer and
  // who can join change at once; the wager and the rules wait for the next hand so nobody's hand changes under them
  settings(pid, a, owner) {
    const S = this, p = S.players[pid], c = (a && a.cfg) || {}; if (!p || p.gone || p.isBot) return;
    // the host changes them (or the owner, always); anyone seated may only while the host is away, unless the host
    // is the owner hosting without playing: then nobody else can
    if (!owner && pid !== S.hostId && (S.hostConnected() || S.ownerIsHost())) return;
    const said = [], soon = [], later = {};
    if (c.tableName != null) { const n = String(c.tableName).replace(/[^\p{L}\p{N} '._&-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24); if (n && n !== S.tableName) { S.tableName = n; said.push(`renamed the table ${n}`); } }
    if (c.buyIn != null) { const v = Math.min(1e7, Math.max(50, Math.round(+c.buyIn) || 0)); if (v && v !== S.buyIn) { S.buyIn = v; said.push(`set the buy-in to ${fmt(v)}`); } }
    if (c.timer != null && [0, 15, 20, 30].includes(+c.timer) && +c.timer !== S.timer) { S.timer = +c.timer; said.push(S.timer ? `set the turn timer to ${S.timer}s` : 'made the timer relaxed'); }
    if (c.pub != null && !!c.pub !== S.pub) { S.pub = !!c.pub; said.push(S.pub ? 'made the table public' : 'made the table private'); }
    if (c.gold != null && !!c.gold !== S.gold) { S.gold = !!c.gold; said.push(S.gold ? 'made this a Gold table' : 'took the gold off the table'); }
    if (c.keep != null && !!c.keep !== S.persistent) { S.persistent = !!c.keep; said.push(S.persistent ? 'kept the room open until closed' : 'set the room to close when empty'); }
    const cur = Object.assign({ wager: S.wager, series: S.series, tieSplit: S.tieSplit, side: S.side, fill: S.fill }, S.pendingCfg || {});
    if (c.wager != null) { const v = Math.min(S.buyIn, Math.max(5, Math.round(+c.wager) || 0)); if (v && v !== cur.wager) { later.wager = v; soon.push(`the wager is ${fmt(v)}`); } }
    if (c.series != null && !!c.series !== cur.series) { later.series = !!c.series; soon.push(c.series ? 'the Series rule is on' : 'the Series rule is off'); }
    if (c.tie != null && (c.tie === 'split') !== cur.tieSplit) { later.tieSplit = c.tie === 'split'; soon.push(later.tieSplit ? 'ties split the pot' : 'on a tie everyone plays again'); }
    if (c.side != null && !!c.side !== cur.side) { later.side = !!c.side; soon.push(c.side ? 'side bets are allowed' : 'side bets are off'); }
    if (c.fill != null && !!c.fill !== cur.fill) { later.fill = !!c.fill; soon.push(c.fill ? 'computer players fill empty seats' : 'the computer players go home'); }
    if (!said.length && !soon.length) return;
    const waits = soon.length && S.busy;
    S.pendingCfg = Object.assign(S.pendingCfg || {}, later);
    if (!S.busy) S.applyPending();
    const msg = [said.length ? `${p.name} ${said.join(', ')}.` : '', soon.length ? `${waits ? 'From the next hand' : (said.length ? 'And' : p.name + ' changed the table')}: ${soon.join(', ')}.` : ''].filter(Boolean).join(' ');
    S.log(esc(msg), 'hi'); S.fx({ k: 'toast', t: msg, ms: 4500 });
    S.sync(); if (S.onSave) S.onSave();
  }
  applyPending() {
    const S = this, c = S.pendingCfg; if (!c) return; S.pendingCfg = null;
    if (c.wager != null) S.wager = Math.min(S.buyIn, c.wager);
    if (c.series != null) S.series = c.series;
    if (c.tieSplit != null) S.tieSplit = c.tieSplit;
    if (c.side != null) S.side = c.side;
    if (c.fill != null) { S.fill = c.fill;
      if (S.fill && S.started) S.fillBots();
      else if (!S.fill) S.players.forEach(p => { if (p.isBot && !p.gone) { p.gone = true; p.sitout = true; } }); }
  }
  // hands won in a row: flames on the seat from two, a shout from three; a play-off keeps the tied players' runs alive
  streaks(winners, held) {
    const S = this;
    for (const id of S.participants) {
      const p = S.players[id]; if (!p || p.gone) continue;
      if (winners.includes(p)) {
        p.streak = (p.streak || 0) + 1; p.wins = (p.wins || 0) + 1; p.best = Math.max(p.best || 0, p.streak);
        if (p.streak >= 2) S.fx({ k: 'streak', pid: p.id, run: p.streak });
        if (p.streak >= 3) S.log(p.streak >= 5 ? `${esc(p.name)} is on fire: ${p.streak} wins in a row 🔥` : `${esc(p.name)} has won ${p.streak} in a row 🔥`, 'hi');
      } else if (!(held && held.includes(p.id))) {
        if ((p.streak || 0) >= 3) { S.fx({ k: 'streakend', pid: p.id, run: p.streak }); S.log(`${esc(p.name)}'s run of ${p.streak} wins is over`); }
        p.streak = 0;
      }
    }
  }
  // who's up and who's down since they sat: chips in front of them against everything they bought in
  standings() { return this.players.filter(p => !p.gone && !p.watch).map(p => ({ id: p.id, name: p.name, bot: p.isBot ? 1 : 0, color: p.color, av: p.av ? [p.av.kind[0], p.av.color || p.av.emoji || ''] : null, net: p.chips - (p.bought != null ? p.bought : this.buyIn), wins: p.wins || 0, best: p.best || 0 })).sort((a, b) => b.net - a.net || b.wins - a.wins); }
  // the table is closing in the middle of a hand: give everyone back what they put in this hand
  abandon() { const start = this.handStart; this.handStart = null; if (start) for (const [p, c0] of start) p.chips = c0; this.closed = true; if (this.pend) this.pend.done(null); }
  // chips that change hands outside the pot settle at once; the hand's books stay straight
  moved(p, delta, why, other) {
    if (this.handStart && this.handStart.has(p)) this.handStart.set(p, this.handStart.get(p) + delta);
    if (this.onMoved) try { this.onMoved(p, delta, why, other); } catch (e) { console.error('moved hook', e); }
  }
  // quick reactions that float up from your seat
  react(pid, a) { const p = this.players[pid], i = +a.r; if (!p || p.gone || !(i >= 0 && i < REACTS.length)) return; const now = Date.now(); if (now - (p.lastReact || 0) < 1200) return; p.lastReact = now; this.fx({ k: 'react', pid, r: i }); }
  // a few words to the table: a bubble over your seat and a line in the log (five per ten seconds at most)
  chat(pid, a) {
    const S = this, p = S.players[pid]; if (!p || p.gone) return;
    const t = String(a.t || '').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120); if (!t) return;
    const now = Date.now(); p.chatAt = (p.chatAt || []).filter(x => now - x < 10000);
    if (p.chatAt.length >= 5 || now - (p.chatAt[p.chatAt.length - 1] || 0) < 800) return; p.chatAt.push(now);
    S.fx({ k: 'chat', pid, t }); S.log(`<b>${esc(p.name)}:</b> ${esc(t)}`, 'chat');
    // playing alone with the computer: now and then one of them answers
    const bots = S.players.filter(x => x.isBot && !x.gone);
    if (!p.isBot && bots.length && S.humansPresent() === 1 && Math.random() < 0.4) { const b = bots[Math.floor(Math.random() * bots.length)]; setTimeout(() => { if (!b.gone && !S.closed) S.fx({ k: 'bubble', pid: b.id, t: BOT_CHAT[Math.floor(Math.random() * BOT_CHAT.length)], ms: 2200 }); }, 1200 + Math.random() * 900); }
  }
  botReact(not, list) { const bots = this.players.filter(p => p.isBot && !p.gone && p.id !== not); if (!bots.length || Math.random() > 0.55) return; const b = bots[Math.floor(Math.random() * bots.length)]; setTimeout(() => this.fx({ k: 'react', pid: b.id, r: list[Math.floor(Math.random() * list.length)] }), 900 + Math.random() * 900); }
  // spray money: notes from your stack onto another player's
  spray(from, a) {
    const S = this, A = S.players[from], B = S.players[+a.to]; if (!A || !B || A === B || A.gone || B.gone || A.watch || B.watch || !S.started) return;
    const amt = Math.floor(+a.amt || 0); if (!(amt >= 5)) return;
    if (amt > A.chips) { S.fx({ k: 'toast', pid: from, t: 'Not enough chips in front of you to spray that much.' }); return; }
    if (B.chips < S.wager && S.noRebuy && S.noRebuy(B)) { S.fx({ k: 'toast', pid: from, t: `${B.name} can't buy back in this game, so they stay out.` }); return; }
    A.chips -= amt; B.chips += amt; S.moved(A, -amt, 'spray', B); S.moved(B, amt, 'spray', A);
    S.fx({ k: 'spray', from, to: B.id, amt }); S.log(`${esc(A.name)} sprays ${esc(B.name)} ${fmt(amt)}`, 'hi');
    if (B.isBot) setTimeout(() => S.fx({ k: 'bubble', pid: B.id, t: THANKS[Math.floor(Math.random() * THANKS.length)], ms: 1800 }), 1300);
    S.sync(); if (S.onSave) S.onSave();
  }
  // lending: chips to someone at the table (usually someone who has run out), written down so it can be paid back.
  // A loan isn't a win or a loss: both players' buy-ins move with it, so tonight's scores stay true.
  lend(from, a) {
    const S = this, A = S.players[from], B = S.players[+a.to]; if (!A || !B || A === B || A.gone || B.gone || A.watch || B.watch || !S.started) return;
    const amt = Math.floor(+a.amt || 0); if (!(amt >= 5)) return;
    if (amt > A.chips) { S.fx({ k: 'toast', pid: from, t: 'Not enough chips in front of you to lend that much.' }); return; }
    if (B.chips < S.wager && S.noRebuy && S.noRebuy(B)) { S.fx({ k: 'toast', pid: from, t: `${B.name} can't buy back in this game, so they stay out.` }); return; }
    A.chips -= amt; B.chips += amt; A.bought = (A.bought || 0) - amt; B.bought = (B.bought || 0) + amt;
    S.moved(A, -amt, 'lend', B); S.moved(B, amt, 'lend', A);
    S.loans.push({ id: ++S.loanN, from, to: B.id, amt, paid: 0, fromName: A.name, toName: B.name, out: false }); if (S.loans.length > 60) S.loans.splice(0, S.loans.length - 60);
    S.fx({ k: 'lend', from, to: B.id, amt }); S.log(`${esc(A.name)} lends ${esc(B.name)} ${fmt(amt)}`, 'hi');
    if (B.broke && B.chips >= S.wager) S.fx({ k: 'bubble', pid: B.id, t: 'Back in next hand 💪', ms: 2200 });
    else if (B.isBot) setTimeout(() => S.fx({ k: 'bubble', pid: B.id, t: THANKS[Math.floor(Math.random() * THANKS.length)], ms: 1800 }), 1300);
    S.sync(); if (S.onSave) S.onSave();
  }
  // sending chips: they're the other player's straight away, nothing written down (they settle up outside the game).
  // Like a loan, both players' buy-ins move with it, so Tonight's scores don't count it as a win or a loss.
  give(from, a) {
    const S = this, A = S.players[from], B = S.players[+a.to]; if (!A || !B || A === B || A.gone || B.gone || A.watch || B.watch || !S.started) return;
    const amt = Math.floor(+a.amt || 0); if (!(amt >= 5)) return;
    if (amt > A.chips) { S.fx({ k: 'toast', pid: from, t: 'Not enough chips in front of you to send that much.' }); return; }
    if (B.chips < S.wager && S.noRebuy && S.noRebuy(B)) { S.fx({ k: 'toast', pid: from, t: `${B.name} can't buy back in this game, so they stay out.` }); return; }
    A.chips -= amt; B.chips += amt; A.bought = (A.bought || 0) - amt; B.bought = (B.bought || 0) + amt;
    S.moved(A, -amt, 'give', B); S.moved(B, amt, 'give', A);
    S.fx({ k: 'give', from, to: B.id, amt }); S.log(`${esc(A.name)} sends ${esc(B.name)} ${fmt(amt)}`, 'hi');
    if (B.broke && B.chips >= S.wager) S.fx({ k: 'bubble', pid: B.id, t: 'Back in next hand 💪', ms: 2200 });
    else if (B.isBot) setTimeout(() => S.fx({ k: 'bubble', pid: B.id, t: THANKS[Math.floor(Math.random() * THANKS.length)], ms: 1800 }), 1300);
    S.sync(); if (S.onSave) S.onSave();
  }
  // the borrower pays some or all of a loan back from their stack
  repay(pid, a) {
    const S = this, B = S.players[pid], L = S.loans.find(l => l.id === +a.loan); if (!B || B.gone || !L || L.to !== pid) return;
    const owe = L.amt - L.paid; if (owe <= 0) return;
    const A = S.players[L.from]; if (!A || A.gone) { S.fx({ k: 'toast', pid, t: `${L.fromName} has left the table, so settle up with them directly.` }); return; }
    const amt = Math.min(owe, Math.floor(+a.amt || owe)); if (!(amt >= 1)) return;
    if (amt > B.chips) { S.fx({ k: 'toast', pid, t: `You need ${fmt(amt)} in front of you for that.` }); return; }
    B.chips -= amt; A.chips += amt; B.bought = (B.bought || 0) - amt; A.bought = (A.bought || 0) + amt; L.paid += amt;
    S.moved(B, -amt, 'repay', A); S.moved(A, amt, 'repay', B);
    S.fx({ k: 'lend', from: pid, to: A.id, amt, back: 1 }); S.log(`${esc(B.name)} pays ${esc(A.name)} back ${fmt(amt)}${L.paid < L.amt ? ` (${fmt(L.amt - L.paid)} still owed)` : ''}`, 'hi');
    S.sync(); if (S.onSave) S.onSave();
  }
  // the lender marks a loan settled (paid back outside the game): no chips move
  settleLoan(pid, a) {
    const S = this, L = S.loans.find(l => l.id === +a.loan); if (!L || L.from !== pid || L.paid >= L.amt) return;
    L.out = true; L.paid = L.amt; S.log(`${esc(L.fromName)} marks ${esc(L.toName)}'s loan as settled`, 'hi'); S.sync(); if (S.onSave) S.onSave();
  }
  // what's still owed, one line per pair (for the final scores)
  openLoans() { const m = new Map(); for (const l of this.loans) { const owe = l.amt - l.paid; if (owe <= 0) continue; const k = l.toName + '\u0000' + l.fromName; m.set(k, { from: l.fromName, to: l.toName, owe: ((m.get(k) || {}).owe || 0) + owe }); } return [...m.values()]; }
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
      const a = await S.waitFor(p.id, ['drop'], ms ? Math.max(4000, end - Date.now()) : 0);
      if (!a && S.abortHand) return null;
      if (!a) { if (!p.gone) S.strike(p); const must = S.leadSuit && p.hand.some(c => c.s === S.leadSuit); const legal = must ? p.hand.filter(c => c.s === S.leadSuit) : p.hand.slice(); legal.sort((x, y) => val(x) - val(y)); return legal.find(x => p.hand.filter(y => y !== x).reduce((s, y) => s + val(y), 0) <= 21) || legal[0]; }
      const c = p.hand.find(x => x.id === a.card); if (!c) continue;
      const must = S.leadSuit && p.hand.some(x => x.s === S.leadSuit); if (must && c.s !== S.leadSuit) { S.fx({ k: 'nudge', pid: p.id, t: `You hold a ${S.leadSuit}, so you have to follow suit.` }); continue; }
      const kt = p.hand.filter(x => x !== c).reduce((s, x) => s + val(x), 0); if (kt > 21) { S.fx({ k: 'nudge', pid: p.id, t: `That would leave you on ${kt}, over 21. Drop a different card.` }); continue; }
      p.strikes = 0; return c;
    }
  }
  // picking: while the next card on the board keeps you on 21 or under you must take it (tap Take, or tap the card;
  // when the clock runs out it is given to you). You stop on 21, or when the next card would take you over 21.
  async humanPick(p) {
    const S = this;
    while (S.boardTop < S.board.length) {
      const c = S.board[S.boardTop]; const t = S.total(p);
      // jammed: the next card would take them over 21, so they stay (it looks like any other stay, 21 included)
      if (t + val(c) > 21) { S.deadline = 0; S.sync(); await sleep(1100); S.fx({ k: 'bubble', pid: p.id, t: 'Stay' }); S.log(`${esc(p.name)} stays`); break; }
      const ms = S.timer ? S.timer * 1000 : 0; S.deadline = ms ? Date.now() + ms : 0; S.sync();
      const a = await S.waitFor(p.id, ['take'], ms);
      if (S.abortHand) return;
      if (p.gone) break;
      if (a) p.strikes = 0; else { S.strike(p); S.log(`${esc(p.name)}'s time ran out, so ${cname(c)} is given to them`); }
      S.takeCard(p, c); S.fx({ k: 'sel', pid: p.id, id: c.id }); S.log(`${esc(p.name)} takes ${cname(c)}`);
      // on 21 the turn just ends, looking like any other stay: the 21 is shown when the hands are turned over
      if (S.total(p) === 21) { await sleep(700); S.fx({ k: 'bubble', pid: p.id, t: 'Stay' }); S.log(`${esc(p.name)} stays`); break; }
    }
  }
  takeCard(p, c) { c.taken = true; c.by = p.id; this.boardTop++; p.hand.push(c); p.picked.push(c); this.sync(); }
  botDrop(p) {
    const S = this; const must = S.leadSuit && p.hand.some(c => c.s === S.leadSuit);
    const opts = must ? p.hand.filter(c => c.s === S.leadSuit) : p.hand.slice();
    const score = c => { const keep = p.hand.filter(x => x !== c); const t = keep.reduce((a, x) => a + val(x), 0); if (t > 21) return -100; let s = 0; if (!S.leadSuit) s += val(c) * 1.5; else if (must) s += val(c); else s -= val(c) * .3; s += t <= 15 ? 3 : 0; return s; };
    opts.sort((a, b) => score(b) - score(a)); return opts[0];
  }
  async botPick(p) {
    const S = this;
    // the same rule as everyone: keep taking while the next card keeps you on 21 or under
    while (S.boardTop < S.board.length) {
      const c = S.board[S.boardTop]; const t = S.total(p); await sleep(700 + Math.random() * 500);
      if (S.abortHand) return;
      if (t + val(c) > 21) { S.fx({ k: 'bubble', pid: p.id, t: 'Stay' }); S.log(`${esc(p.name)} stays`); break; }
      S.takeCard(p, c); S.fx({ k: 'bubble', pid: p.id, t: `Takes ${cname(c)}` }); S.log(`${esc(p.name)} takes ${cname(c)}`);
      if (S.total(p) === 21) { await sleep(400); S.fx({ k: 'bubble', pid: p.id, t: 'Stay' }); S.log(`${esc(p.name)} stays`); break; }
    }
    await sleep(500);
  }
  // ----- side bets -----
  proposeSB(from, a) {
    const S = this; const A = S.players[from], B = S.players[+a.to]; if (!A || !B || A === B || !S.side || !S.started || B.gone) return;
    const type = ['first', 'cardvcard', 'total'].includes(a.bt) ? a.bt : 'total'; const amt = Math.max(5, Math.floor(+a.amt || 0));
    if (amt > A.chips || amt > B.chips || S.phase >= 6 || S.phase < 0 || (type !== 'total' && S.phase >= 2)) return;
    if (S.phase >= 1 && !(S.participants.includes(A.id) && S.participants.includes(B.id))) return;
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

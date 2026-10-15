'use strict';
// Tete 21 server: serves the game, runs the tables, lists rooms, handles join requests,
// accounts (balance, friends, history), friends' online status and invites,
// and introduces players to each other for voice/video.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Table, cleanName, cleanAv } = require('./public/engine');
const store = require('./store');
const accounts = require('./accounts');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const tables = new Map();   // code -> Table
const byRid = new Map();    // public room id -> Table (used by the rooms list, never reveals the code)
const closedCodes = new Set();
const online = new Map();   // player id (account id, or device id for guests) -> { socks:Set<ws>, name, av, friends:Set<id>, acct }
const invites = new Map();  // invite token -> { rid, to, exp }
let listDirty = true, lastListJSON = '';

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const seatHash = t => sha('seat:' + t);
const rand = n => crypto.randomBytes(n).toString('base64url');
const send = (ws, m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
const isId = x => typeof x === 'string' && /^[0-9a-f]{16}$/.test(x);
const fmt = n => (+n || 0).toLocaleString('en-GB');

// ---------- sealed copies of standing rooms ----------
// Standing rooms are saved in the database. As a second line of defence every player's device
// also keeps a signed copy, so the first player back can restore a room the server forgot.
const SECRET = process.env.ROOM_SECRET || (process.env.RENDER_SERVICE_ID ? 'svc:' + process.env.RENDER_SERVICE_ID : '') || rand(32);
if (!process.env.ROOM_SECRET) console.log(process.env.RENDER_SERVICE_ID ? 'Sealing rooms with the service id (set ROOM_SECRET for a private key)' : 'No ROOM_SECRET set: sealed rooms will not survive a restart');
const sign = data => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
function openSeal(seal) {
  if (!seal || typeof seal.data !== 'string' || typeof seal.sig !== 'string' || seal.data.length > 20000) return null;
  const want = Buffer.from(sign(seal.data)), got = Buffer.from(seal.sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try { const o = JSON.parse(seal.data); return o && o.room && typeof o.room.code === 'string' ? o : null; } catch { return null; }
}
function saveRoom(t) {
  if (!t.persistent || t.closed) return;
  clearTimeout(t._sealT);
  t._sealT = setTimeout(() => {
    if (t.closed) return;
    t.sealVer = (t.sealVer || 0) + 1;
    const data = JSON.stringify({ v: 1, ver: t.sealVer, at: Date.now(), room: t.toJSON(seatHash) });
    const seal = { data, sig: sign(data) };
    for (const p of t.players) if (p.conn) send(p.conn, { type: 'seal', code: t.code.toUpperCase(), rid: t.rid, seal });
    persistAll();
  }, 600);
}
let kvT = null;
function persistAll() {
  const rooms = {};
  for (const [c, t] of tables) if (t.persistent && !t.closed) rooms[c] = { ver: t.sealVer || 0, room: t.toJSON(seatHash) };
  const all = { rooms, closed: [...closedCodes].slice(-500) };
  store.save(all);
  if (accounts.isReady()) { clearTimeout(kvT); kvT = setTimeout(() => accounts.kvSet('rooms', all).catch(e => console.error('rooms save:', e.message)), 800); }
}
function register(t) {
  tables.set(t.code, t); byRid.set(t.rid, t);
  t.requests = t.requests || new Map();
  if (t.persistent) t.onSave = () => saveRoom(t);
  hookTable(t);
  listDirty = true;
}
function unregister(t) {
  t.abandon(); tables.delete(t.code); byRid.delete(t.rid);
  for (const r of (t.requests || new Map()).values()) { r.ws.request = null; send(r.ws, { type: 'declined', msg: 'That room has closed.' }); }
  if (t.requests) t.requests.clear();
  for (const p of t.players) if (p.uid) setTimeout(() => pushAccount(p.uid), 50);
  listDirty = true;
}
function restoreFromSeal(o) {
  const code = String(o.room.code);
  if (closedCodes.has(code)) return null;
  const old = tables.get(code);
  if (old && !(old.fromSeal && !old.started && (o.ver || 0) > (old.sealVer || 0))) return old;
  const t = Table.fromJSON(o.room, broadcast); t.fromSeal = true; t.sealVer = o.ver || 0;
  if (old) { // a newer copy arrived before anyone played: move the people already back across
    for (const p of old.players) {
      if (!p.conn) continue;
      const h = p.tokenHash || (p.token ? seatHash(p.token) : null);
      const q = t.players.find(x => x.tokenHash && x.tokenHash === h);
      if (q) { q.conn = p.conn; q.token = p.token; q.away = false; q.conn.pid = q.id; q.conn.table = t; }
      else { p.conn.table = null; p.conn.pid = -1; send(p.conn, { type: 'gone', code: code.toUpperCase(), msg: 'The room was refreshed. Join again.' }); }
    }
    t.requests = old.requests; old.closed = true; byRid.delete(old.rid);
  }
  register(t); t.sync(); return t;
}

// ---------- accounts at the tables ----------
// your balance backs the chips in front of you; each hand's result lands on it when the hand ends
function inPlay(uid) { const out = []; if (!uid) return out; for (const [, t] of tables) { if (t.closed) continue; for (const p of t.players) if (p.uid === uid && !p.gone && !p.isBot) out.push({ rid: t.rid, code: t.code.toUpperCase(), name: t.tableName, chips: p.chips, keep: t.persistent ? 1 : 0, here: p.conn ? 1 : 0 }); } return out; }
const inPlayTotal = uid => inPlay(uid).reduce((a, x) => a + x.chips, 0);
function freeChips(uid) { const u = accounts.cached(uid); return u ? u.balance - inPlayTotal(uid) : 0; }
function sitError(ws, t) {
  if (!ws.uid) return '';
  const u = accounts.cached(ws.uid); if (!u) return 'Your account is still loading. Try again in a moment.';
  const free = freeChips(ws.uid);
  return free >= t.buyIn ? '' : `You need ${fmt(t.buyIn)} free chips to sit at this table and you have ${fmt(Math.max(0, free))}. Spin the daily wheel in your profile, or pick a table with a smaller buy-in.`;
}
function hookTable(t) {
  t.canBuy = (p, amount) => !p.uid || freeChips(p.uid) >= amount;
  t.onHandEnd = res => { for (const r of res) if (r.p.uid) { accounts.settle(r.p.uid, { delta: r.delta, played: r.played, won: r.won, adasi: r.adasi, total: r.total, table: t.tableName }); pushAccount(r.p.uid); } };
  t.onMoved = (p, delta, why, other) => { if (p.uid && delta) { const o = other ? other.name : ''; const label = why === 'spray' ? (delta > 0 ? `Spray from ${o}` : `You sprayed ${o}`) : why === 'lend' ? (delta > 0 ? `Loan from ${o}` : `You lent ${o}`) : why === 'repay' ? (delta > 0 ? `${o} paid you back` : `You paid ${o} back`) : `Treats at ${t.tableName}`; accounts.settle(p.uid, { delta, played: false, won: false, table: label }); pushAccount(p.uid); } };
  t.onLeave = (p, delta) => { if (p.uid && delta) { accounts.settle(p.uid, { delta, played: true, won: false, table: t.tableName }); setTimeout(() => pushAccount(p.uid), 50); } };
}
// balance and stats after something changed (no database reads, so it is quick)
function pushAccount(uid) { const u = accounts.cached(uid), o = online.get(uid); if (!u || !o) return; const m = { type: 'account_lite', user: accounts.pub(u), inPlay: inPlay(uid), bonus: accounts.bonusInfo(u) }; for (const s of o.socks) send(s, m); }
async function sendAccount(ws) { if (!ws.uid) return; try { const u = await accounts.get(ws.uid); if (u) send(ws, await accounts.payload(u, ws.tz, inPlay(u.id))); } catch (e) { console.error('account payload:', e.message); } }
function notify(uid, m) { const o = online.get(uid); if (o) for (const s of o.socks) send(s, m); }
async function pushFriends(uid) {
  const o = online.get(uid); if (!o || !o.acct) return;
  try { const fd = await accounts.friendData(uid); o.friends = new Set(fd.friends.map(f => f.id)); for (const s of o.socks) { send(s, Object.assign({ type: 'friends' }, fd)); sendPresence(s); } } catch (e) { console.error('friends:', e.message); }
}

// ---------- room list ----------
function hostName(t) { const h = t.players[t.hostId]; return h && !h.isBot ? h.name : ''; }
function summary(t) {
  const humans = t.players.filter(p => !p.isBot && !p.gone);
  return { rid: t.rid, name: t.tableName, host: hostName(t), pub: t.pub ? 1 : 0, keep: t.persistent ? 1 : 0, seats: t.seats,
    seated: humans.length, here: humans.filter(p => p.conn).length, wager: t.wager, buyIn: t.buyIn, started: t.started ? 1 : 0, hand: t.handNo,
    members: t.pub ? humans.map(p => p.name).slice(0, 8) : [] };
}
function roomsJSON() { return JSON.stringify({ type: 'rooms', list: [...tables.values()].filter(t => !t.closed).map(summary) }); }
function sendRooms(ws) { if (ws.readyState === 1) ws.send(roomsJSON()); }

// ---------- friends & presence ----------
function presenceOf(id) {
  const o = online.get(id); if (!o || !o.socks.size) return { id, on: 0 };
  let room = null;
  for (const s of o.socks) if (s.table && !s.table.closed) { const t = s.table; room = { rid: t.rid, name: t.tableName, pub: t.pub ? 1 : 0 }; break; }
  return { id, on: 1, name: o.name, av: o.av, room };
}
function sendPresence(ws) { if (!ws.me) return; const o = online.get(ws.me); if (!o) return; send(ws, { type: 'presence', list: [...o.friends].map(presenceOf) }); }
function presenceChanged(id) { for (const [, o] of online) if (o.friends.has(id)) for (const s of o.socks) sendPresence(s); }
function dropPresence(ws) {
  if (!ws.me) return; const id = ws.me; ws.me = null; const o = online.get(id); if (!o) return;
  o.socks.delete(ws); if (!o.socks.size) { online.delete(id); presenceChanged(id); }
}
function cleanFriends(list, self) { return new Set((Array.isArray(list) ? list : []).filter(x => isId(x) && x !== self).slice(0, 300)); }
// a guest: identified by a key kept on their device; friends live on the device
function becomeDevice(ws) {
  const id = ws.dev; if (!id) return;
  if (ws.me && ws.me !== id) dropPresence(ws);
  ws.me = id; ws.uid = null;
  let o = online.get(id); const wasOn = !!(o && o.socks.size);
  if (!o) { o = { socks: new Set(), name: '', av: null, friends: new Set(), acct: false }; online.set(id, o); }
  o.socks.add(ws); o.name = ws.devName || o.name; o.av = ws.devAv || o.av; o.friends = cleanFriends(ws.devFriends, id);
  send(ws, { type: 'you', id });
  sendPresence(ws);
  for (const [uid, u] of online) if (uid !== id && u.socks.size && !u.acct && u.friends.has(id) && !o.friends.has(uid)) send(ws, { type: 'friend_added', id: uid, name: u.name, av: u.av });
  if (!wasOn) presenceChanged(id);
}
// signed in: friends, balance and history come from the account, on any device
async function becomeAccount(ws, u) {
  if (ws.me && ws.me !== u.id) dropPresence(ws);
  ws.me = u.id; ws.uid = u.id;
  let o = online.get(u.id); const wasOn = !!(o && o.socks.size);
  if (!o) { o = { socks: new Set(), name: '', av: null, friends: new Set(), acct: true }; online.set(u.id, o); }
  o.socks.add(ws); o.acct = true; o.name = u.display; o.av = u.av;
  try { o.friends = new Set(await accounts.friendIds(u.id)); } catch (e) { console.error('friend ids:', e.message); }
  send(ws, { type: 'you', id: u.id, acct: 1 });
  // a guest seat this socket already holds now counts for the account, if the balance covers it
  const T = ws.table, p = T && T.players[ws.pid];
  if (p && !p.uid && !p.isBot && freeChips(u.id) >= p.chips) { p.uid = u.id; if (T.handStart && T.handStart.has(p)) T.handStart.set(p, T.handStart.get(p)); if (T.persistent) saveRoom(T); }
  await sendAccount(ws);
  sendPresence(ws);
  if (!wasOn) presenceChanged(u.id);
}

// ---------- recorded shouts: each player can record their own voice for the shouts ----------
// kept per account (or per device for guests) under a key that doesn't give the account or device away
const VOICES = new Map();
const vkOf = me => (me ? sha('voice:' + me).slice(0, 12) : null);
async function loadVoice(vk) {
  if (VOICES.has(vk)) return VOICES.get(vk);
  const o = { v: 0, clips: {} };
  try { const sv = accounts.isReady() ? await accounts.kvGet('shouts:' + vk) : null; if (sv && sv.clips) { o.v = sv.v || 0; for (const [i, b] of Object.entries(sv.clips)) o.clips[i] = Buffer.from(b, 'base64'); } } catch (e) { console.error('shouts load:', e.message); }
  VOICES.set(vk, o); return o;
}
function voiceInfo(vk, o) { let m = 0; for (const i of Object.keys(o.clips)) m |= 1 << +i; return m ? [vk, m, o.v] : null; }
function saveVoice(vk, o) { if (!accounts.isReady()) return; const clips = {}; for (const [i, b] of Object.entries(o.clips)) clips[i] = b.toString('base64'); accounts.kvSet('shouts:' + vk, { v: o.v, clips }).catch(e => console.error('shouts save:', e.message)); }
function voiceChanged(vk, o) { const info = voiceInfo(vk, o); for (const t of tables.values()) { let hit = false; for (const p of t.players) if (p.vk === vk) { p.voice = info; hit = true; } if (hit) t.sync(); } }
async function setVoice(t, p, me) { const vk = vkOf(me); if (!p || !vk) return; p.vk = vk; try { const o = await loadVoice(vk); p.voice = voiceInfo(vk, o); t.sync(); } catch {} }

// ---------- seats ----------
function enter(ws, t, r, resumed) {
  cancelRequest(ws);
  if (r.prev && r.prev !== ws) { const old = r.prev; old.table = null; old.pid = -1; send(old, { type: 'gone', code: t.code.toUpperCase(), msg: 'You opened this table on another screen.' }); }
  ws.table = t; ws.pid = r.id; ws.lastFx = t.fxn; setVoice(t, t.players[r.id], ws.me);
  send(ws, { type: 'joined', code: t.code.toUpperCase(), rid: t.rid, id: r.id, token: r.token, resumed: !!resumed, keep: t.persistent ? 1 : 0 });
  send(ws, { type: 'logs', items: t.fxq.filter(e => e.k === 'log').slice(-25) });
  t.sync(); if (t.persistent) saveRoom(t);
  for (const p of t.players) if (p.conn && p.conn !== ws) send(p.conn, { type: 'peer', id: r.id, event: 'joined', sid: ws.sid });
  listDirty = true; if (ws.me) presenceChanged(ws.me);
  if (ws.uid) setTimeout(() => pushAccount(ws.uid), 50);
}
// an account already holding a seat at this table goes straight back to it, from any device
function returnAcct(ws, t) {
  if (!ws.uid) return false;
  const p = t.players.find(x => !x.isBot && !x.gone && x.uid === ws.uid); if (!p) return false;
  if (p.conn === ws) { enter(ws, t, { id: p.id, token: p.token }, true); return true; }
  if (ws.table && ws.table !== t) leave(ws);
  const prev = p.conn && p.conn !== ws ? p.conn : null; p.conn = null;
  const r = t.reclaim(p.id, ws); if (!r) { p.conn = prev; return false; }
  r.prev = prev; enter(ws, t, r, true); return true;
}
function seatNew(ws, t, m) {
  if (returnAcct(ws, t)) return;
  const name = cleanName(m.name); if (!name) return send(ws, { type: 'error', msg: 'Type your name first.' });
  const err = sitError(ws, t); if (err) return send(ws, { type: 'error', msg: err, need: 'chips' });
  if (ws.table) leave(ws);
  const r = t.addHuman(ws, name, m.av, m.mic, m.cam, ws.uid);
  if (r.error) return send(ws, { type: 'error', msg: r.error });
  enter(ws, t, r, false);
}
function askToJoin(ws, t, m, ret) {
  cancelRequest(ws);
  const id = rand(6);
  const r = { id, ws, name: cleanName(m.name) || 'Guest', av: cleanAv(m.av), ret, chips: ret >= 0 ? t.players[ret].chips : null, at: Date.now() };
  t.requests.set(id, r); ws.request = { t, id };
  send(ws, { type: 'requested', room: t.tableName, host: hostName(t), hostHere: t.hostConnected() ? 1 : 0, ret: ret >= 0 ? 1 : 0 });
  t.sync();
}
function cancelRequest(ws, tell) {
  const q = ws.request; if (!q) return; ws.request = null;
  q.t.requests.delete(q.id); q.t.sync();
  if (tell) send(ws, { type: 'request_cancelled' });
}
function leave(ws, dropped, forGood) {
  cancelRequest(ws);
  const T = ws.table; if (!T) return;
  const pid = ws.pid, p = T.players[pid];
  ws.table = null; ws.pid = -1;
  if (p && p.conn === ws) { if (dropped || (T.persistent && !forGood)) T.disconnect(pid); else T.removeHuman(pid); }
  for (const q of T.players) if (q.conn && q.conn !== ws) send(q.conn, { type: 'peer', id: pid, event: 'left' });
  listDirty = true; if (ws.me) presenceChanged(ws.me);
  if (ws.uid) setTimeout(() => pushAccount(ws.uid), 50);
  // the last person leaves a standing room for good: the room goes with them
  if (forGood && T.persistent && !T.closed && T.humansPresent() === 0) { closedCodes.add(T.code); unregister(T); persistAll(); return; }
  if (T.persistent || T.closed) return;
  if (T.humansPresent() === 0) unregister(T);
  else if (T.humansConnected() === 0) { clearTimeout(T.emptyT); T.emptyT = setTimeout(() => { if (!T.closed && T.humansConnected() === 0) unregister(T); }, 120000); }
}
// a seat waiting for its owner: same name, and if it belongs to an account, the same account
function waitingSeat(t, name, uid) { return t.players.findIndex(p => !p.isBot && !p.gone && !p.conn && p.name.toLowerCase() === name.toLowerCase() && (!p.uid || p.uid === uid)); }
function broadcast(table) {
  if (table.closed) return;
  if (table.idsChanged) { table.idsChanged = false; for (const p of table.players) if (p.conn) send(p.conn, { type: 'rtc_reset' }); }
  const rq = [...(table.requests || new Map()).values()].map(r => ({ id: r.id, name: r.name, av: r.av, ret: r.ret >= 0 ? 1 : 0, chips: r.chips }));
  const ids = table.players.map(p => (p.conn && p.conn.me) || null);
  for (const p of table.players) {
    const c = p.conn; if (!c || c.readyState !== 1) continue;
    const fresh = table.fxq.filter(e => e.n > (c.lastFx || 0));
    if (fresh.length) c.lastFx = fresh[fresh.length - 1].n;
    send(c, { type: 'state', st: table.snapshot(p.id), fx: fresh, rq: p.id === table.hostId ? rq : undefined, ids });
  }
  listDirty = true;
  if (table.humansPresent() === 0 && !table.persistent) unregister(table);
}
function newCode() { for (;;) { const c = 'tete-' + Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 4).padEnd(4, '7'); if (!tables.has(c) && !closedCodes.has(c)) return c; } }

// Optional TURN relay for phones on strict mobile networks:
// TURN_URL=turn:host:443?transport=tcp TURN_USER=... TURN_PASS=...
function iceServers() {
  const s = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.TURN_URL) s.push({ urls: process.env.TURN_URL.split(',').map(x => x.trim()), username: process.env.TURN_USER || '', credential: process.env.TURN_PASS || '' });
  return s;
}

// ---------- http ----------
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/health') { res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }); return res.end(accounts.isReady() ? 'ok' : 'ok (accounts offline)'); }
  if (url === '/ice') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(iceServers())); }
  const sv = /^\/shout\/([0-9a-f]{12})\/(\d{1,2})$/.exec(url);
  if (sv) { loadVoice(sv[1]).then(o => { const b = o.clips[+sv[2]]; if (!b) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': b.length, 'cache-control': 'public, max-age=31536000, immutable' }); res.end(b); }).catch(() => { res.writeHead(500); res.end(); }); return; }
  const file = url === '/' ? 'index.html' : url.slice(1);
  const fp = path.join(PUBLIC, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if (!fp.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
    // the house voice's clips and the songs are asked for with a version (?v=), so they can be kept for good
    const forever = (url.startsWith('/shouts/') || url.startsWith('/music/')) && url.endsWith('.mp3') && /[?&]v=/.test(req.url);
    res.writeHead(200, { 'content-type': types[path.extname(fp)] || 'application/octet-stream', 'content-length': data.length, 'cache-control': forever ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(data);
  });
});

// ---------- websocket ----------
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
wss.on('connection', (ws, req) => {
  ws.sid = rand(6); // this screen's session: voice/video links are rebuilt when a player comes back on a new one
  ws.table = null; ws.pid = -1; ws.lastFx = 0; ws.isAlive = true; ws.me = null; ws.uid = null; ws.dev = null; ws.request = null; ws.tz = 0;
  ws.ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '').trim();
  ws.on('pong', () => (ws.isAlive = true));
  sendRooms(ws);
  // signing in finishes before anything that depends on who you are; game moves never wait on the database
  let ident = Promise.resolve();
  const fail = e => console.error('message error:', (e && e.stack) || e);
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.type === 'id' || m.type === 'signup' || m.type === 'signin' || m.type === 'signout') ident = ident.then(() => handle(ws, m)).catch(fail);
    else ident.then(() => handle(ws, m)).catch(fail);
  });
  ws.on('close', () => { ident.then(() => { leave(ws, true); dropPresence(ws); }); });
});

async function handle(ws, m) {
  const T = ws.table;
  switch (m.type) {
    // ----- identity -----
    case 'id': {
      const secret = String(m.secret || ''); if (!/^[0-9a-f]{32,128}$/.test(secret)) return;
      ws.dev = sha('id:' + secret).slice(0, 16); ws.devFriends = Array.isArray(m.friends) ? m.friends : []; ws.devName = cleanName(m.name); ws.devAv = cleanAv(m.av);
      if (typeof m.tz === 'number') ws.tz = m.tz;
      let u = null;
      if (m.session) { try { u = await accounts.fromSession(String(m.session)); } catch (e) { console.error('session:', e.message); } if (!u && accounts.isReady()) send(ws, { type: 'signed_out', reason: 'expired' }); }
      if (u) { ws.session = String(m.session); await becomeAccount(ws, u); } else becomeDevice(ws);
      break;
    }
    case 'me': {
      if (!ws.me) return; const o = online.get(ws.me); if (!o) return;
      const nm = typeof m.name === 'string' ? cleanName(m.name) : '', av = m.av !== undefined ? cleanAv(m.av) : undefined;
      if (ws.uid) { const u = accounts.cached(ws.uid); if (u) accounts.setLook(u, nm || u.display, av); if (nm) o.name = nm; if (av !== undefined) o.av = av; }
      else { if (nm) o.name = nm; if (av !== undefined) o.av = av; if (Array.isArray(m.friends)) { ws.devFriends = m.friends; o.friends = cleanFriends(m.friends, ws.me); } ws.devName = o.name; ws.devAv = o.av; }
      sendPresence(ws); presenceChanged(ws.me); break;
    }

    // ----- accounts -----
    case 'signup': case 'signin': {
      if (!ws.dev) return send(ws, { type: 'auth_error', msg: 'Still connecting. Try again in a moment.' });
      const args = { username: m.username, password: m.password, display: cleanName(m.display) || ws.devName, av: cleanAv(m.av) || ws.devAv, dev: ws.dev, ip: ws.ip };
      let r; try { r = m.type === 'signup' ? await accounts.signup(args) : await accounts.signin(args); } catch (e) { console.error(m.type, e.message); r = { error: 'Something went wrong. Try again.' }; }
      if (r.error) return send(ws, { type: 'auth_error', msg: r.error });
      ws.session = r.token;
      send(ws, { type: 'session', token: r.token, welcome: r.welcome || 0, mode: m.type });
      try { await accounts.adoptDeviceFriends(r.user, ws.devFriends); } catch (e) { console.error('adopt friends:', e.message); }
      await becomeAccount(ws, r.user);
      for (const id of accounts.cached(r.user.id) ? [...(online.get(r.user.id) || { friends: [] }).friends] : []) pushFriends(id);
      break;
    }
    case 'signout': {
      if (!ws.uid) return; await accounts.signout(ws.session); ws.session = null;
      dropPresence(ws); ws.uid = null; becomeDevice(ws); send(ws, { type: 'signed_out', reason: 'asked' }); break;
    }
    case 'password': {
      if (!ws.uid) return; const u = await accounts.get(ws.uid);
      const r = await accounts.changePassword(u, m.old, m.new, ws.session);
      send(ws, r.error ? { type: 'auth_error', msg: r.error } : { type: 'toast', msg: 'Password changed. Other devices are signed out.' }); break;
    }
    case 'profile': { if (typeof m.tz === 'number') ws.tz = m.tz; await sendAccount(ws); break; }
    case 'spin': {
      if (!ws.uid) return send(ws, { type: 'need_account', why: 'wheel' });
      const u = await accounts.get(ws.uid); const r = u && accounts.spin(u);
      if (!r) return send(ws, { type: 'toast', msg: 'You have spun today already. The wheel is back tomorrow.' });
      send(ws, Object.assign({ type: 'spun' }, r));
      const o = online.get(ws.uid); if (o) for (const s of o.socks) if (s !== ws) send(s, { type: 'account_lite', user: accounts.pub(u), inPlay: inPlay(u.id), bonus: accounts.bonusInfo(u) });
      break;
    }

    // ----- friends -----
    case 'friend_add': { // from a friend link someone shared
      if (!isId(m.id) || m.id === ws.me) return;
      if (ws.uid) {
        const u = await accounts.get(ws.uid); const r = await accounts.link(u, m.id);
        if (r.error) { if (/not for an account/.test(r.error)) return send(ws, { type: 'toast', msg: 'They play as a guest. Ask them to make a free account so you can be friends.' }); return send(ws, { type: 'toast', msg: r.error }); }
        await pushFriends(u.id); await pushFriends(r.other.id);
        send(ws, { type: 'toast', msg: `You and ${r.other.display} are friends now` }); notify(r.other.id, { type: 'toast', msg: `${u.display} added you as a friend` });
        return;
      }
      const acct = await accounts.accountOf(m.id);
      if (acct) return send(ws, { type: 'need_account', why: 'friend', id: acct.id, name: acct.display });
      const o = online.get(ws.me); if (!o) return;
      o.friends.add(m.id); ws.devFriends = [...o.friends];
      const f = online.get(m.id); if (f) for (const s of f.socks) send(s, { type: 'friend_added', id: ws.me, name: o.name, av: o.av });
      sendPresence(ws); break;
    }
    case 'friend_remove': {
      if (!isId(m.id)) return;
      if (ws.uid) { const u = await accounts.get(ws.uid); await accounts.unfriend(u, m.id); await pushFriends(u.id); await pushFriends(m.id); return; }
      const o = online.get(ws.me); if (o) { o.friends.delete(m.id); sendPresence(ws); } break;
    }
    case 'friend_req': {
      if (!ws.uid) return send(ws, { type: 'need_account', why: 'request' });
      const u = await accounts.get(ws.uid); const r = await accounts.request(u, m.username, isId(m.id) ? m.id : null);
      if (r.error) return send(ws, { type: 'friend_msg', ok: 0, msg: r.error });
      await pushFriends(u.id); await pushFriends(r.other.id);
      if (r.accepted) { send(ws, { type: 'friend_msg', ok: 1, msg: `You and ${r.other.display} are friends now` }); notify(r.other.id, { type: 'toast', msg: `${u.display} accepted your friend request` }); }
      else { send(ws, { type: 'friend_msg', ok: 1, msg: `Request sent to @${r.other.username}` }); notify(r.other.id, { type: 'friend_req_in', from: { id: u.id, username: u.username, name: u.display, av: u.av } }); }
      break;
    }
    case 'friend_ans': {
      if (!ws.uid || !isId(m.id)) return; const u = await accounts.get(ws.uid);
      const r = await accounts.answer(u, m.id, !!m.yes); if (r.error) return send(ws, { type: 'toast', msg: r.error });
      await pushFriends(u.id); await pushFriends(m.id);
      if (m.yes) { notify(m.id, { type: 'toast', msg: `${u.display} accepted your friend request` }); presenceChanged(u.id); presenceChanged(m.id); }
      break;
    }
    case 'friend_cancel': { if (!ws.uid || !isId(m.id)) return; const u = await accounts.get(ws.uid); await accounts.cancel(u, m.id); await pushFriends(u.id); await pushFriends(m.id); break; }
    case 'invite': {
      if (!ws.me || !T || !isId(m.to)) return;
      const f = online.get(m.to); if (!f || !f.socks.size) return send(ws, { type: 'toast', msg: 'They are offline right now. Share the link instead.' });
      const o = online.get(ws.me); const token = rand(9);
      invites.set(token, { rid: T.rid, to: m.to, exp: Date.now() + 15 * 60 * 1000 });
      const me = T.players[ws.pid];
      for (const s of f.socks) send(s, { type: 'invited', token, from: { id: ws.me, name: (o && o.name) || (me && me.name) || 'A friend', av: o && o.av }, room: { name: T.tableName, host: hostName(T), seated: T.players.filter(p => !p.isBot && !p.gone).length, seats: T.seats, wager: T.wager, buyIn: T.buyIn } });
      send(ws, { type: 'toast', msg: `Invite sent to ${f.name || 'your friend'}` });
      break;
    }
    case 'accept_invite': {
      const inv = invites.get(String(m.token || ''));
      if (!inv || inv.to !== ws.me || inv.exp < Date.now()) return send(ws, { type: 'error', msg: 'That invite has expired. Ask for a new one.' });
      invites.delete(String(m.token)); const t = byRid.get(inv.rid);
      if (!t || t.closed) return send(ws, { type: 'error', msg: 'That room has closed.' });
      seatNew(ws, t, m); break;
    }

    // ----- rooms -----
    case 'rooms': sendRooms(ws); break;
    case 'host': {
      if (!cleanName(m.name)) return send(ws, { type: 'error', msg: 'Type your name first.' });
      const cfg = Object.assign({}, m.cfg || {}); delete cfg.rid;
      const t = new Table(newCode(), cfg, broadcast);
      const err = sitError(ws, t); if (err) return send(ws, { type: 'error', msg: err, need: 'chips' });
      if (T) leave(ws);
      register(t);
      const r = t.addHuman(ws, m.name, m.av, m.mic, m.cam, ws.uid); t.hostId = r.id;
      enter(ws, t, r, false); break;
    }
    case 'join': {
      const code = String(m.code || '').toLowerCase().trim(); const t = tables.get(code);
      if (!t || t.closed) return send(ws, { type: 'error', msg: 'No open table with that code. Check it with the host.' });
      if (returnAcct(ws, t)) return;
      const name = cleanName(m.name); if (!name) return send(ws, { type: 'error', msg: 'Type your name first.' });
      // the name matches a seat waiting for its owner: the host decides whether it is really them
      const ret = waitingSeat(t, name, ws.uid);
      if (ret >= 0) return askToJoin(ws, t, m, ret);
      if (t.wasRemoved(ws.uid, name)) return askToJoin(ws, t, m, -1); // taken off by the host: the host decides
      seatNew(ws, t, m); break;
    }
    case 'request': {
      const t = byRid.get(String(m.rid || ''));
      if (!t || t.closed) return send(ws, { type: 'error', msg: 'That room has closed.' });
      if (returnAcct(ws, t)) return;
      const name = cleanName(m.name); if (!name) return send(ws, { type: 'error', msg: 'Type your name first.' });
      const ret = waitingSeat(t, name, ws.uid);
      if (ret >= 0) return askToJoin(ws, t, m, ret);
      if (t.pub && !t.wasRemoved(ws.uid, name)) return seatNew(ws, t, m);
      askToJoin(ws, t, m, -1); break;
    }
    case 'return': { // an account going back to a seat it holds (works from any device)
      const t = byRid.get(String(m.rid || ''));
      if (!t || t.closed || !returnAcct(ws, t)) return send(ws, { type: 'error', msg: 'That seat is no longer held.' });
      break;
    }
    case 'request_cancel': cancelRequest(ws, true); break;
    case 'admit': {
      if (!T || ws.pid !== T.hostId) return;
      const r = T.requests.get(String(m.id || '')); if (!r) return;
      T.requests.delete(r.id); if (r.ws.request && r.ws.request.id === r.id) r.ws.request = null; T.sync();
      if (r.ws.readyState !== 1) return;
      if (!m.yes) return send(r.ws, { type: 'declined', msg: `${hostName(T) || 'The host'} said not now.` });
      T.removed.delete(r.ws.uid); T.removed.delete('n:' + r.name.toLowerCase()); // let back in by the host
      if (r.ret >= 0) {
        const p = T.players[r.ret];
        if (p && !p.isBot && !p.gone && !p.conn && p.name.toLowerCase() === r.name.toLowerCase() && (!p.uid || p.uid === r.ws.uid)) { if (r.ws.table) leave(r.ws); const rr = T.reclaim(r.ret, r.ws); if (rr) return enter(r.ws, T, rr, true); }
      }
      seatNew(r.ws, T, { name: r.name, av: r.av }); break;
    }
    case 'resume': {
      const code = String(m.code || '').toLowerCase().trim();
      let t = tables.get(code); if (t && t.closed) t = null;
      const o = openSeal(m.seal);
      if (o && o.room.code === code) t = restoreFromSeal(o) || t;
      if (!t) return send(ws, { type: 'gone', code: code.toUpperCase(), msg: closedCodes.has(code) ? 'That room was closed by its host.' : 'That table has closed.' });
      if (ws.table && ws.table !== t) leave(ws);
      const r = t.resume(String(m.token || ''), ws, seatHash);
      if (!r) { if (returnAcct(ws, t)) return; return send(ws, { type: 'gone', code: code.toUpperCase(), msg: 'Your seat at that table is no longer held.' }); }
      enter(ws, t, r, true); break;
    }
    case 'leave': leave(ws, false, !!m.forGood); sendRooms(ws); break;
    case 'close': {
      if (!T || ws.pid !== T.hostId || !T.persistent) return;
      closedCodes.add(T.code);
      const conns = T.players.map(p => p.conn).filter(Boolean);
      unregister(T); persistAll();
      const final = T.started ? T.standings() : null, owed = T.openLoans();
      for (const c of conns) { c.table = null; c.pid = -1; send(c, { type: 'gone', code: T.code.toUpperCase(), msg: 'The host closed the room.', final, owed, tn: T.tableName }); sendRooms(c); if (c.me) presenceChanged(c.me); }
      break;
    }
    case 'remove': { // the host takes someone off the table; a person can only come back if the host lets them in
      if (!T || ws.pid !== T.hostId) return;
      const pid = Math.floor(+m.pid), p = T.players[pid]; if (!p || p.gone || pid === T.hostId) return;
      const c = p.conn, who = hostName(T) || 'The host';
      if (!T.takeOff(pid)) return;
      if (c) { c.table = null; c.pid = -1; send(c, { type: 'gone', code: T.code.toUpperCase(), msg: `${who} took you off the table.` }); sendRooms(c); if (c.me) presenceChanged(c.me); if (c.uid) setTimeout(() => pushAccount(c.uid), 50); }
      for (const q of T.players) if (q.conn) send(q.conn, { type: 'peer', id: pid, event: 'left' });
      listDirty = true; if (T.persistent) persistAll();
      break;
    }

    // ----- at the table -----
    case 'hello': if (T) T.updateHuman(ws.pid, m); break;
    case 'voice_get': { const vk = vkOf(ws.me); if (!vk) return; const o = await loadVoice(vk); send(ws, { type: 'voice', info: voiceInfo(vk, o) || [vk, 0, o.v] }); break; }
    case 'shout_set': {
      const vk = vkOf(ws.me); if (!vk) return; const i = Math.floor(+m.i); if (!(i >= 0 && i < 32)) return;
      const b = Buffer.from(String(m.wav || ''), 'base64');
      if (b.length < 800 || b.length > 47000 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return send(ws, { type: 'error', msg: "That recording didn't come through. Try again, a little shorter." });
      const o = await loadVoice(vk); o.clips[i] = b; o.v++; saveVoice(vk, o); voiceChanged(vk, o); send(ws, { type: 'voice', info: voiceInfo(vk, o) }); break;
    }
    case 'shout_del': { const vk = vkOf(ws.me); if (!vk) return; const i = Math.floor(+m.i); const o = await loadVoice(vk); if (o.clips[i]) { delete o.clips[i]; o.v++; saveVoice(vk, o); voiceChanged(vk, o); } send(ws, { type: 'voice', info: voiceInfo(vk, o) || [vk, 0, o.v] }); break; }
    case 'act': if (T) { T.action(ws.pid, m.a); if (m.a && m.a.type === 'settings') { listDirty = true; persistAll(); } } break;
    case 'rtc': { // voice/video introductions: {to, data}
      if (!T) return; const to = T.players[+m.to]; if (!to || !to.conn) return;
      send(to.conn, { type: 'rtc', from: ws.pid, sid: ws.sid, data: m.data }); break;
    }
  }
}

// rooms list to everyone in the lobby when something changes
setInterval(() => {
  if (!listDirty) return; listDirty = false;
  const json = roomsJSON(); if (json === lastListJSON) return; lastListJSON = json;
  wss.clients.forEach(ws => { if (!ws.table && ws.readyState === 1) ws.send(json); });
}, 700);
// keepalive and tidy-up
setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); });
  const now = Date.now();
  for (const [, t] of tables) if (!t.persistent && now - t.lastActivity > 6 * 3600 * 1000) unregister(t);
  for (const [k, v] of invites) if (v.exp < now) invites.delete(k);
}, 30000);

// restore standing rooms: from this machine's disk first, then from the database (which outlives restarts)
function restoreSaved(saved, from) {
  (saved.closed || []).forEach(c => closedCodes.add(c));
  let n = 0;
  for (const [code, o] of Object.entries(saved.rooms || {})) {
    if (tables.has(code) || closedCodes.has(code)) continue;
    try { const t = Table.fromJSON(o.room, broadcast); t.sealVer = o.ver || 0; register(t); n++; } catch (e) { console.error('restore failed', code, e.message); }
  }
  if (n) console.log(`restored ${n} room(s) from ${from}:`, [...tables.keys()].join(', '));
}
restoreSaved(store.load(), 'disk');
accounts.init().then(async () => {
  if (!accounts.isReady()) return;
  try { const saved = await accounts.kvGet('rooms'); if (saved) restoreSaved(saved, 'the database'); } catch (e) { console.error('rooms load:', e.message); }
});

server.listen(PORT, () => console.log('Tete 21 listening on', PORT));

'use strict';
// Tete 21 server: serves the game, runs the tables, lists rooms, handles join requests,
// friends' online status and invites, and introduces players to each other for voice/video.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Table, cleanName, cleanAv } = require('./public/engine');
const store = require('./store');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const tables = new Map();   // code -> Table
const byRid = new Map();    // public room id -> Table (used by the rooms list, never reveals the code)
const closedCodes = new Set();
const online = new Map();   // player id -> { socks:Set<ws>, name, av, friends:Set<id> }
const invites = new Map();  // invite token -> { rid, to, exp }
let listDirty = true, lastListJSON = '';

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const seatHash = t => sha('seat:' + t);
const rand = n => crypto.randomBytes(n).toString('base64url');
const send = (ws, m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
const isId = x => typeof x === 'string' && /^[0-9a-f]{16}$/.test(x);

// ---------- sealed copies of standing rooms ----------
// The free host forgets its disk when it sleeps, so every player's device keeps a signed copy of
// each standing room it sits in. The first player back hands it in and the room is restored.
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
function persistAll() {
  const rooms = {};
  for (const [c, t] of tables) if (t.persistent && !t.closed) rooms[c] = { ver: t.sealVer || 0, room: t.toJSON(seatHash) };
  store.save({ rooms, closed: [...closedCodes].slice(-500) });
}
function register(t) {
  tables.set(t.code, t); byRid.set(t.rid, t);
  t.requests = t.requests || new Map();
  if (t.persistent) t.onSave = () => saveRoom(t);
  listDirty = true;
}
function unregister(t) {
  t.closed = true; tables.delete(t.code); byRid.delete(t.rid);
  for (const r of (t.requests || new Map()).values()) { r.ws.request = null; send(r.ws, { type: 'declined', msg: 'That room has closed.' }); }
  if (t.requests) t.requests.clear();
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

// ---------- seats ----------
function enter(ws, t, r, resumed) {
  cancelRequest(ws);
  if (r.prev && r.prev !== ws) { const old = r.prev; old.table = null; old.pid = -1; send(old, { type: 'gone', code: t.code.toUpperCase(), msg: 'You opened this table on another screen.' }); }
  ws.table = t; ws.pid = r.id; ws.lastFx = t.fxn;
  send(ws, { type: 'joined', code: t.code.toUpperCase(), rid: t.rid, id: r.id, token: r.token, resumed: !!resumed, keep: t.persistent ? 1 : 0 });
  send(ws, { type: 'logs', items: t.fxq.filter(e => e.k === 'log').slice(-25) });
  t.sync(); if (t.persistent) saveRoom(t);
  for (const p of t.players) if (p.conn && p.conn !== ws) send(p.conn, { type: 'peer', id: r.id, event: 'joined' });
  listDirty = true; if (ws.me) presenceChanged(ws.me);
}
function seatNew(ws, t, m) {
  const name = cleanName(m.name); if (!name) return send(ws, { type: 'error', msg: 'Type your name first.' });
  if (ws.table) leave(ws);
  const r = t.addHuman(ws, name, m.av, m.mic, m.cam);
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
function leave(ws, dropped) {
  cancelRequest(ws);
  const T = ws.table; if (!T) return;
  const pid = ws.pid, p = T.players[pid];
  ws.table = null; ws.pid = -1;
  if (p && p.conn === ws) { if (dropped || T.persistent) T.disconnect(pid); else T.removeHuman(pid); }
  for (const q of T.players) if (q.conn && q.conn !== ws) send(q.conn, { type: 'peer', id: pid, event: 'left' });
  listDirty = true; if (ws.me) presenceChanged(ws.me);
  if (T.persistent || T.closed) return;
  if (T.humansPresent() === 0) unregister(T);
  else if (T.humansConnected() === 0) { clearTimeout(T.emptyT); T.emptyT = setTimeout(() => { if (!T.closed && T.humansConnected() === 0) unregister(T); }, 120000); }
}
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
  if (url === '/health') { res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }); return res.end('ok'); }
  if (url === '/ice') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(iceServers())); }
  const file = url === '/' ? 'index.html' : url.slice(1);
  const fp = path.join(PUBLIC, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if (!fp.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
    res.writeHead(200, { 'content-type': types[path.extname(fp)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

// ---------- websocket ----------
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
wss.on('connection', ws => {
  ws.table = null; ws.pid = -1; ws.lastFx = 0; ws.isAlive = true; ws.me = null; ws.request = null;
  ws.on('pong', () => (ws.isAlive = true));
  sendRooms(ws);
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const T = ws.table;
    switch (m.type) {
      // ----- identity & friends -----
      case 'id': {
        const secret = String(m.secret || ''); if (!/^[0-9a-f]{32,128}$/.test(secret)) return;
        const id = sha('id:' + secret).slice(0, 16);
        if (ws.me && ws.me !== id) dropPresence(ws);
        ws.me = id;
        let o = online.get(id); const wasOn = !!(o && o.socks.size);
        if (!o) { o = { socks: new Set(), name: '', av: null, friends: new Set() }; online.set(id, o); }
        o.socks.add(ws); o.name = cleanName(m.name) || o.name; o.av = cleanAv(m.av) || o.av; o.friends = cleanFriends(m.friends, id);
        send(ws, { type: 'you', id });
        sendPresence(ws);
        for (const [uid, u] of online) if (uid !== id && u.socks.size && u.friends.has(id) && !o.friends.has(uid)) send(ws, { type: 'friend_added', id: uid, name: u.name, av: u.av });
        if (!wasOn) presenceChanged(id);
        break;
      }
      case 'me': {
        if (!ws.me) return; const o = online.get(ws.me); if (!o) return;
        if (typeof m.name === 'string') o.name = cleanName(m.name) || o.name;
        if (m.av !== undefined) o.av = cleanAv(m.av);
        if (Array.isArray(m.friends)) o.friends = cleanFriends(m.friends, ws.me);
        sendPresence(ws); presenceChanged(ws.me); break;
      }
      case 'friend_add': {
        if (!ws.me || !isId(m.id) || m.id === ws.me) return; const o = online.get(ws.me); if (!o) return;
        o.friends.add(m.id);
        const f = online.get(m.id); if (f) for (const s of f.socks) send(s, { type: 'friend_added', id: ws.me, name: o.name, av: o.av });
        sendPresence(ws); break;
      }
      case 'friend_remove': { if (!ws.me || !isId(m.id)) return; const o = online.get(ws.me); if (o) { o.friends.delete(m.id); sendPresence(ws); } break; }
      case 'invite': {
        if (!ws.me || !T || !isId(m.to)) return;
        const f = online.get(m.to); if (!f || !f.socks.size) return send(ws, { type: 'toast', msg: 'They are offline right now. Share the link instead.' });
        const o = online.get(ws.me); const token = rand(9);
        invites.set(token, { rid: T.rid, to: m.to, exp: Date.now() + 15 * 60 * 1000 });
        const me = T.players[ws.pid];
        for (const s of f.socks) send(s, { type: 'invited', token, from: { id: ws.me, name: (o && o.name) || (me && me.name) || 'A friend', av: o && o.av }, room: { name: T.tableName, host: hostName(T), seated: T.players.filter(p => !p.isBot && !p.gone).length, seats: T.seats, wager: T.wager } });
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
        if (T) leave(ws);
        const cfg = Object.assign({}, m.cfg || {}); delete cfg.rid;
        const t = new Table(newCode(), cfg, broadcast); register(t);
        const r = t.addHuman(ws, m.name, m.av, m.mic, m.cam); t.hostId = r.id;
        enter(ws, t, r, false); break;
      }
      case 'join': {
        const code = String(m.code || '').toLowerCase().trim(); const t = tables.get(code);
        if (!t || t.closed) return send(ws, { type: 'error', msg: 'No open table with that code. Check it with the host.' });
        const name = cleanName(m.name); if (!name) return send(ws, { type: 'error', msg: 'Type your name first.' });
        // the name matches a seat waiting for its owner: the host decides whether it is really them
        const ret = t.players.findIndex(p => !p.isBot && !p.gone && !p.conn && p.name.toLowerCase() === name.toLowerCase());
        if (ret >= 0) return askToJoin(ws, t, m, ret);
        seatNew(ws, t, m); break;
      }
      case 'request': {
        const t = byRid.get(String(m.rid || ''));
        if (!t || t.closed) return send(ws, { type: 'error', msg: 'That room has closed.' });
        const name = cleanName(m.name); if (!name) return send(ws, { type: 'error', msg: 'Type your name first.' });
        const ret = t.players.findIndex(p => !p.isBot && !p.gone && !p.conn && p.name.toLowerCase() === name.toLowerCase());
        if (ret >= 0) return askToJoin(ws, t, m, ret);
        if (t.pub) return seatNew(ws, t, m);
        askToJoin(ws, t, m, -1); break;
      }
      case 'request_cancel': cancelRequest(ws, true); break;
      case 'admit': {
        if (!T || ws.pid !== T.hostId) return;
        const r = T.requests.get(String(m.id || '')); if (!r) return;
        T.requests.delete(r.id); if (r.ws.request && r.ws.request.id === r.id) r.ws.request = null; T.sync();
        if (r.ws.readyState !== 1) return;
        if (!m.yes) return send(r.ws, { type: 'declined', msg: `${hostName(T) || 'The host'} said not now.` });
        if (r.ret >= 0) {
          const p = T.players[r.ret];
          if (p && !p.isBot && !p.gone && !p.conn && p.name.toLowerCase() === r.name.toLowerCase()) { if (r.ws.table) leave(r.ws); const rr = T.reclaim(r.ret, r.ws); if (rr) return enter(r.ws, T, rr, true); }
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
        if (!r) return send(ws, { type: 'gone', code: code.toUpperCase(), msg: 'Your seat at that table is no longer held.' });
        enter(ws, t, r, true); break;
      }
      case 'leave': leave(ws); sendRooms(ws); break;
      case 'close': {
        if (!T || ws.pid !== T.hostId || !T.persistent) return;
        closedCodes.add(T.code);
        const conns = T.players.map(p => p.conn).filter(Boolean);
        unregister(T); persistAll();
        for (const c of conns) { c.table = null; c.pid = -1; send(c, { type: 'gone', code: T.code.toUpperCase(), msg: 'The host closed the room.' }); sendRooms(c); if (c.me) presenceChanged(c.me); }
        break;
      }

      // ----- at the table -----
      case 'hello': if (T) T.updateHuman(ws.pid, m); break;
      case 'act': if (T) T.action(ws.pid, m.a); break;
      case 'rtc': { // voice/video introductions: {to, data}
        if (!T) return; const to = T.players[+m.to]; if (!to || !to.conn) return;
        send(to.conn, { type: 'rtc', from: ws.pid, data: m.data }); break;
      }
    }
  });
  ws.on('close', () => { leave(ws, true); dropPresence(ws); });
});

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

// restore rooms saved on this machine's disk (hosts with a persistent disk)
(() => {
  const saved = store.load();
  (saved.closed || []).forEach(c => closedCodes.add(c));
  for (const [code, o] of Object.entries(saved.rooms || {})) {
    try { const t = Table.fromJSON(o.room, broadcast); t.sealVer = o.ver || 0; register(t); } catch (e) { console.error('restore failed', code, e.message); }
  }
  if (tables.size) console.log('restored rooms:', [...tables.keys()].join(', '));
})();

server.listen(PORT, () => console.log('Tete 21 listening on', PORT));

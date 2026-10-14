'use strict';
// Tete 21 server: serves the game page, runs tables, relays WebRTC signalling for voice/video.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Table } = require('./public/engine');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const tables = new Map(); // code -> Table

// Optional TURN relay for phones on strict mobile networks (set on the host, e.g. from metered.ca):
// TURN_URL=turn:host:443?transport=tcp TURN_USER=... TURN_PASS=...
function iceServers() {
  const s = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.TURN_URL) s.push({ urls: process.env.TURN_URL.split(',').map(x => x.trim()), username: process.env.TURN_USER || '', credential: process.env.TURN_PASS || '' });
  return s;
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (url === '/ice') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(iceServers())); }
  const file = url === '/' ? 'index.html' : url.slice(1);
  const fp = path.join(PUBLIC, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if (!fp.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
    res.writeHead(200, { 'content-type': types[path.extname(fp)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };

function broadcast(table) {
  const fx = table.fxq;
  for (const p of table.players) {
    if (!p.conn || p.conn.readyState !== 1) continue;
    const c = p.conn;
    const fresh = fx.filter(e => e.n > (c.lastFx || 0));
    if (fresh.length) c.lastFx = fresh[fresh.length - 1].n;
    send(c, { type: 'state', st: table.snapshot(p.id), fx: fresh });
  }
  if (table.humansPresent() === 0 && table.started) { table.closed = true; tables.delete(table.code); }
}
function newCode() { for (;;) { const c = 'tete-' + Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 4).padEnd(4, '7'); if (!tables.has(c)) return c; } }

wss.on('connection', ws => {
  ws.table = null; ws.pid = -1; ws.lastFx = 0; ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const T = ws.table;
    switch (m.type) {
      case 'host': {
        if (T) leave(ws);
        const code = newCode(); const t = new Table(code, m.cfg || {}, broadcast); tables.set(code, t);
        const r = t.addHuman(ws, m.name, m.av, m.mic, m.cam); t.hostId = r.id; ws.table = t; ws.pid = r.id;
        send(ws, { type: 'joined', code: code.toUpperCase(), id: r.id }); t.sync(); break;
      }
      case 'join': {
        if (T) leave(ws);
        const code = String(m.code || '').toLowerCase().trim(); const t = tables.get(code);
        if (!t) return send(ws, { type: 'error', msg: 'No open table with that code. Check it with the host.' });
        const r = t.addHuman(ws, m.name, m.av, m.mic, m.cam);
        if (r.error) return send(ws, { type: 'error', msg: r.error });
        ws.table = t; ws.pid = r.id; send(ws, { type: 'joined', code: code.toUpperCase(), id: r.id }); t.sync();
        // tell everyone a new peer is here for voice/video
        for (const p of t.players) if (p.conn && p.conn !== ws) send(p.conn, { type: 'peer', id: r.id, event: 'joined' });
        break;
      }
      case 'hello': if (T) T.updateHuman(ws.pid, m); break;
      case 'act': if (T) T.action(ws.pid, m.a); break;
      case 'leave': leave(ws); break;
      case 'rtc': { // signalling relay: {to, data}
        if (!T) return; const to = T.players[+m.to]; if (!to || !to.conn) return;
        send(to.conn, { type: 'rtc', from: ws.pid, data: m.data }); break;
      }
    }
  });
  ws.on('close', () => leave(ws));
});
function leave(ws) {
  const T = ws.table; if (!T) return;
  T.removeHuman(ws.pid);
  for (const p of T.players) if (p.conn && p.conn !== ws) send(p.conn, { type: 'peer', id: ws.pid, event: 'left' });
  ws.table = null; ws.pid = -1;
  if (T.humansPresent() === 0) { T.closed = true; tables.delete(T.code); }
}
setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); });
  const now = Date.now();
  for (const [code, t] of tables) if (now - t.lastActivity > 6 * 3600 * 1000) { t.closed = true; tables.delete(code); }
}, 30000);

server.listen(PORT, () => console.log('Tete 21 listening on', PORT));

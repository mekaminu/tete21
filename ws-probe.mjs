// Opens sockets to the live game the way a stranger would (no cookie, then a made-up cookie) and logs what happens.
import WebSocket from 'ws';
const U = 'wss://tete21.onrender.com';
const probe = (label, headers) => new Promise(res => {
  const t0 = Date.now(), log = []; const mark = e => log.push(`${e}@${Date.now() - t0}ms`);
  const ws = new WebSocket(U, { headers });
  ws.on('open', () => mark('open'));
  ws.on('message', d => mark('msg:' + String(d).slice(0, 40)));
  ws.on('error', e => mark('error:' + e.message));
  ws.on('close', (c, r) => { mark(`close:${c}:${r}`); res(`${label}: ${log.join(' ')}`); });
  setTimeout(() => { mark('state:' + ws.readyState); try { ws.terminate(); } catch {} res(`${label}: ${log.join(' ')}`); }, 15000);
});
console.log(await probe('no cookie', {}));
console.log(await probe('made-up cookie', { cookie: 'tete_s=' + 'x'.repeat(43) }));

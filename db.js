'use strict';
// Storage for player accounts, friends, hand history, the wallet ledger and standing rooms.
// Postgres when DATABASE_URL is set (Neon on Render); otherwise a JSON file, for running locally.
const fs = require('fs');
const path = require('path');

const DB_URL = process.env.DATABASE_URL || '';
let pool = null, mem = null, memFile = '', memT = null;

const SCHEMA = `
create table if not exists t21_users(
  id text primary key, username text not null unique, display text not null, pass text not null,
  av jsonb, balance bigint not null default 0, xp bigint not null default 0,
  stats jsonb not null default '{}'::jsonb, bonus_day text, created_at timestamptz not null default now());
create table if not exists t21_sessions(token_hash text primary key, user_id text not null, created_at timestamptz not null default now());
create table if not exists t21_devices(device_id text primary key, user_id text not null, at timestamptz not null default now());
create table if not exists t21_friends(a text not null, b text not null, status text not null, asked_by text not null,
  at timestamptz not null default now(), primary key(a, b));
create index if not exists t21_friends_b on t21_friends(b);
create table if not exists t21_hands(id bigserial primary key, user_id text not null, at timestamptz not null default now(),
  table_name text, delta bigint not null, won boolean not null default false, total int, adasi boolean not null default false);
create index if not exists t21_hands_user_at on t21_hands(user_id, at desc);
create table if not exists t21_ledger(id bigserial primary key, user_id text not null, at timestamptz not null default now(),
  delta bigint not null, kind text not null, meta jsonb);
create table if not exists t21_kv(k text primary key, v jsonb not null, at timestamptz not null default now());
`;

// Neon hands out URLs with libpq-only options (channel_binding); keep TLS on and verified, drop the rest
function connOpts(u) {
  try {
    const x = new URL(u); const mode = x.searchParams.get('sslmode');
    for (const k of ['sslmode', 'channel_binding', 'sslrootcert', 'sslcert', 'sslkey', 'options']) x.searchParams.delete(k);
    const local = /^(localhost|127\.0\.0\.1|::1)$/.test(x.hostname);
    const ssl = mode ? mode !== 'disable' : !local;
    return { connectionString: x.toString(), ssl: ssl ? { rejectUnauthorized: true } : false };
  } catch { return { connectionString: u }; }
}

async function init() {
  if (DB_URL) {
    const { Pool } = require('pg');
    pool = new Pool(Object.assign(connOpts(DB_URL), { max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, query_timeout: 15000 }));
    pool.on('error', e => console.error('db pool:', e.message));
    await pool.query(SCHEMA);
    console.log('accounts: Postgres ready');
  } else {
    memFile = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'accounts.json');
    try { mem = JSON.parse(fs.readFileSync(memFile, 'utf8')); } catch { mem = null; }
    mem = Object.assign({ users: {}, sessions: {}, devices: {}, friends: {}, hands: [], ledger: [], kv: {}, seq: 0 }, mem || {});
    console.log('accounts: local file store (set DATABASE_URL to use Postgres)');
  }
}
const isPg = () => !!pool;
function memSave() { clearTimeout(memT); memT = setTimeout(() => { try { fs.mkdirSync(path.dirname(memFile), { recursive: true }); fs.writeFileSync(memFile + '.tmp', JSON.stringify(mem)); fs.renameSync(memFile + '.tmp', memFile); } catch (e) { console.error('accounts save:', e.message); } }, 300); }
const q = (sql, args) => pool.query(sql, args);
const row2user = r => r && ({ id: r.id, username: r.username, display: r.display, pass: r.pass, av: r.av || null, balance: +r.balance || 0, xp: +r.xp || 0, stats: r.stats || {}, bonus_day: r.bonus_day || null, created_at: r.created_at ? new Date(r.created_at).getTime() : Date.now() });
const fkey = (a, b) => (a < b ? a + ':' + b : b + ':' + a);

// ----- users -----
async function createUser(u) {
  if (pool) {
    try { await q('insert into t21_users(id, username, display, pass, av, balance, xp, stats) values($1,$2,$3,$4,$5,$6,$7,$8)', [u.id, u.username, u.display, u.pass, u.av ? JSON.stringify(u.av) : null, u.balance, u.xp || 0, JSON.stringify(u.stats || {})]); }
    catch (e) { if (e.code === '23505') throw new Error('taken'); throw e; }
    return;
  }
  if (Object.values(mem.users).some(x => x.username === u.username)) throw new Error('taken');
  mem.users[u.id] = Object.assign({ created_at: Date.now() }, u); memSave();
}
async function userByName(username) {
  if (pool) { const r = await q('select * from t21_users where username = $1', [username]); return row2user(r.rows[0]) || null; }
  const u = Object.values(mem.users).find(x => x.username === username); return u ? Object.assign({}, u) : null;
}
async function userById(id) {
  if (pool) { const r = await q('select * from t21_users where id = $1', [id]); return row2user(r.rows[0]) || null; }
  return mem.users[id] ? Object.assign({}, mem.users[id]) : null;
}
async function usersByIds(ids) {
  if (!ids.length) return [];
  if (pool) { const r = await q('select * from t21_users where id = any($1)', [ids]); return r.rows.map(row2user); }
  return ids.map(id => mem.users[id]).filter(Boolean).map(u => Object.assign({}, u));
}
// everyone with an account, newest first (the owner's Members list); no passwords
async function listUsers(limit) {
  const n = Math.max(1, Math.min(2000, limit | 0 || 300));
  const strip = u => u && ({ id: u.id, username: u.username, display: u.display, av: u.av || null, stats: u.stats || {}, created_at: u.created_at });
  if (pool) { const r = await q('select id, username, display, av, stats, created_at from t21_users order by created_at desc limit $1', [n]); return r.rows.map(row2user).map(strip); }
  return Object.values(mem.users).sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice(0, n).map(strip);
}
async function saveUser(u) {
  if (pool) { await q('update t21_users set display=$2, av=$3, balance=$4, xp=$5, stats=$6, bonus_day=$7 where id=$1', [u.id, u.display, u.av ? JSON.stringify(u.av) : null, u.balance, u.xp, JSON.stringify(u.stats || {}), u.bonus_day]); return; }
  const m = mem.users[u.id]; if (!m) return; Object.assign(m, { display: u.display, av: u.av, balance: u.balance, xp: u.xp, stats: u.stats, bonus_day: u.bonus_day }); memSave();
}
async function setPassword(id, pass) {
  if (pool) { await q('update t21_users set pass=$2 where id=$1', [id, pass]); return; }
  if (mem.users[id]) { mem.users[id].pass = pass; memSave(); }
}

// ----- sessions and devices -----
async function addSession(hash, uid) { if (pool) { await q('insert into t21_sessions(token_hash, user_id) values($1,$2) on conflict do nothing', [hash, uid]); return; } mem.sessions[hash] = { uid, at: Date.now() }; memSave(); }
async function sessionUser(hash) { if (pool) { const r = await q('select user_id from t21_sessions where token_hash=$1', [hash]); return r.rows[0] ? r.rows[0].user_id : null; } return mem.sessions[hash] ? mem.sessions[hash].uid : null; }
async function dropSession(hash) { if (pool) { await q('delete from t21_sessions where token_hash=$1', [hash]); return; } delete mem.sessions[hash]; memSave(); }
async function dropSessionsOf(uid, keepHash) { if (pool) { await q('delete from t21_sessions where user_id=$1 and token_hash<>$2', [uid, keepHash || '']); return; } for (const [h, s] of Object.entries(mem.sessions)) if (s.uid === uid && h !== keepHash) delete mem.sessions[h]; memSave(); }
async function linkDevice(dev, uid) { if (pool) { await q('insert into t21_devices(device_id, user_id) values($1,$2) on conflict(device_id) do update set user_id=excluded.user_id, at=now()', [dev, uid]); return; } mem.devices[dev] = uid; memSave(); }
async function deviceUsers(devs) {
  const out = new Map(); if (!devs.length) return out;
  if (pool) { const r = await q('select device_id, user_id from t21_devices where device_id = any($1)', [devs]); for (const x of r.rows) out.set(x.device_id, x.user_id); return out; }
  for (const d of devs) if (mem.devices[d]) out.set(d, mem.devices[d]); return out;
}
async function devicesOf(uid) { if (pool) { const r = await q('select device_id from t21_devices where user_id=$1', [uid]); return r.rows.map(x => x.device_id); } return Object.keys(mem.devices).filter(d => mem.devices[d] === uid); }

// ----- friends: one row per pair (a < b); status 'pending' (asked_by asked) or 'friends' -----
async function friendsOf(uid) {
  if (pool) { const r = await q('select a, b, status, asked_by from t21_friends where a=$1 or b=$1', [uid]); return r.rows.map(x => ({ other: x.a === uid ? x.b : x.a, status: x.status, asked_by: x.asked_by })); }
  return Object.entries(mem.friends).filter(([k]) => k.split(':').includes(uid)).map(([k, v]) => { const [a, b] = k.split(':'); return { other: a === uid ? b : a, status: v.status, asked_by: v.asked_by }; });
}
async function getFriend(x, y) {
  const [a, b] = x < y ? [x, y] : [y, x];
  if (pool) { const r = await q('select status, asked_by from t21_friends where a=$1 and b=$2', [a, b]); return r.rows[0] || null; }
  return mem.friends[fkey(x, y)] || null;
}
async function setFriend(x, y, status, askedBy) {
  const [a, b] = x < y ? [x, y] : [y, x];
  if (pool) { await q('insert into t21_friends(a, b, status, asked_by) values($1,$2,$3,$4) on conflict(a, b) do update set status=excluded.status, asked_by=excluded.asked_by, at=now()', [a, b, status, askedBy]); return; }
  mem.friends[fkey(x, y)] = { status, asked_by: askedBy, at: Date.now() }; memSave();
}
async function dropFriend(x, y) {
  const [a, b] = x < y ? [x, y] : [y, x];
  if (pool) { await q('delete from t21_friends where a=$1 and b=$2', [a, b]); return; }
  delete mem.friends[fkey(x, y)]; memSave();
}

// ----- hands, ledger, history -----
async function addHand(h) {
  if (pool) { await q('insert into t21_hands(user_id, table_name, delta, won, total, adasi) values($1,$2,$3,$4,$5,$6)', [h.uid, h.table, h.delta, !!h.won, h.total ?? null, !!h.adasi]); return; }
  mem.hands.push({ uid: h.uid, at: Date.now(), table: h.table, delta: h.delta, won: !!h.won, total: h.total ?? null, adasi: !!h.adasi });
  if (mem.hands.length > 20000) mem.hands.splice(0, mem.hands.length - 20000); memSave();
}
async function addLedger(uid, delta, kind, meta) {
  if (pool) { await q('insert into t21_ledger(user_id, delta, kind, meta) values($1,$2,$3,$4)', [uid, delta, kind, meta ? JSON.stringify(meta) : null]); return; }
  mem.ledger.push({ uid, at: Date.now(), delta, kind, meta: meta || null }); if (mem.ledger.length > 20000) mem.ledger.splice(0, mem.ledger.length - 20000); memSave();
}
// each day's result over the last `days` days, in the player's own time zone (offset in minutes east of UTC)
async function daily(uid, days, tz) {
  const off = Math.max(-840, Math.min(840, Math.round(+tz || 0)));
  if (pool) {
    const r = await q(`select to_char(date_trunc('day', at + make_interval(mins => $3)), 'YYYY-MM-DD') d, sum(delta)::bigint net, count(*)::int hands, sum(case when won then 1 else 0 end)::int wins
      from t21_hands where user_id=$1 and at > now() - make_interval(days => $2) group by 1 order by 1`, [uid, days + 1, off]);
    return r.rows.map(x => ({ d: x.d, net: +x.net, hands: x.hands, wins: x.wins }));
  }
  const since = Date.now() - (days + 1) * 864e5, by = {};
  for (const h of mem.hands) if (h.uid === uid && h.at > since) { const d = new Date(h.at + off * 60000).toISOString().slice(0, 10); const o = by[d] || (by[d] = { d, net: 0, hands: 0, wins: 0 }); o.net += h.delta; o.hands++; if (h.won) o.wins++; }
  return Object.values(by).sort((a, b) => a.d.localeCompare(b.d));
}
async function recent(uid, n) {
  if (pool) { const r = await q('select at, table_name, delta, won, total, adasi from t21_hands where user_id=$1 order by at desc limit $2', [uid, n]); return r.rows.map(x => ({ at: new Date(x.at).getTime(), table: x.table_name, delta: +x.delta, won: x.won, total: x.total, adasi: x.adasi })); }
  return mem.hands.filter(h => h.uid === uid).slice(-n).reverse().map(h => ({ at: h.at, table: h.table, delta: h.delta, won: h.won, total: h.total, adasi: h.adasi }));
}

// ----- small key/value store (standing rooms) -----
async function kvGet(k) { if (pool) { const r = await q('select v from t21_kv where k=$1', [k]); return r.rows[0] ? r.rows[0].v : null; } return mem.kv[k] ?? null; }
async function kvSet(k, v) { if (pool) { await q('insert into t21_kv(k, v) values($1,$2) on conflict(k) do update set v=excluded.v, at=now()', [k, JSON.stringify(v)]); return; } mem.kv[k] = v; memSave(); }

module.exports = { init, isPg, createUser, userByName, userById, usersByIds, listUsers, saveUser, setPassword, addSession, sessionUser, dropSession, dropSessionsOf, linkDevice, deviceUsers, devicesOf, friendsOf, getFriend, setFriend, dropFriend, addHand, addLedger, daily, recent, kvGet, kvSet };

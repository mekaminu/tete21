'use strict';
// Accounts: sign-up and sign-in, sessions, the wallet, friend requests, stats, levels,
// the daily wheel and the history behind the profile. Play chips only.
//
// Wallet model: your balance backs the chips in front of you. You need enough free balance
// (balance minus chips already on tables) to sit; each hand's win or loss lands on the
// balance the moment the hand ends, so nothing is lost if the server restarts mid-game.
const crypto = require('crypto');
const db = require('./db');

const WELCOME = 10000;
const WHEEL = [500, 1000, 750, 2500, 500, 1500, 1000, 5000];   // segments in order round the wheel
const WEIGHTS = [15, 12.5, 20, 9, 15, 12, 12.5, 4];            // chance of each segment, in percent
const TITLES = [[1, 'Fresh hand'], [3, 'Regular'], [5, 'Sharp'], [8, 'Card shark'], [12, 'Oga at the table'], [18, 'Chairman'], [25, 'Baba Tete']];

let ready = false;
const cache = new Map();     // uid -> user (authoritative while the server runs)
const loading = new Map();   // uid -> promise
const saveT = new Map();     // uid -> timer
const fails = new Map();     // key -> { n, t } failed sign-ins
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');

async function init() {
  try { await db.init(); ready = true; }
  catch (e) { ready = false; console.error('accounts unavailable:', e.message); setTimeout(init, 60000); }
}
const isReady = () => ready;

// ----- passwords -----
const SCRYPT = { N: 16384, r: 8, p: 1 };
function hashPass(pw) { return new Promise((res, rej) => { const salt = crypto.randomBytes(16); crypto.scrypt(pw, salt, 32, SCRYPT, (e, k) => (e ? rej(e) : res(`s1$${salt.toString('base64')}$${k.toString('base64')}`))); }); }
function checkPass(pw, stored) {
  return new Promise(res => {
    const [v, s, h] = String(stored || '').split('$'); if (v !== 's1' || !s || !h) return res(false);
    crypto.scrypt(pw, Buffer.from(s, 'base64'), 32, SCRYPT, (e, k) => { try { const want = Buffer.from(h, 'base64'); res(!e && want.length === k.length && crypto.timingSafeEqual(k, want)); } catch { res(false); } });
  });
}
function limited(key) { const f = fails.get(key); if (!f) return false; if (Date.now() - f.t > 10 * 60000) { fails.delete(key); return false; } return f.n >= 8; }
function failed(key) { const f = fails.get(key) || { n: 0, t: Date.now() }; f.n++; f.t = Date.now(); fails.set(key, f); }
const cleanUser = s => String(s || '').trim().toLowerCase().replace(/^@/, '');
const validUser = s => /^[a-z0-9_]{3,16}$/.test(s);

// ----- levels -----
function level(xp) { let n = 1; while (50 * (n + 1) * n <= xp) n++; const from = 50 * n * (n - 1), to = 50 * (n + 1) * n; let title = TITLES[0][1]; for (const [l, t] of TITLES) if (n >= l) title = t; return { n, from, to, title }; }

// ----- cache and saving -----
async function get(uid) {
  if (!uid) return null; if (cache.has(uid)) return cache.get(uid);
  if (loading.has(uid)) return loading.get(uid);
  const p = db.userById(uid).then(u => { loading.delete(uid); if (u) { u.stats = Object.assign({ hands: 0, wins: 0, biggest: 0, adasi: 0, streak: 0, best: 0, h21: 0 }, u.stats || {}); cache.set(uid, u); } return u; }).catch(e => { loading.delete(uid); throw e; });
  loading.set(uid, p); return p;
}
const cached = uid => cache.get(uid) || null;
function persist(u) { clearTimeout(saveT.get(u.id)); saveT.set(u.id, setTimeout(() => { saveT.delete(u.id); db.saveUser(u).catch(e => console.error('save user:', e.message)); }, 250)); }

// ----- sign-up, sign-in, sessions -----
async function newSession(uid, dev) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.addSession(sha('sess:' + token), uid);
  if (dev) await db.linkDevice(dev, uid).catch(() => {});
  return token;
}
async function signup({ username, password, display, av, dev, ip }) {
  if (!ready) return { error: 'Accounts are not available right now. Try again in a minute.' };
  const name = cleanUser(username);
  if (!validUser(name)) return { error: 'Usernames are 3 to 16 letters, numbers or _ (no spaces).' };
  if (typeof password !== 'string' || password.length < 6) return { error: 'Use a password of at least 6 characters.' };
  if (password.length > 200) return { error: 'That password is too long.' };
  if (limited('ip:' + ip)) return { error: 'Too many tries. Wait a few minutes.' };
  const u = { id: crypto.randomBytes(8).toString('hex'), username: name, display: display || name, pass: await hashPass(password), av: av || null, balance: WELCOME, xp: 0, stats: { hands: 0, wins: 0, biggest: 0, adasi: 0, streak: 0, best: 0, h21: 0 }, bonus_day: null, created_at: Date.now() };
  try { await db.createUser(u); } catch (e) { if (e.message === 'taken') { failed('ip:' + ip); return { error: `@${name} is taken. Try another.` }; } throw e; }
  db.addLedger(u.id, WELCOME, 'welcome').catch(() => {});
  cache.set(u.id, u);
  return { user: u, token: await newSession(u.id, dev), welcome: WELCOME };
}
async function signin({ username, password, dev, ip }) {
  if (!ready) return { error: 'Accounts are not available right now. Try again in a minute.' };
  const name = cleanUser(username);
  if (limited('u:' + name) || limited('ip:' + ip)) return { error: 'Too many tries. Wait a few minutes, then try again.' };
  const row = validUser(name) ? await db.userByName(name) : null;
  if (!row || !(await checkPass(String(password || ''), row.pass))) { failed('u:' + name); failed('ip:' + ip); return { error: 'That username and password don\'t match.' }; }
  fails.delete('u:' + name);
  const u = cache.get(row.id) || row; if (!cache.has(row.id)) { u.stats = Object.assign({ hands: 0, wins: 0, biggest: 0, adasi: 0, streak: 0, best: 0, h21: 0 }, u.stats || {}); cache.set(u.id, u); }
  return { user: u, token: await newSession(u.id, dev) };
}
async function fromSession(token) { if (!ready || typeof token !== 'string' || token.length < 20 || token.length > 100) return null; const uid = await db.sessionUser(sha('sess:' + token)); return uid ? get(uid) : null; }
async function signout(token) { if (ready && typeof token === 'string') await db.dropSession(sha('sess:' + token)).catch(() => {}); }
async function changePassword(u, oldPw, newPw, token) {
  if (typeof newPw !== 'string' || newPw.length < 6) return { error: 'Use a new password of at least 6 characters.' };
  const row = await db.userById(u.id); if (!row || !(await checkPass(String(oldPw || ''), row.pass))) return { error: 'Your current password isn\'t right.' };
  await db.setPassword(u.id, await hashPass(newPw)); await db.dropSessionsOf(u.id, sha('sess:' + token)); return { ok: true };
}

// ----- profile -----
function pub(u) { const lv = level(u.xp); return { id: u.id, username: u.username, display: u.display, av: u.av, balance: u.balance, xp: u.xp, level: lv.n, title: lv.title, lvFrom: lv.from, lvTo: lv.to, stats: u.stats, since: u.created_at }; }
function today() { return new Date().toISOString().slice(0, 10); }
function bonusInfo(u) { const d = new Date(); const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); return { ready: u.bonus_day !== today(), next, wheel: WHEEL }; }
async function friendData(uid) {
  const rows = await db.friendsOf(uid); const ids = rows.map(r => r.other); const users = new Map((await db.usersByIds(ids)).map(x => [x.id, x]));
  const card = id => { const x = cache.get(id) || users.get(id); return x ? { id, username: x.username, name: x.display, av: x.av } : null; };
  const friends = [], incoming = [], outgoing = [];
  for (const r of rows) { const c = card(r.other); if (!c) continue; if (r.status === 'friends') friends.push(c); else if (r.asked_by === uid) outgoing.push(c); else incoming.push(c); }
  return { friends, incoming, outgoing };
}
async function payload(u, tz, inPlay) {
  const [daily, recent, fr] = await Promise.all([db.daily(u.id, 14, tz), db.recent(u.id, 10), friendData(u.id)]);
  return { type: 'account', user: pub(u), inPlay: inPlay || [], daily, recent, friends: fr.friends, incoming: fr.incoming, outgoing: fr.outgoing, bonus: bonusInfo(u) };
}
function setLook(u, display, av) { let ch = false; if (display && display !== u.display) { u.display = display; ch = true; } if (av !== undefined && JSON.stringify(av) !== JSON.stringify(u.av)) { u.av = av; ch = true; } if (ch) persist(u); return ch; }

// ----- the daily wheel -----
function spin(u) {
  if (!bonusInfo(u).ready) return null;
  let r = Math.random() * WEIGHTS.reduce((a, b) => a + b, 0), seg = 0;
  for (; seg < WEIGHTS.length - 1; seg++) { r -= WEIGHTS[seg]; if (r < 0) break; }
  const prize = WHEEL[seg]; u.bonus_day = today(); u.balance += prize; persist(u);
  db.addLedger(u.id, prize, 'wheel', { seg }).catch(() => {});
  return { seg, prize, balance: u.balance, bonus: bonusInfo(u) };
}
// the owner gives someone chips from the house (play money): straight onto their balance, written in the ledger
async function grant(uid, amt, by) {
  const u = await get(uid); if (!u) return null;
  u.balance += amt; persist(u);
  db.addLedger(u.id, amt, 'gift', { by }).catch(() => {});
  return u;
}

// the owner sets someone's chips to an exact amount (play money: "everyone back to 10,000"), written in the ledger
async function setBalance(uid, bal, by, meta) {
  const u = await get(uid); if (!u) return null;
  const delta = bal - u.balance; u.balance = bal; persist(u);
  if (delta) db.addLedger(u.id, delta, 'reset', Object.assign({ by }, meta || {})).catch(() => {});
  return u;
}

// ----- hands -----
// called by the table at the end of every hand for each account at it
function settle(uid, h) {
  const apply = u => {
    if (!u) return;
    u.balance = Math.max(0, u.balance + h.delta);
    if (h.played) {
      const s = u.stats; s.hands++; if (h.won) { s.wins++; s.streak++; s.best = Math.max(s.best, s.streak); } else s.streak = 0;
      if (h.delta > s.biggest) s.biggest = h.delta; if (h.adasi) s.adasi++; if (h.total === 21) s.h21++;
      u.xp += 10 + (h.won ? 25 : 0) + (h.adasi ? 100 : 0) + (h.total === 21 ? 15 : 0);
    }
    persist(u);
    if (h.played || h.delta) db.addHand({ uid, table: h.table, delta: h.delta, won: h.won, total: h.total, adasi: h.adasi }).catch(e => console.error('hand save:', e.message));
  };
  const u = cache.get(uid); if (u) { apply(u); return u; }
  get(uid).then(apply).catch(() => {}); return null;
}

// ----- friends -----
async function request(u, username, id) {
  let t = null;
  if (id) { t = await accountOf(id); if (!t) return { error: 'They play as a guest. Ask them to make a free account so you can be friends.' }; if (t.id === u.id) return { error: 'That\'s you.' }; }
  else {
    const name = cleanUser(username); if (!validUser(name)) return { error: 'Type their username, like @tolu' };
    if (name === u.username) return { error: 'That\'s you.' };
    t = await db.userByName(name); if (!t) return { error: `No player called @${name}.` };
  }
  const f = await db.getFriend(u.id, t.id);
  if (f && f.status === 'friends') return { error: `You and ${t.display} are already friends.` };
  if (f && f.status === 'pending' && f.asked_by === t.id) { await db.setFriend(u.id, t.id, 'friends', t.id); return { accepted: true, other: t }; }
  if (f && f.status === 'pending') return { error: `You already asked ${t.display}. Waiting for them.` };
  await db.setFriend(u.id, t.id, 'pending', u.id); return { sent: true, other: t };
}
async function answer(u, otherId, yes) {
  const f = await db.getFriend(u.id, otherId); if (!f || f.status !== 'pending' || f.asked_by !== otherId) return { error: 'That request is gone.' };
  if (yes) await db.setFriend(u.id, otherId, 'friends', otherId); else await db.dropFriend(u.id, otherId);
  return { ok: true, other: await get(otherId) };
}
async function cancel(u, otherId) { const f = await db.getFriend(u.id, otherId); if (f && f.status === 'pending' && f.asked_by === u.id) await db.dropFriend(u.id, otherId); return { ok: true }; }
async function unfriend(u, otherId) { await db.dropFriend(u.id, otherId); return { ok: true }; }
// a friend link someone shared is their yes: become friends straight away
async function link(u, otherId) { if (otherId === u.id) return { error: 'That is your own friend link.' }; let t = await get(otherId); if (!t) { const m = await db.deviceUsers([otherId]); if (m.has(otherId)) t = await get(m.get(otherId)); } if (t && t.id === u.id) return { error: 'That is your own friend link.' }; if (!t) return { error: 'That friend link is not for an account.' }; await db.setFriend(u.id, t.id, 'friends', t.id); return { ok: true, other: t }; }
async function friendIds(uid) { const rows = await db.friendsOf(uid); return rows.filter(r => r.status === 'friends').map(r => r.other); }
// friends someone made as a guest on this phone come along when they get an account
async function adoptDeviceFriends(u, devIds) {
  const ids = (devIds || []).filter(x => /^[0-9a-f]{16}$/.test(x)).slice(0, 300); if (!ids.length) return 0;
  const map = await db.deviceUsers(ids); let n = 0;
  for (const [, uid] of map) { if (uid === u.id) continue; const f = await db.getFriend(u.id, uid); if (!f || f.status !== 'friends') { await db.setFriend(u.id, uid, 'friends', u.id); n++; } }
  // ids that are accounts already (friend links between accounts)
  for (const id of ids) if (!map.has(id) && id !== u.id) { const t = cache.get(id) || await db.userById(id).catch(() => null); if (t) { const f = await db.getFriend(u.id, id); if (!f || f.status !== 'friends') { await db.setFriend(u.id, id, 'friends', u.id); n++; } } }
  return n;
}
async function accountOf(id) { try { const u = await get(id); if (u) return u; const m = await db.deviceUsers([id]); return m.has(id) ? await get(m.get(id)) : null; } catch { return null; } }

module.exports = { init, isReady, get, cached, friendData, signup, signin, fromSession, signout, changePassword, payload, pub, setLook, spin, grant, setBalance, bonusInfo, settle, request, answer, cancel, unfriend, link, friendIds, adoptDeviceFriends, accountOf, level, WHEEL, kvGet: (...a) => db.kvGet(...a), kvSet: (...a) => db.kvSet(...a),
  listUsers: n => db.listUsers(n), usersByIds: ids => db.usersByIds(ids).then(l => l.map(u => ({ id: u.id, username: u.username, display: u.display, av: u.av || null, stats: u.stats || {}, created_at: u.created_at }))) };

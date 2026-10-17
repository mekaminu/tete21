'use strict';
// Members only (Meka, 2026-10-17): only people the owner lets in can open Tete at all. Everyone else gets the
// sign-in page (pages/gate.html), which never carries the game: a new account asks the owner, who lets them in or
// not from the Members sheet in the app, and an invite link from the owner lets a friend straight in.
//
// Kept in the key-value store under 'members':
//   { v: 1, open: false, hosts: 'owner' | 'all',
//     people:  { <account id>: { s: 'yes' | 'wait' | 'no', asked, at, by, via } },
//     invites: { <key>: { at, exp, max, used: [account ids], by } } }
// The owner is named by username (OWNERS, default "meka"): always in, never on any list, can't be taken off.
// MEMBERS_ONLY=0 switches the whole thing off (for running locally); the owner's own switch (open) does it live.
// Opening tables (Meka, 2026-10-17): only the owner can, until the owner lets every member (hosts: 'all'); anyone let
// in can still join a table the owner opens, and the owner can hand a table over (Make host).
const crypto = require('crypto');

const FORCED_OFF = /^(0|off|no|false)$/i.test(String(process.env.MEMBERS_ONLY || '').trim());
const OWNERS = String(process.env.OWNERS || 'meka').split(',').map(s => s.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
const OWNER_NAME = process.env.OWNER_NAME || 'Meka';
const MAX_WAITING = 100;
const DAY = 86400000;
const INVITE_DAYS = 3;

let store = null;            // { get(k), set(k, v) }
let state = fresh();
let ready = false;
let saveT = null;
const handlers = [];

function fresh() { return { v: 1, open: false, hosts: 'owner', people: {}, invites: {} }; }
function emit(...a) { for (const h of handlers) { try { h(...a); } catch (e) { console.error('members event:', e.message); } } }
const onEvent = h => handlers.push(h);

async function init(kv) {
  store = kv;
  try {
    const s = await kv.get('members');
    if (s && typeof s === 'object') state = Object.assign(fresh(), s, { people: s.people || {}, invites: s.invites || {} });
  } catch (e) { console.error('members load:', e.message); }
  ready = true; tidy();
  console.log(FORCED_OFF ? 'members only: off (MEMBERS_ONLY=0)' : state.open ? 'members only: off (opened by the owner)' : `members only: on, owner ${OWNERS.map(o => '@' + o).join(', ')}`);
}
function save() { if (!store) return; clearTimeout(saveT); saveT = setTimeout(() => store.set('members', state).catch(e => console.error('members save:', e.message)), 250); }

// is the gate up? (until the saved list has loaded, everyone but the owner waits outside: it fails closed)
const on = () => !FORCED_OFF && !state.open;
const forcedOff = () => FORCED_OFF;
const isOwner = u => !!u && OWNERS.includes(String(u.username || '').toLowerCase());
function status(u) { if (!u) return 'none'; if (isOwner(u)) return 'owner'; const p = state.people[u.id]; return p ? p.s : 'new'; }
function allowed(u) { if (!on()) return true; if (!u) return false; return isOwner(u) || (ready && status(u) === 'yes'); }
const waitingCount = () => Object.values(state.people).filter(p => p.s === 'wait').length;

// someone signed in on the sign-in page who isn't in yet asks, once (true when it's a new request)
function ask(u, via) {
  if (!ready || !u || isOwner(u) || state.people[u.id]) return false;
  if (waitingCount() >= MAX_WAITING) return false;
  state.people[u.id] = { s: 'wait', asked: Date.now(), via: String(via || '').slice(0, 40) };
  save(); emit('ask', u); return true;
}
// the owner lets someone in ('yes') or not ('no': declined, or taken off)
function set(id, s, by) {
  if (!ready || !['yes', 'no'].includes(s) || typeof id !== 'string') return false;
  const p = state.people[id] || { asked: 0 };
  if (p.s === s) return false;
  state.people[id] = Object.assign(p, { s, at: Date.now(), by: String(by || '') });
  save(); emit('set', id, s); return true;
}

// ----- invite links: whoever opens one makes an account (or signs in) and is straight in -----
function tidy() { const now = Date.now(); let ch = false; for (const [k, i] of Object.entries(state.invites)) if (i.exp < now - DAY) { delete state.invites[k]; ch = true; } if (ch) save(); }
function newInvite(by, max) {
  tidy();
  const key = crypto.randomBytes(9).toString('base64url');
  state.invites[key] = { at: Date.now(), exp: Date.now() + INVITE_DAYS * DAY, max: Math.max(1, Math.min(10, Math.floor(+max) || 1)), used: [], by: String(by || '') };
  save(); emit('invites'); return key;
}
function cancelInvite(key) { if (!state.invites[key]) return false; delete state.invites[key]; save(); emit('invites'); return true; }
function liveInvite(key) { const i = typeof key === 'string' && Object.prototype.hasOwnProperty.call(state.invites, key) ? state.invites[key] : null; return i && i.exp > Date.now() && i.used.length < i.max ? i : null; }
function redeem(u, key) {
  if (!ready || !u || !on()) return false;
  if (isOwner(u)) return true;
  const p = state.people[u.id]; if (p && p.s === 'yes') return true;
  const i = liveInvite(key); if (!i) return false;
  i.used.push(u.id);
  state.people[u.id] = Object.assign(p || {}, { s: 'yes', at: Date.now(), by: 'invite', asked: (p && p.asked) || Date.now(), via: 'invite link' });
  save(); emit('set', u.id, 'yes'); emit('invites'); return true;
}
function invites() {
  tidy(); const now = Date.now();
  return Object.entries(state.invites).map(([key, i]) => ({ key, at: i.at, exp: i.exp, max: i.max, used: i.used.length, users: i.used.slice(), live: i.exp > now && i.used.length < i.max ? 1 : 0 }))
    .sort((a, b) => b.at - a.at);
}

// the owner's switch: open to everyone (anyone with the link can play) or members only
function setOpen(open) { open = !!open; if (state.open === open) return false; state.open = open; save(); emit('open', !open); return true; }
// who can open tables: the owner only, or every member too
const hostsAll = () => FORCED_OFF || state.hosts === 'all';
const canHost = u => hostsAll() || (!!u && isOwner(u));
function setHosts(all) { const h = all ? 'all' : 'owner'; if (!ready || state.hosts === h) return false; state.hosts = h; save(); emit('hosts', all); return true; }

const people = () => state.people;
module.exports = { init, onEvent, on, forcedOff, isOwner, status, allowed, ask, set, newInvite, cancelInvite, liveInvite, redeem, invites, setOpen, hostsAll, canHost, setHosts, people, waitingCount, OWNER_NAME, OWNERS };

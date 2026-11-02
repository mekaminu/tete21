'use strict';
// The watchdog: if the server stops answering because something keeps its one thread busy and never lets go (a loop
// that goes round without a pause), nobody can reach the game, the health check included, and the host can show
// the service as live for hours. This runs in a thread of its own, which keeps going while the main one is stuck.
// When the main thread hasn't checked in for LIMIT ms it reads where it is stuck (from the inspector), writes that to
// the log, and stops the process, so the host starts it again. Balances are saved after every hand and standing rooms
// are in the database, so a restart brings everything back.
const { Worker, isMainThread, workerData } = require('worker_threads');

if (isMainThread) {
  module.exports = function startWatchdog(opts = {}) {
    const limit = Math.max(2000, +opts.limit || 25000);
    const sab = new SharedArrayBuffer(8), beat = new Float64Array(sab);
    beat[0] = Date.now();
    setInterval(() => { beat[0] = Date.now(); }, 1000).unref();
    let w;
    try { w = new Worker(__filename, { workerData: { sab, limit, kill: opts.kill !== false } }); }
    catch (e) { console.error('watchdog not started:', e.message); return null; }
    w.unref(); w.on('error', e => console.error('watchdog:', e.message));
    return w;
  };
} else {
  const fs = require('fs');
  const { sab, limit, kill } = workerData, beat = new Float64Array(sab);
  // console.* in a thread like this one goes through the main thread, which is the one that's stuck: write directly
  const say = s => { try { fs.writeSync(2, s + '\n'); } catch {} };
  let fired = false;
  const where = () => new Promise(res => {
    let done = false; const finish = s => { if (!done) { done = true; res(s); } };
    setTimeout(() => finish('(the inspector did not answer)'), 4000);
    try {
      const inspector = require('inspector'), s = new inspector.Session();
      s.connectToMainThread();
      s.on('Debugger.paused', m => {
        const frames = (m.params.callFrames || []).slice(0, 14).map(f => `${f.functionName || '(anonymous)'} (${String(f.url || '').split('/').slice(-2).join('/')}:${f.location.lineNumber + 1})`);
        finish(frames.join(' < ') || '(no frames)');
      });
      s.post('Debugger.enable', () => s.post('Debugger.pause'));
    } catch (e) { finish('(inspector: ' + e.message + ')'); }
  });
  setInterval(async () => {
    const age = Date.now() - beat[0];
    if (fired || age < limit) return;
    fired = true;
    say(`WATCHDOG: the server has not answered for ${Math.round(age / 1000)}s. Finding where it is stuck...`);
    const at = await where();
    say(`WATCHDOG: stuck at ${at}`);
    if (!kill) return;
    say('WATCHDOG: stopping the process so it is started again');
    try { process.kill(process.pid, 'SIGKILL'); } catch (e) { say('WATCHDOG: could not stop the process: ' + e.message); }
  }, 1000);
}

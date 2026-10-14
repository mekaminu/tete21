const CACHE='tete21-v3';
const ASSETS=['/','/index.html','/engine.js','/sound.js','/intro.js','/app.js','/manifest.webmanifest','/icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
  if(u.origin===location.origin&&(u.pathname==='/'||ASSETS.includes(u.pathname))){
    e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put(u.pathname==='/'?'/index.html':e.request,cp));return r}).catch(()=>caches.match(u.pathname==='/'?'/index.html':e.request)));
  }else if(u.hostname.endsWith('gstatic.com')||u.hostname.endsWith('googleapis.com')){
    e.respondWith(caches.match(e.request).then(m=>m||fetch(e.request).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return r}).catch(()=>new Response('',{status:503}))));
  }});

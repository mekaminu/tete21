(()=>{
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const SUITS=['♠','♥','♦','♣'];
const val=c=>c.r==='A'?11:+c.r;
const isRed=c=>c.s==='♥'||c.s==='♦';
const PHASES=['Wager','Deal','Flush','Drop','Trick','Pick','Reveal'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>(+n||0).toLocaleString('en-GB');

let S=null, ME=-1, WS=null, CONNECTED=false, HOST=false;
let lastCount=0, lastME=null, lastSig='';
let cfg={fill:true,side:true,series:false,tie:'playoff',keep:false,pub:false,soloSeries:false};
let AFTER_NAME=null;
const AVS={mic:false,cam:false,spk:true};
const LOG=[];
// game sounds (sound.js); most stay quiet while the tab is in the background, "your turn" still rings
const SND=(n,o)=>{if(document.hidden&&!(o&&o.bg))return;try{window.TeteSound&&window.TeteSound.play(n,o)}catch{}};
const buzz=p=>{try{navigator.vibrate&&navigator.vibrate(p)}catch{}};

// ---------- helpers ----------
function cardInner(c){return`<div class="c">${c.r}<small>${c.s}</small></div><div class="big">${c.s}</div><div class="c2">${c.r}<small>${c.s}</small></div>`}
function cardHTML(c,cls=''){if(!c)return'';if(c.r===undefined)return`<div class="card back ${cls}" data-id="${c.id}"></div>`;return`<div class="card ${isRed(c)?'red':''} ${cls}" data-id="${c.id}">${cardInner(c)}</div>`}
const cname=c=>`${c.r}${c.s}`;
function total(p){return p.hand.reduce((a,c)=>a+(c.r===undefined?0:val(c)),0)}
function logLocal(t,cls=''){LOG.unshift({t,cls});$('#log').innerHTML=LOG.slice(0,80).map(l=>`<div class="${l.cls}">${l.t}</div>`).join('')}
function toast(t,ms=2200){const e=document.createElement('div');e.className='toast';e.textContent=t;document.body.appendChild(e);setTimeout(()=>e.remove(),ms)}
function openModal(id){const m=$(id);if(m)m.classList.add('on')}
function closeModal(id){const m=$(id);if(!m)return;m.classList.remove('on');if(id==='#m-me')AFTER_NAME=null}
// any [data-close] closes its pop-up; tapping outside a sheet, or Escape, closes the sheet
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-close]');const m=b?b.closest('.modal'):(e.target.classList&&e.target.classList.contains('modal')&&e.target.classList.contains('sheet')?e.target:null);if(m){m.classList.remove('on');if(m.id==='m-me')AFTER_NAME=null}});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const open=$$('.modal.sheet.on');const m=open[open.length-1];if(m){m.classList.remove('on');if(m.id==='m-me')AFTER_NAME=null}});
function info(title,body){$('#info-title').textContent=title;$('#info-body').innerHTML=body;openModal('#m-info')}
function dec(s){if(!s)return null;if(s[0]==='x')return{id:s};let taken=false;if(s.endsWith('t')){taken=true;s=s.slice(0,-1)}const k=+s.slice(-1),su=s.slice(-2,-1),r=s.slice(0,-2);return{r,s:su,k,id:r+su+k,taken}}
function sbDesc(type,mine,theirs){return type==='first'?'1st card flushed beats the 2nd':type==='cardvcard'?`board card #${mine+1} beats #${theirs+1}`:'final total beats the other\'s'}
function nudgeEl(el){if(!el)return;el.classList.remove('nudge');void el.offsetWidth;el.classList.add('nudge');setTimeout(()=>el.classList.remove('nudge'),700)}

// ---------- you: name, look, profile ----------
let AV={kind:'initial',color:'#b8862c'};
try{const s=localStorage.getItem('tete.av');if(s)AV=JSON.parse(s)}catch{}
try{const n=localStorage.getItem('tete.name');if(n)$('#f-name').value=n}catch{}
const AV_EMOJI=['🦁','🐘','🦅','🐆','🐊','🦒','🌍','🎩','👑','🃏','🔥','💎'];
const AV_COLORS=['#b8862c','#8e44ad','#c0392b','#2980b9','#d35400','#16a085','#2c3e50','#7f8c8d'];
function myName(){return(($('#f-name').value||'').trim().slice(0,14))}
function initial(){return((myName()||'?')[0]||'?').toUpperCase()}
function avStyle(av,initial){av=av||{kind:'initial',color:'#b8862c'};if(av.kind==='photo')return{style:`background-image:url(${av.data});background-color:#222`,text:''};if(av.kind==='emoji')return{style:`background:#2b1f25`,text:av.emoji};return{style:`background:${av.color||'#b8862c'}`,text:initial}}
function applyAv(el,av,ini){if(!el)return;const a=avStyle(av,ini);el.style.cssText+=';'+a.style;el.textContent=a.text}
function publicAv(){return AV.kind==='photo'?{kind:'initial',color:'#b8862c'}:AV}
function saveAv(){try{localStorage.setItem('tete.av',JSON.stringify(AV))}catch{}refreshAv();hello();sendMe()}
function renderMeChip(){const n=myName();$('#me-name').textContent=n||'Set your name';$('#me-sub').textContent=n?'Profile & sound':'So the table knows who you are';$('#me-chip').classList.toggle('unset',!n)}
function refreshAv(){const ini=initial();applyAv($('#av-lobby'),AV,ini);applyAv($('#av-prev'),AV,ini);renderMeChip();
  if(S&&ME>=0)renderSeats(true);
  $('#av-opts').innerHTML=AV_COLORS.map(c=>`<div class="avopt ${AV.kind==='initial'&&AV.color===c?'on':''}" data-color="${c}" style="background:${c}">${ini}</div>`).join('')+AV_EMOJI.map(e=>`<div class="avopt ${AV.kind==='emoji'&&AV.emoji===e?'on':''}" data-emoji="${e}" style="background:#2b1f25">${e}</div>`).join('');
  $$('#av-opts .avopt').forEach(o=>o.onclick=()=>{AV=o.dataset.color?{kind:'initial',color:o.dataset.color}:{kind:'emoji',emoji:o.dataset.emoji};saveAv();SND('pop')})}
function needName(then){if(myName())return true;AFTER_NAME=typeof then==='function'?then:null;openMe(true);return false}
function openMe(ask){
  $('#me-title').textContent=ask?'First, your name':'Your profile';
  $('#me-note').textContent=ask?'Pick a name and a look. Everyone at the table sees them.':'How the table sees you, plus sound settings.';
  $('#me-done').textContent=ask?'Continue':'Done';
  $('#m-me').classList.toggle('ask',!!ask);refreshAv();renderSoundSettings();openModal('#m-me');
  if(ask)setTimeout(()=>{try{$('#f-name').focus()}catch{}},380)}
function openAv(){openMe(false)}
$('#me-done').onclick=()=>{const f=AFTER_NAME;if(f&&!myName()){nudgeEl($('#f-name'));toast('Type your name first');return}AFTER_NAME=null;$('#m-me').classList.remove('on');if(f)setTimeout(f,150)};
$('#me-chip').onclick=()=>{openMe(false);SND('flick')};
$('#av-prev').onclick=()=>$('#av-file').click();
$('#av-clear').onclick=()=>{AV={kind:'initial',color:'#b8862c'};saveAv()};
$('#f-name').addEventListener('input',()=>{refreshAv();try{localStorage.setItem('tete.name',$('#f-name').value)}catch{}sendMe()});
$('#f-name').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#me-done').click()}});
$('#av-file').onchange=()=>{const f=$('#av-file').files[0];if(!f)return;const img=new Image();const fr=new FileReader();fr.onload=()=>{img.onload=()=>{const c=document.createElement('canvas');const s=160;c.width=c.height=s;const x=c.getContext('2d');const m=Math.min(img.width,img.height);x.drawImage(img,(img.width-m)/2,(img.height-m)/2,m,m,0,0,s,s);AV={kind:'photo',data:c.toDataURL('image/jpeg',.82)};saveAv();toast('Photo set')};img.src=fr.result};fr.readAsDataURL(f)};

// ---------- sound settings ----------
const SPK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const SPKX='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>';
function renderSound(){const T=window.TeteSound,m=!T||T.muted;$$('.sndbtn').forEach(b=>{const ico=b.querySelector('.ico')||b;ico.innerHTML=m?SPKX:SPK;b.classList.toggle('off',m);b.setAttribute('aria-label',m?'Game sounds are off':'Game sounds are on');b.title=m?'Game sounds: off':'Game sounds: on'})}
function renderSoundSettings(){const T=window.TeteSound,m=!T||T.muted;$('#snd-on').classList.toggle('on',!m);$('#snd-off').classList.toggle('on',m);$('#snd-vol').value=Math.round((T?T.volume:.7)*100);let io=true;try{io=localStorage.getItem('tete.intro')!=='off'}catch{}$('#intro-on').classList.toggle('on',io);$('#intro-off').classList.toggle('on',!io)}
function setMuted(m){const T=window.TeteSound;if(!T)return;T.setMuted(m);if(!m)T.unlock();renderSound();renderSoundSettings();if(!m)setTimeout(()=>SND('chips'),80)}
function toggleSound(){const T=window.TeteSound;if(!T)return;setMuted(!T.muted);toast(T.muted?'Game sounds off':'Game sounds on',1400)}
$('#btn-sound').onclick=toggleSound;$('#btn-fx').onclick=toggleSound;
$('#snd-on').onclick=()=>setMuted(false);$('#snd-off').onclick=()=>setMuted(true);
$('#snd-vol').oninput=()=>{if(window.TeteSound)TeteSound.setVolume(+$('#snd-vol').value/100)};
$('#snd-vol').onchange=()=>SND('chips');
$('#intro-on').onclick=()=>{try{localStorage.removeItem('tete.intro')}catch{}renderSoundSettings()};
$('#intro-off').onclick=()=>{try{localStorage.setItem('tete.intro','off')}catch{}renderSoundSettings()};
$('#intro-replay').onclick=()=>{if(S&&!$('#lobby').classList.contains('on')){toast('Leave the table first, then watch the intro');return}location.href='/?intro'};

// ---------- choosers: number chips and on/off pairs ----------
function otherOf(o){return o.parentElement.querySelector(`.other-in[data-for="${o.dataset.for}"]`)}
function setOpt(o,v){const inp=$('#'+o.dataset.for),other=otherOf(o);let hit=false;
  o.querySelectorAll('button').forEach(b=>{const on=b.dataset.v===String(v);if(on)hit=true;b.classList.toggle('on',on)});
  if(other){if(!hit&&v!==''&&v!=null){o.querySelector('[data-v="other"]').classList.add('on');other.hidden=false;other.value=v}else other.hidden=true}
  if(inp)inp.value=v}
$$('.opts').forEach(o=>{o.querySelectorAll('button').forEach(b=>{b.type='button';b.onclick=()=>{SND('flick');
    if(b.dataset.v==='other'){o.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));const other=otherOf(o);other.hidden=false;other.focus();if(+other.value>0)$('#'+o.dataset.for).value=Math.round(+other.value);return}
    setOpt(o,b.dataset.v);onOpt(o.dataset.for)}});
  const inp=$('#'+o.dataset.for);setOpt(o,inp?inp.value:'')});
$$('.other-in').forEach(i=>i.addEventListener('input',()=>{const v=Math.round(+i.value);if(v>0)$('#'+i.dataset.for).value=v}));
function onOpt(k){if(k==='f-seats')seatsHint();updateMoreSum()}
function seatsHint(){const n=+$('#f-seats').value;$('#seats-hint').textContent=n>6?'Two decks · 72 cards':'One deck · 36 cards'}
function updateMoreSum(){const t=+$('#f-timer').value;$('#more-sum').textContent=[t?t+'s timer':'relaxed timer',cfg.fill?'computer fills seats':'seats stay empty',cfg.side?'side bets on':'no side bets',cfg.series?'series on':'',cfg.tie==='split'?'ties split':'',cfg.keep?'stays open':''].filter(Boolean).join(' · ')}
function pair(onId,offId,key,onVal=true,offVal=false){$('#'+onId).onclick=()=>{cfg[key]=onVal;syncSegs();updateMoreSum();SND('flick')};$('#'+offId).onclick=()=>{cfg[key]=offVal;syncSegs();updateMoreSum();SND('flick')}}
pair('fill-on','fill-off','fill');pair('sb-on','sb-off','side');pair('sr-on','sr-off','series');pair('keep-on','keep-off','keep');pair('pub-on','pub-off','pub');pair('tie-split','tie-playoff','tie','split','playoff');pair('ssr-on','ssr-off','soloSeries');
function syncSegs(){$('#pub-hint').textContent=cfg.pub?'Anyone can sit down straight from the Open tables list.':'Friends need the code or your OK to sit down.';for(const [a,b,v] of [['fill-on','fill-off',cfg.fill],['sb-on','sb-off',cfg.side],['sr-on','sr-off',cfg.series],['keep-on','keep-off',cfg.keep],['pub-on','pub-off',cfg.pub],['tie-split','tie-playoff',cfg.tie==='split'],['ssr-on','ssr-off',cfg.soloSeries]]){$('#'+a).classList.toggle('on',!!v);$('#'+b).classList.toggle('on',!v)}}
// the host sheet remembers the last table you opened
function saveHostCfg(){try{localStorage.setItem('tete.hostcfg',JSON.stringify({table:$('#f-table').value,seats:$('#f-seats').value,buyIn:$('#f-buyin').value,wager:$('#f-wager').value,timer:$('#f-timer').value,cfg}))}catch{}}
function restoreHostCfg(){let h=null;try{h=JSON.parse(localStorage.getItem('tete.hostcfg')||'null')}catch{}
  if(h){if(h.table)$('#f-table').value=h.table;for(const [k,id] of [['seats','f-seats'],['buyIn','f-buyin'],['wager','f-wager'],['timer','f-timer']])if(h[k]!=null&&h[k]!==''){const o=$(`.opts[data-for="${id}"]`);if(o)setOpt(o,h[k])}if(h.cfg)Object.assign(cfg,h.cfg,{soloSeries:cfg.soloSeries})}
  syncSegs();seatsHint();updateMoreSum()}
restoreHostCfg();

// ---------- local engine (offline / practice) ----------
let LOCALT=null;
function startLocal(cfgT){setCurrent(null);
  const E=window.TeteEngine;if(!E){toast('Offline engine not loaded yet; reload once while online');return false}
  let lastFx=0;
  const t=new E.Table('tete-solo',cfgT,table=>{const fresh=table.fxq.filter(e=>e.n>lastFx);if(fresh.length)lastFx=fresh[fresh.length-1].n;onMessage({type:'state',st:table.snapshot(0),fx:fresh})});
  const r=t.addHuman({readyState:1,send(){}},myName(),publicAv(),false,false);t.hostId=r.id;LOCALT=t;HOST=true;
  onMessage({type:'joined',code:'PRACTICE',id:r.id});t.sync();setTimeout(()=>t.action(0,{type:'start'}),300);return true;
}
function stopLocal(){if(LOCALT){LOCALT.closed=true;LOCALT=null}}

// ---------- connection ----------
function connect(){
  if(WS&&WS.readyState<=1){try{WS.onclose=null;WS.close()}catch{}}
  const proto=location.protocol==='https:'?'wss':'ws';
  WS=new WebSocket(`${proto}://${location.host}`);
  WS.onopen=()=>{CONNECTED=true;identify();setStatus('ok','Connected.');renderRooms();$('#conn').style.display='';$('#conn').textContent='live';if(!LOCALT&&CURRENT&&SEATS[CURRENT]){const s=SEATS[CURRENT];WS.send(JSON.stringify({type:'resume',code:CURRENT,token:s.token,seal:s.seal}))}};
  WS.onclose=function(){if(WS!==this&&WS&&WS.readyState<=1)return;CONNECTED=false;PRES_READY=false;hideReqbar();if(navigator.onLine===false)setStatus('off','Offline. Practice against the computer still works; hosting and joining need a connection.');else setStatus('warn','Connection lost. Reconnecting… (the free server can take up to a minute to wake)');$('#conn').textContent='reconnecting…';setTimeout(connect,1500)};
  WS.onerror=()=>{};
  WS.onmessage=ev=>{let m;try{m=JSON.parse(ev.data)}catch{return}onMessage(m)};
}
function setStatus(kind,text){const l=$('#live');if(l){l.className='livest '+(kind==='ok'?'ok':kind==='off'?'off':'');$('#live-word').textContent=kind==='ok'?'Live':kind==='off'?'Offline':'Connecting'}const st=$('#live-status');if(st){st.hidden=kind==='ok';st.textContent=text}}
const send=m=>{if(WS&&WS.readyState===1)WS.send(JSON.stringify(m))};
const act=a=>{if(LOCALT)LOCALT.action(ME,a);else send({type:'act',a})};
function hello(){if(LOCALT)return;send({type:'hello',name:myName(),av:publicAv(),mic:AVS.mic,cam:AVS.cam})}
let SEATS={},CURRENT=null;
try{SEATS=JSON.parse(localStorage.getItem('tete.seats')||'{}')||{}}catch{SEATS={}}
try{CURRENT=localStorage.getItem('tete.current')}catch{}
for(const k of Object.keys(SEATS)){const s=SEATS[k];if(!s||!s.token||(!s.keep&&Date.now()-(s.t||0)>6*3600e3))delete SEATS[k]}
function saveSeats(){try{localStorage.setItem('tete.seats',JSON.stringify(SEATS))}catch{}}
function setCurrent(c){CURRENT=c;try{c?localStorage.setItem('tete.current',c):localStorage.removeItem('tete.current')}catch{}}
function closeSheets(){$$('.modal.on').forEach(m=>{if(m.id!=='m-invited')m.classList.remove('on')});AFTER_NAME=null}
function backToLobby(){rtcLeaveAll();S=null;ME=-1;SIDE_MANUAL=null;SIDE_HOLD=-1;$('.room').classList.remove('with-side');$('.me').classList.remove('myturn');IDS=[];REQS=[];$('#reqs').innerHTML='';clearMotion();setTimeout(()=>{renderRooms();renderFriends()},0);$('#game').classList.remove('on');$('#lobby').classList.add('on');$('#btn-join').disabled=false;$('#btn-start').disabled=false;$('#join-note').textContent='Enter the code the host sent you. Just the last four letters works too.';
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)$$('.tiles .tile').forEach((el,i)=>el.animate([{transform:'translateY(-40px) rotate(-8deg) scale(.9)',opacity:0},{transform:'translateY(0px) rotate(0deg) scale(1)',opacity:1}],{duration:520,delay:i*70,easing:'cubic-bezier(.2,1.25,.35,1)',fill:'backwards'}))}
function onMessage(m){
  if(m.type==='joined'){hideReqbar();PENDING_JOIN=null;ME=m.id;if(m.token&&m.code!=='PRACTICE'){SEATS[m.code]=Object.assign({},SEATS[m.code],{token:m.token,rid:m.rid,keep:!!m.keep,t:Date.now()});saveSeats();setCurrent(m.code)}if(!S||$('#lobby').classList.contains('on')){S={code:m.code,players:[],sideBets:[],board:[],participants:[]};enterGame()}if(m.resumed)toast('Back at your seat');return}
  if(m.type==='gone'){if(PENDING_JOIN&&m.code===PENDING_JOIN.code){const pj=PENDING_JOIN;PENDING_JOIN=null;if(SEATS[m.code]){delete SEATS[m.code];saveSeats()}send(pj.msg);return}if(m.code&&SEATS[m.code]){delete SEATS[m.code];saveSeats()}if(!m.code||CURRENT===m.code)setCurrent(null);if(!LOCALT){toast(m.msg,3500);if($('#game').classList.contains('on'))backToLobby()}renderRooms();return}
  if(m.type==='seal'){const s=SEATS[m.code];if(s){s.seal=m.seal;s.rid=m.rid;s.keep=true;if(S&&S.tableName)s.name=S.tableName;saveSeats()}return}
  if(m.type==='you'){MYID=m.id;try{localStorage.setItem('tete.myid',m.id)}catch{}handlePendingFriend();return}
  if(m.type==='rooms'){ROOMS=m.list||[];renderRooms();return}
  if(m.type==='presence'){onPresence(m.list||[]);return}
  if(m.type==='friend_added'){if(m.id&&!FRIENDS[m.id]&&m.id!==MYID){FRIENDS[m.id]={name:m.name||'Friend',av:m.av||null,added:Date.now(),seen:Date.now()};saveFriends();sendMe();toast(`${m.name||'Someone'} added you as a friend`,3000);SND('join');renderFriends()}return}
  if(m.type==='requested'){showReqbar(m.ret?`Asked ${esc(m.host||'the host')} to give you back your seat at <b>${esc(m.room)}</b>…`:`Asked to join <b>${esc(m.room)}</b>. Waiting for ${esc(m.host||'the host')}${m.hostHere?'':' (not at the table right now; your request will wait)'}…`);return}
  if(m.type==='request_cancelled'){hideReqbar();return}
  if(m.type==='declined'){hideReqbar();toast(m.msg,3500);return}
  if(m.type==='invited'){showInvited(m);return}
  if(m.type==='logs'){LOG.length=0;(m.items||[]).forEach(e=>logLocal(e.t,e.cls||''));return}
  if(m.type==='toast'){toast(m.msg,3000);return}
  if(m.type==='rtc_reset'){for(const [,c] of PC)c.pc.close();PC.clear();LEVELS.clear();lastSig='';return}
  if(m.type==='error'){hideReqbar();PENDING_JOIN=null;toast(m.msg,3500);$('#btn-join').disabled=false;$('#btn-start').disabled=false;$('#join-note').textContent=m.msg;return}
  if(m.type==='state'){if(m.ids)IDS=m.ids;applyState(m.st,m.fx||[]);REQS=m.rq||[];renderReqs();renderInviteBadge();return}
  if(m.type==='peer'){if(m.event==='joined')rtcOnPeerJoined(m.id);else rtcOnPeerLeft(m.id);return}
  if(m.type==='rtc'){rtcOnSignal(m.from,m.data);return}
}
function enterGame(){
  closeSheets();clearMotion();
  $('#lobby').classList.remove('on');$('#game').classList.add('on');lastCount=0;lastSig='';LOG.length=0;$('#log').innerHTML='';
  $('#wait').hidden=false;$('#wait-code').textContent=S.code||'…';avUI();
}
// ---------- the three choices ----------
function openHost(){if(!needName(openHost))return;restoreHostCfg();openModal('#m-host');SND('flick')}
function openJoin(){if(!needName(openJoin))return;renderRooms();openModal('#m-join');SND('flick');setTimeout(()=>{const f=$('#f-join');if(f&&!f.value&&matchMedia('(hover:hover)').matches)f.focus()},380)}
function openSolo(){if(!needName(openSolo))return;openModal('#m-solo');SND('flick')}
function openFriends(){renderFriends();openModal('#m-friends');SND('flick')}
$('#tile-host').onclick=openHost;$('#tile-join').onclick=openJoin;$('#tile-solo').onclick=openSolo;
$('#rooms-all').onclick=openJoin;$('#friends-all').onclick=openFriends;
$('#btn-start').onclick=()=>{if(!needName(openHost))return;if(!CONNECTED){toast(navigator.onLine?'Not connected to the server yet. One moment…':'You are offline. You can still practise against the computer.',3000);return}
  const cfgT={seats:+$('#f-seats').value,buyIn:Math.round(+$('#f-buyin').value),wager:Math.round(+$('#f-wager').value),tableName:$('#f-table').value.trim()||(myName()+"'s table"),timer:+$('#f-timer').value,fill:cfg.fill,side:cfg.side,series:cfg.series,tie:cfg.tie,keep:cfg.keep,pub:cfg.pub};
  if(!(cfgT.buyIn>=50)){toast('The buy-in has to be at least 50 chips');return}
  if(!(cfgT.wager>=5)||cfgT.wager>cfgT.buyIn){toast('The wager has to be at least 5 and no more than the buy-in');return}
  saveHostCfg();HOST=true;$('#btn-start').disabled=true;setTimeout(()=>{$('#btn-start').disabled=false},4000);
  send({type:'host',cfg:cfgT,name:myName(),av:publicAv(),mic:AVS.mic,cam:AVS.cam})};
$('#btn-solo').onclick=()=>{if(!needName(openSolo))return;const n=Math.min(7,Math.max(1,+$('#f-solo-n').value||3));
  const cfgT={seats:n+1,buyIn:1000,wager:50,tableName:'Practice table',timer:+$('#f-solo-t').value,fill:true,side:true,series:cfg.soloSeries,tie:'playoff'};
  closeModal('#m-solo');startLocal(cfgT)};
function joinCode(){const raw=($('#f-join').value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');const k=raw.length===8&&raw.startsWith('TETE')?raw.slice(4):raw;return /^[A-Z0-9]{4}$/.test(k)?'tete-'+k.toLowerCase():null}
$('#btn-join').onclick=()=>{if(!needName(openJoin))return;
  const code=joinCode();if(!code){toast('Enter a code like TETE-AB12');nudgeEl($('#f-join'));return}
  if(!CONNECTED){toast(navigator.onLine?'Not connected to the server yet':'You are offline. Playing with friends needs a connection.',3000);return}
  HOST=false;$('#btn-join').disabled=true;$('#join-note').textContent='Joining…';const msg={type:'join',code,name:myName(),av:publicAv(),mic:AVS.mic,cam:AVS.cam};const CODE=code.toUpperCase();if(SEATS[CODE]){PENDING_JOIN={code:CODE,msg};setCurrent(CODE);send({type:'resume',code:CODE,token:SEATS[CODE].token,seal:SEATS[CODE].seal})}else send(msg)};
$('#f-join').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#btn-join').click()}});
$('#btn-leave').onclick=()=>{const code=S&&S.code;if(LOCALT)stopLocal();else send({type:'leave'});if(code&&SEATS[code]&&!SEATS[code].keep){delete SEATS[code];saveSeats()}setCurrent(null);backToLobby()};
$('#btn-rules').onclick=()=>openModal('#m-rules');
$('#btn-rules2').onclick=()=>openModal('#m-rules');
// a table link (?t=TETE-XXXX) opens the join sheet with the code filled in
let JOIN_LINK=false;
try{const u=new URL(location.href);const t=u.searchParams.get('t');if(t){$('#f-join').value=t.toUpperCase();JOIN_LINK=true}if(u.searchParams.has('intro')){u.searchParams.delete('intro');history.replaceState(null,'',u.pathname+(u.search||''))}}catch{}

// ---------- side panel: opens by itself when you're in a side bet; hide it any time ----------
let SIDE_MANUAL=null,SIDE_HOLD=-1,SIDE_HAND=-1;const SIDE_SEEN=new Set();
function myBets(){return S&&ME>=0?S.sideBets.filter(b=>b.a===ME||b.b===ME):[]}
function updateSide(){
  if(!S){$('.room').classList.remove('with-side');return}
  const mine=myBets(),active=mine.filter(b=>b.status==='open'||b.status==='pending');
  if(S.handNo!==SIDE_HAND){SIDE_HAND=S.handNo;SIDE_HOLD=-1;if(SIDE_MANUAL===false)SIDE_MANUAL=null}
  if(mine.some(b=>(b.status==='won'||b.status==='push')&&!SIDE_SEEN.has('r'+b.id))){mine.forEach(b=>{if(b.status==='won'||b.status==='push')SIDE_SEEN.add('r'+b.id)});SIDE_HOLD=S.handNo}
  if(active.some(b=>!SIDE_SEEN.has(b.id))&&SIDE_MANUAL===false)SIDE_MANUAL=null;
  const auto=active.length>0||SIDE_HOLD===S.handNo;
  const open=SIDE_MANUAL!==null?SIDE_MANUAL:auto;
  $('.room').classList.toggle('with-side',open);
  const bd=$('#side-badge');bd.hidden=!active.length;bd.textContent=active.length;
}
function closeSide(){SIDE_MANUAL=false;myBets().forEach(b=>SIDE_SEEN.add(b.id));updateSide()}
$('#btn-side').onclick=()=>{const open=$('.room').classList.contains('with-side');if(open)closeSide();else{SIDE_MANUAL=true;updateSide()}};
$('#side-close').onclick=closeSide;
$('#side-backdrop').onclick=closeSide;
$('#side-rules').onclick=()=>openModal('#m-rules');
if(window.ResizeObserver)new ResizeObserver(()=>{if(S)sizeBoard()}).observe($('#table'));

// ---------- identity, friends, rooms list, invites ----------
let SECRET=null,MYID=null,FRIENDS={},ROOMS=[],REQS=[],IDS=[],PENDING_FRIEND=null,FEDIT=false,PRES_READY=false,PENDING_JOIN=null;
const PRES={};
try{SECRET=localStorage.getItem('tete.secret');MYID=localStorage.getItem('tete.myid')}catch{}
if(!SECRET||!/^[0-9a-f]{64}$/.test(SECRET)){const a=new Uint8Array(32);crypto.getRandomValues(a);SECRET=[...a].map(b=>b.toString(16).padStart(2,'0')).join('');try{localStorage.setItem('tete.secret',SECRET)}catch{}}
try{FRIENDS=JSON.parse(localStorage.getItem('tete.friends')||'{}')||{}}catch{FRIENDS={}}
function saveFriends(){try{localStorage.setItem('tete.friends',JSON.stringify(FRIENDS))}catch{}}
function identify(){send({type:'id',secret:SECRET,name:myName(),av:publicAv(),friends:Object.keys(FRIENDS)})}
let meT=null;function sendMe(){clearTimeout(meT);meT=setTimeout(()=>send({type:'me',name:myName(),av:publicAv(),friends:Object.keys(FRIENDS)}),400)}
const ICON={lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',open:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/></svg>'};
function avHTML(av,name,cls='fav'){const a=avStyle(av,(name||'?')[0].toUpperCase());return`<div class="${cls}" style="${a.style}">${esc(a.text)}`}
function ago(t){if(!t)return'';const m=Math.round((Date.now()-t)/60000);if(m<2)return'just now';if(m<60)return m+' min ago';const hh=Math.round(m/60);if(hh<24)return hh+'h ago';return Math.round(hh/24)+'d ago'}
function copyText(text,okMsg){const done=()=>toast(okMsg||'Copied');try{navigator.clipboard.writeText(text).then(done,()=>toast(text,5000))}catch{toast(text,5000)}}
function shareOrCopy(data,okMsg){if(navigator.share){navigator.share(data).catch(e=>{if(e&&e.name!=='AbortError')copyText(data.url,okMsg)})}else copyText(data.url,okMsg)}
function friendLink(){return`${location.origin}/?f=${MYID}&n=${encodeURIComponent(myName()||'A friend')}`}
function shareFriendLink(){if(!MYID){toast('Connecting… try again in a moment');return}if(!needName(shareFriendLink))return;shareOrCopy({title:'Tete 21',text:`Add me as a friend on Tete 21 so we can play together.`,url:friendLink()},'Friend link copied. Paste it to a friend')}
function tableLink(){return`${location.origin}/?t=${S.code}`}
function friendsAt(rid){return Object.keys(FRIENDS).filter(id=>PRES[id]&&PRES[id].on&&PRES[id].room&&PRES[id].room.rid===rid).map(id=>FRIENDS[id].name||'A friend')}
function myCodeForRid(rid){for(const [code,s] of Object.entries(SEATS))if(s.rid===rid)return code;return null}
function returnTo(code){const s=SEATS[code];if(!s)return;if(!CONNECTED){toast('Not connected yet',2500);return}setCurrent(code);send({type:'resume',code,token:s.token,seal:s.seal})}
function askRoom(rid){if(!needName(()=>askRoom(rid)))return;if(!CONNECTED){toast('Not connected yet',2500);return}HOST=false;send({type:'request',rid,name:myName(),av:publicAv(),mic:AVS.mic,cam:AVS.cam})}
function nameList(a){return a.length<=1?a.join(''):a.slice(0,-1).join(', ')+' and '+a[a.length-1]}

function roomRows(){
  const rows=[];const listed=new Set(ROOMS.map(r=>r.rid));
  // standing rooms I have a seat in but the server is not showing (it was asleep): Return restores them
  for(const [code,s] of Object.entries(SEATS)){if(!s.keep||!s.rid||listed.has(s.rid))continue;rows.push({rid:s.rid,name:s.name||'Your room',asleep:1,keep:1,mine:code,host:'',seated:0,here:0,seats:0,wager:0,started:0,hand:0,pub:0})}
  for(const r of ROOMS){const code=myCodeForRid(r.rid);rows.push(Object.assign({},r,{mine:code}))}
  const score=r=>(r.mine?100:0)+friendsAt(r.rid).length*10+(r.pub?3:0)+Math.min(r.here,5);
  return rows.sort((a,b)=>score(b)-score(a));
}
function roomHTML(r,i){
  const fr=friendsAt(r.rid);const full=!r.mine&&r.seats&&r.seated>=r.seats;
  const status=r.asleep?'Asleep. Return to wake it':`${r.host?esc(r.host)+"'s room · ":''}${r.seated} of ${r.seats} seated${r.here?` · ${r.here} here`:''} · ${fmt(r.wager)} a hand · ${r.started?'Hand '+r.hand:'Waiting to start'}`;
  const btn=r.mine?`<button class="btn btn-gold" data-ret="${esc(r.mine)}">Return</button>`:full?`<button class="btn btn-dark" disabled>Full</button>`:r.pub?`<button class="btn btn-gold" data-ask="${esc(r.rid)}">Join</button>`:`<button class="btn btn-ghost" data-ask="${esc(r.rid)}">Ask to join</button>`;
  return`<div class="rrow ${r.mine?'mine':''} ${r.asleep?'asleep':''}" style="animation-delay:${i*.04}s"><div class="rico">${r.mine?ICON.home:r.pub?ICON.open:ICON.lock}${r.here?'<span class="live"></span>':''}</div><div style="min-width:0"><div class="rname"><span class="t">${esc(r.name)}</span>${r.mine?'<span class="tag you">Your seat</span>':''}${r.keep?'<span class="tag">Always open</span>':''}${r.pub?'<span class="tag pub">Public</span>':''}</div><div class="rmeta">${status}</div>${fr.length?`<div class="rfr">${esc(nameList(fr))} ${fr.length>1?'are':'is'} here</div>`:''}${r.pub&&r.members&&r.members.length&&!fr.length?`<div class="rmeta">${esc(r.members.join(', '))}</div>`:''}</div>${btn}</div>`}
function retHTML(r){return`<div class="retcard"><div class="rico">${ICON.home}${r.here?'<span class="live"></span>':''}</div><div style="min-width:0"><div class="rname"><span class="t">${esc(r.name)}</span><span class="tag you">Your seat</span></div><div class="rmeta">${r.asleep?'Asleep. Return wakes it up with everyone\'s chips':`${r.here?r.here+' at the table · ':''}${r.started?'Hand '+r.hand:'Waiting to start'}`}</div></div><button class="btn btn-gold" data-ret="${esc(r.mine)}">Return</button></div>`}
function wireRooms(box){box.querySelectorAll('[data-ret]').forEach(b=>b.onclick=()=>returnTo(b.dataset.ret));box.querySelectorAll('[data-ask]').forEach(b=>b.onclick=()=>askRoom(b.dataset.ask))}
function renderRooms(){
  const box=$('#rooms');if(!box)return;
  const rows=roomRows(),mine=rows.filter(r=>r.mine),others=rows.filter(r=>!r.mine);
  // lobby: your own tables as big Return cards, then up to three open tables
  const ret=$('#returns');const rs=mine.map(retHTML).join('');if(ret.dataset.sig!==rs){ret.innerHTML=rs;ret.dataset.sig=rs;wireRooms(ret)}
  $('#strip-rooms').hidden=!others.length;$('#rooms-all').hidden=others.length<=3;
  $('#rooms-mini').innerHTML=others.slice(0,3).map(roomHTML).join('');wireRooms($('#rooms-mini'));
  const n=ROOMS.filter(r=>!myCodeForRid(r.rid)).length;
  $('#rooms-count').textContent=n?`${n} open`:'';$('#rooms-count2').textContent=n?`${n} open`:'';
  const bd=$('#rooms-badge');bd.hidden=!n;bd.textContent=n;
  $('#join-sub').textContent=n?`${n} open table${n>1?'s':''}, or enter a code`:'Enter the code a friend sent you';
  // the join sheet: everything
  if(!CONNECTED&&!ROOMS.length&&!rows.length){box.innerHTML=`<p class="empty">${navigator.onLine===false?'Open tables show here when you are online.':'Connecting to the room list…'}</p>`;return}
  box.innerHTML=rows.length?rows.map(roomHTML).join(''):'<p class="empty">No open tables right now. Host one, or practise against the computer.</p>';
  wireRooms(box);
}
function friendState(id){const p=PRES[id]||{};const f=FRIENDS[id];if(p.on&&p.room)return{k:'play',t:`At ${p.room.name}`,o:2};if(p.on)return{k:'on',t:'Online',o:3};return{k:'',t:f&&f.seen?`Last seen ${ago(f.seen)}`:'Offline',o:0}}
function friendIds(){return Object.keys(FRIENDS).sort((a,b)=>friendState(b).o-friendState(a).o||(FRIENDS[a].name||'').localeCompare(FRIENDS[b].name||''))}
function friendRows(ctx){
  return friendIds().map((id,i)=>{const f=FRIENDS[id],s=friendState(id),p=PRES[id]||{};let btn='';
    if(ctx==='invite'){const here=S&&IDS.includes(id);btn=here?'<span class="fstat on">At this table</span>':p.on?`<button class="btn btn-gold" data-inv="${id}">Invite</button>`:'<span class="fstat">Offline</span>'}
    else if(FEDIT)btn=`<button class="btn btn-dark" data-rm="${id}">Remove</button>`;
    else if(p.on&&p.room){const mine=myCodeForRid(p.room.rid);btn=mine?`<button class="btn btn-gold" data-ret="${esc(mine)}">Return</button>`:`<button class="btn ${p.room.pub?'btn-gold':'btn-ghost'}" data-ask="${esc(p.room.rid)}">${p.room.pub?'Join':'Ask to join'}</button>`}
    return`<div class="frow" style="animation-delay:${i*.04}s">${avHTML(f.av,f.name)}<span class="dot ${s.k}"></span></div><div style="min-width:0"><div class="fname">${esc(f.name||'Friend')}</div><div class="fstat ${s.k}">${esc(s.t)}</div></div>${btn}</div>`}).join('');
}
function renderFriends(){
  const ids=friendIds(),n=ids.length,on=ids.filter(id=>PRES[id]&&PRES[id].on).length;
  const cnt=n?(on?`${on} online`:`${n}`):'';$('#friends-count').textContent=cnt;$('#friends-count2').textContent=cnt;
  // lobby strip: an Add button, then faces with online dots
  $('#fstrip').innerHTML=`<button class="fchip add" id="fs-add" type="button"><span class="fav">+</span><span class="fn">Add</span></button>`+ids.slice(0,14).map((id,i)=>{const f=FRIENDS[id],s=friendState(id);return`<button class="fchip" data-fid="${id}" type="button" style="animation-delay:${i*.04}s">${avHTML(f.av,f.name)}<span class="dot ${s.k}"></span></div><span class="fn">${esc(f.name||'Friend')}</span></button>`}).join('')+(n?'':'<p class="empty fs-empty">Share your friend link. One tap from them and you\'ll see when they\'re online.</p>');
  $('#fs-add').onclick=shareFriendLink;$$('#fstrip [data-fid]').forEach(b=>b.onclick=()=>openFriend(b.dataset.fid));
  $('#friends-all').hidden=!n;
  // the friends sheet
  $('#friends-edit').hidden=!n;$('#friends-edit').textContent=FEDIT?'Done':'Edit';
  const box=$('#friends');box.innerHTML=n?friendRows('lobby'):'<p class="empty">Add friends to see when they are online and invite them to your table. Share your friend link: they tap it once and you are friends.</p>';
  $$('#friends [data-ask]').forEach(b=>b.onclick=()=>{closeModal('#m-friends');askRoom(b.dataset.ask)});
  $$('#friends [data-ret]').forEach(b=>b.onclick=()=>{closeModal('#m-friends');returnTo(b.dataset.ret)});
  $$('#friends [data-rm]').forEach(b=>b.onclick=()=>removeFriend(b.dataset.rm));
  renderInviteBadge();
}
function removeFriend(id){const nm=FRIENDS[id]&&FRIENDS[id].name;delete FRIENDS[id];saveFriends();send({type:'friend_remove',id});toast(`Removed ${nm||'friend'}`);renderFriends()}
function openFriend(id){const f=FRIENDS[id];if(!f)return;const p=PRES[id]||{};const a=avStyle(f.av,(f.name||'?')[0].toUpperCase());const el=$('#pl-av');el.style.cssText=a.style;el.textContent=a.text;
  $('#pl-name').textContent=f.name||'Friend';
  $('#pl-body').innerHTML=p.on?(p.room?`At <b>${esc(p.room.name)}</b> right now`:'Online now'):esc(f.seen?`Last seen ${ago(f.seen)}`:'Offline');
  let h='';if(p.on&&p.room){const mine=myCodeForRid(p.room.rid);h=mine?`<button class="btn btn-gold" data-ret="${esc(mine)}">Return to your seat</button>`:`<button class="btn btn-gold" data-ask="${esc(p.room.rid)}">${p.room.pub?'Join them':'Ask to join them'}</button>`}
  h+=`<button class="btn btn-dark" id="pl-rm">Remove</button><button class="btn btn-ghost" data-close>Close</button>`;
  $('#pl-actions').innerHTML=h;
  $$('#pl-actions [data-ret]').forEach(b=>b.onclick=()=>{closeModal('#m-player');returnTo(b.dataset.ret)});
  $$('#pl-actions [data-ask]').forEach(b=>b.onclick=()=>{closeModal('#m-player');askRoom(b.dataset.ask)});
  $('#pl-rm').onclick=()=>{const b=$('#pl-rm');if(!b.dataset.arm){b.dataset.arm='1';b.textContent='Tap again to remove';return}closeModal('#m-player');removeFriend(id)};
  openModal('#m-player');SND('flick')}
function renderInviteBadge(){const b=$('#invite-badge');if(!b)return;const n=Object.keys(FRIENDS).filter(id=>PRES[id]&&PRES[id].on&&!IDS.includes(id)).length;b.hidden=!n||!!LOCALT;b.textContent=n}
function openInvite(){if(!S||LOCALT)return;$('#inv-room').textContent=S.tableName||'your table';$('#inv-code').textContent=S.code;renderInvite();openModal('#m-invite')}
function renderInvite(){const box=$('#inv-friends');const n=Object.keys(FRIENDS).length;
  box.innerHTML=n?friendRows('invite'):'<p class="empty">No friends yet. Share your friend link below, or use Share invite to send the table to anyone.</p>';
  $$('#inv-friends [data-inv]').forEach(b=>b.onclick=()=>{send({type:'invite',to:b.dataset.inv});b.textContent='Invited';b.classList.add('sent');b.disabled=true;SND('pop')})}
$('#btn-invite').onclick=openInvite;
$('#inv-code').onclick=()=>copyText(S.code,'Code copied');
$('#inv-copy').onclick=()=>copyText(tableLink(),'Link copied. Paste it into WhatsApp or a message');
$('#inv-share').onclick=()=>shareOrCopy({title:'Tete 21',text:`Join me for Tete 21 at ${S.tableName}. Tap the link, or enter code ${S.code}.`,url:tableLink()},'Link copied. Paste it into WhatsApp or a message');
$('#inv-friendlink').onclick=shareFriendLink;$('#btn-friendlink').onclick=shareFriendLink;$('#me-friendlink').onclick=shareFriendLink;
$('#friends-edit').onclick=()=>{FEDIT=!FEDIT;renderFriends()};
$('#reqbar-cancel').onclick=()=>{send({type:'request_cancel'});hideReqbar()};
function showReqbar(t){$('#reqbar-text').innerHTML=t;$('#reqbar').hidden=false}
function hideReqbar(){$('#reqbar').hidden=true}
function renderReqs(){const box=$('#reqs');if(!box)return;if(!HOST||LOCALT){box.innerHTML='';return}
  const known=new Set($$('#reqs .reqcard').map(e=>e.dataset.id));let fresh=false;
  box.innerHTML=REQS.map(r=>{if(!known.has(r.id))fresh=true;return`<div class="reqcard" data-id="${esc(r.id)}" style="${known.has(r.id)?'animation:none':''}">${avHTML(r.av,r.name)}</div><div class="rt"><b>${esc(r.name)}</b> ${r.ret?`wants their seat back<br><small>${fmt(r.chips)} chips waiting</small>`:'wants to join<br><small>'+(S&&S.started?'Sits in from the next hand':'Joins the waiting room')+'</small>'}</div><button class="btn btn-gold" data-yes="${esc(r.id)}">Let in</button><button class="btn btn-ghost" data-no="${esc(r.id)}">Not now</button></div>`}).join('');
  $$('#reqs [data-yes]').forEach(b=>b.onclick=()=>{send({type:'admit',id:b.dataset.yes,yes:true});b.closest('.reqcard').remove()});
  $$('#reqs [data-no]').forEach(b=>b.onclick=()=>{send({type:'admit',id:b.dataset.no,yes:false});b.closest('.reqcard').remove()});
  if(fresh){buzz([60,40,60]);SND('pop',{bg:true})}
}
let INVITE=null;
function showInvited(m){INVITE=m;const f=m.from||{};const a=avStyle(f.av,(f.name||'?')[0].toUpperCase());const el=$('#invd-av');el.style.cssText=a.style;el.textContent=a.text;
  $('#invd-title').textContent=`${f.name||'A friend'} invites you`;
  $('#invd-body').innerHTML=`to <b>${esc(m.room.name)}</b>${m.room.host?` · ${esc(m.room.host)}'s room`:''}<br>${m.room.seated} of ${m.room.seats} seated · ${fmt(m.room.wager)} a hand${S&&!LOCALT?'<br><small>You will leave your current table.</small>':''}`;
  openModal('#m-invited');buzz([80,50,80]);SND('join',{bg:true})}
$('#invd-yes').onclick=()=>{closeModal('#m-invited');if(!INVITE)return;const go=()=>{if(LOCALT){stopLocal();backToLobby()}send({type:'accept_invite',token:INVITE.token,name:myName(),av:publicAv(),mic:AVS.mic,cam:AVS.cam});INVITE=null};if(!needName(go))return;go()};
$('#invd-no').onclick=()=>{closeModal('#m-invited');INVITE=null};
function askAddFriend(id,name){const a=avStyle(null,(name||'?')[0].toUpperCase());const el=$('#af-av');el.style.cssText=a.style;el.textContent=a.text;$('#af-title').textContent=`Add ${name||'this player'} as a friend?`;
  $('#af-yes').onclick=()=>{closeModal('#m-addfriend');addFriend(id,name,null)};$('#af-no').onclick=()=>closeModal('#m-addfriend');openModal('#m-addfriend')}
function addFriend(id,name,av){if(!id||id===MYID)return;FRIENDS[id]=Object.assign({},FRIENDS[id],{name:name||(FRIENDS[id]&&FRIENDS[id].name)||'Friend',av:av||(FRIENDS[id]&&FRIENDS[id].av)||null,added:Date.now()});saveFriends();send({type:'friend_add',id});sendMe();toast(`${name||'Friend'} added`);SND('join');renderFriends();if(S)renderSeats()}
function openPlayer(pid){const p=S&&S.players[pid];if(!p||p.isBot||pid===ME)return;const id=IDS[pid];const a=avStyle(p.av,p.name[0].toUpperCase());const el=$('#pl-av');el.style.cssText=a.style;el.textContent=a.text;
  $('#pl-name').textContent=p.name;$('#pl-body').textContent=`${fmt(p.chips)} chips${p.away?' · away':''}`;
  const isF=id&&FRIENDS[id];$('#pl-actions').innerHTML=(!id?'<span class="note">Not on this table right now</span>':isF?'<span class="tag you">Friends</span>':'<button class="btn btn-gold" id="pl-add">Add as a friend</button>')+'<button class="btn btn-ghost" data-close>Close</button>';
  const add=$('#pl-add');if(add)add.onclick=()=>{closeModal('#m-player');addFriend(id,p.name,p.av)};
  openModal('#m-player')}
function onPresence(list){const first=!PRES_READY;PRES_READY=true;const lobby=$('#lobby').classList.contains('on');
  for(const p of list){const was=PRES[p.id];PRES[p.id]={on:!!p.on,room:p.room||null};const f=FRIENDS[p.id];if(!f)continue;
    if(p.on){f.seen=Date.now();if(p.name)f.name=p.name;if(p.av!==undefined)f.av=p.av;if(!first&&lobby&&(!was||!was.on)){toast(`${f.name||'A friend'} is online`,2200);SND('pop')}}
    else if(was&&was.on){f.seen=Date.now()}}
  saveFriends();renderFriends();renderRooms();if($('#m-invite').classList.contains('on'))renderInvite()}
// friend link (?f=id&n=name)
try{const u=new URL(location.href);const f=u.searchParams.get('f');if(f&&/^[0-9a-f]{16}$/.test(f))PENDING_FRIEND={id:f,name:(u.searchParams.get('n')||'').slice(0,20)};
  if(f){u.searchParams.delete('f');u.searchParams.delete('n');history.replaceState(null,'',u.pathname+(u.search?u.search:''))}}catch{}
function handlePendingFriend(){if(!PENDING_FRIEND||!MYID)return;const pf=PENDING_FRIEND;PENDING_FRIEND=null;if(pf.id===MYID){toast('That is your own friend link. Send it to a friend');return}if(FRIENDS[pf.id]){toast(`You and ${FRIENDS[pf.id].name||'they'} are already friends`);return}askAddFriend(pf.id,pf.name)}
setInterval(()=>{if($('#lobby').classList.contains('on'))renderFriends()},60000);

// ---------- state ----------
function applyState(o,fx){
  const prev=S;const before=prev&&prev.players&&prev.players.length?snapCards():new Map();
  S={tableName:o.tn,wager:o.w,buyIn:o.bi,decks:o.dk,timer:o.tm,side:!!o.sd,handNo:o.hn,pot:o.pot,phase:o.ph,turn:o.turn,deadline:o.dl?o.dl+(Date.now()-o.now):0,dealer:o.dlr,trickWinner:o.tw,leadSuit:o.ls,boardSize:o.bs,boardTop:o.bt,board:o.bd.map(dec),participants:o.pa||[],tiebreak:!!o.tb,started:!!o.st,busy:!!o.bz,code:o.cd,keep:!!o.kp,msgHost:o.mh||'',hostId:o.host,next:o.nx,series:!!o.sr,adasiTurn:o.ad,
    players:o.pl.map(a=>({id:a[0],name:a[1],isBot:!!a[2],chips:a[3],hand:a[4].map(dec),dropped:dec(a[5]),sitout:!!a[6],strikes:a[7],av:a[8]?(a[8][0]==='e'?{kind:'emoji',emoji:a[8][1]}:{kind:'initial',color:a[8][1]}):null,revealed:!!a[9],gone:!!a[10],mic:!!a[11],cam:!!a[12],satOutByTimer:!!a[13],away:!!a[14],color:a[15]||'#555'})),
    sideBets:o.sbs.map(a=>({id:a[0],a:a[1],b:a[2],type:a[3],amt:a[4],mine:a[5],theirs:a[6],status:a[7],result:a[8],winner:a[9],desc:sbDesc(a[3],a[5],a[6])}))};
  ME=o.me;HOST=o.host===ME;
  $('#t-name').textContent=S.tableName;$('#t-wager').textContent=S.wager;$('#t-decks').textContent=`${S.decks} deck${S.decks>1?'s':''} · ${36*S.decks} cards`;
  if(!S.started)showWait();else $('#wait').hidden=true;
  const lv=S.keep?'away':'leave';const bl=$('#btn-leave');if(bl.dataset.v!==lv){bl.dataset.v=lv;bl.innerHTML=S.keep?'<span class="long">Step away</span><span class="short">Step away</span>':'<span class="long">Leave table</span><span class="short">Leave</span>'}
  if(SEATS[S.code]&&S.tableName&&SEATS[S.code].name!==S.tableName){SEATS[S.code].name=S.tableName;saveSeats()}
  $('#btn-invite').hidden=!!LOCALT;
  $('#btn-close').hidden=!(S.keep&&HOST);$('#btn-close').onclick=()=>{if(!$('#btn-close').dataset.arm){$('#btn-close').dataset.arm='1';$('#btn-close').textContent='Tap again to close for everyone';setTimeout(()=>{delete $('#btn-close').dataset.arm;$('#btn-close').textContent='Close room'},4000);return}send({type:'close'})};
  renderAll();
  motion(prev,before);
  cues(prev);
  for(const e of fx)runFx(e);
  maybeAskSideBet();
  rtcSyncPeers();
}
// sounds and small celebrations driven by what changed
function cues(prev){
  const mine=S.turn===ME&&(S.phase===3||S.phase===5)&&S.started;
  $('.me').classList.toggle('myturn',mine);
  if(!prev||prev.code!==S.code||!prev.players||!prev.players.length)return;
  if(mine&&!(prev.turn===ME&&prev.phase===S.phase)){SND('turn',{bg:true});buzz(30)}
  if(S.phase===4&&prev.phase!==4)SND('trick');
  if(!S.started){const h=x=>x.players.filter(p=>!p.isBot&&!p.gone).length;if(h(S)>h(prev))SND('join')}
  S.players.forEach(p=>{const q=prev.players[p.id];if(!q||q.name!==p.name)return;const d=p.chips-q.chips;if(d>0)setTimeout(()=>popGain(p.id,d),60)});
}
function showWait(){
  const w=$('#wait');w.hidden=false;$('#wait-code').textContent=S.code||'—';
  $('#wait-players').innerHTML=S.players.filter(p=>!p.gone).map(p=>`<span class="wp"><i style="background:${p.isBot?p.color:((p.av&&p.av.color)||'#2b1f25')}"></i>${esc(p.name)}${p.id===ME?' (you)':''}${p.id===S.hostId?' · host':''}${p.isBot?' · computer':''}</span>`).join('');
  const humans=S.players.filter(p=>!p.isBot&&!p.gone).length;
  if(HOST){$('#wait-note').textContent=`${S.keep?'This room stays open until you close it; everyone keeps their chips. ':''}Send the code (or the link) to your friends. ${humans>1?humans+' people seated.':'Waiting for friends…'}`;
    $('#wait-actions').innerHTML=`<button class="btn btn-ghost" id="btn-inv2">Invite</button><button class="btn btn-gold" id="btn-go">Start the game</button>`;
    $('#btn-go').onclick=()=>act({type:'start'});$('#btn-inv2').onclick=openInvite;
  }else{const hp=S.players[S.hostId];const hostAway=!hp||hp.away||hp.gone;$('#wait-note').textContent=hostAway?'The host is not here right now. Anyone seated can start.':'Waiting for the host to start the game…';$('#wait-actions').innerHTML=`<button class="btn btn-ghost" id="btn-inv2">Invite</button>${hostAway?'<button class="btn btn-gold" id="btn-go">Start the game</button>':''}`;$('#btn-inv2').onclick=openInvite;const g=$('#btn-go');if(g)g.onclick=()=>act({type:'start'})}
  msg(HOST?'Your table is open. Start when everyone is seated.':'Seated. Waiting for the host to deal.');actions('');
}
function runFx(e){
  switch(e.k){
    case 'bubble':bubble(e.pid,e.t,e.ms);if(e.t==='21!')SND('sparkle');break;
    case 'chip':flyChip(e.from==='pot'?$('#pot'):seatEl(e.from),e.to==='pot'?$('#pot'):seatEl(e.to),e.cls,e.n2||1);if(e.to==='pot'){const pe=$('.pot');pe.classList.remove('grow');void pe.offsetWidth;pe.classList.add('grow')}break;
    case 'banner':banner(e.t);SND('stamp');break;
    case 'win':{const el=$('#seat-'+e.pid);if(el){el.classList.add('winner');setTimeout(()=>el.classList.remove('winner'),2500)}const wp=S.players[e.pid];SND(wp&&total(wp)===21?'big21':'win');if(e.pid===ME){confetti();buzz([40,30,80])}break}
    case 'log':logLocal(e.t,e.cls||'');break;
    case 'toast':if(e.pid===undefined||e.pid===ME)toast(e.t,e.ms||2200);break;
    case 'nudge':if(e.pid===ME){nudge(e.t);SND('error');buzz(40)}break;
    case 'adasi':drama('adasi',e);break;
    case 'series':drama('series',e);break;
    case 'sel':if(e.pid===ME){const el=$(`#myhand .card[data-id="${e.id}"]`);el&&el.classList.add('pop')}break;
    case 'shuffle':shuffleFx();break;
  }
}

// ---------- rendering ----------
function renderAll(){const sig=S.players.map(p=>p.id+(p.isBot?'b':'h')+p.name+(p.av?JSON.stringify(p.av):'')).join('|')+'#'+ME;const fresh=sig!==lastSig;lastSig=sig;renderSeats(fresh||lastCount!==S.players.length||lastME!==ME);renderBoard();renderSide();renderMe();renderPhases()}
function seatLayout(n){
  const N=n+1,step=360/N,d=Math.round(N/2),sq=v=>Math.sign(v)*Math.pow(Math.abs(v),.62);
  const at=j=>{const a=(90+j*step)*Math.PI/180,c=sq(Math.cos(a)),s=sq(Math.sin(a));return{left:50+44*c,top:50+44*s,tx:-(1+c)*50,ty:-(1+s)*50,side:s>0.6?'b':(c>0.05?'r':'l')}};
  return{seat:k=>at(k<d?k:k+1),dealer:at(d)};
}
function renderPhases(){$('#phases').innerHTML=PHASES.map((p,i)=>`<span class="phase ${i<S.phase?'done':i===S.phase?'now':''}">${p}</span>`).join('')}
function renderSeats(fresh){
  const n=S.players.length, root=$('#seats');const meIdx=Math.max(0,ME);
  if(fresh||lastCount!==n||lastME!==ME){lastCount=n;lastME=ME;const L=seatLayout(n);const D=$('.dealer');D.style.left=L.dealer.left+'%';D.style.top=L.dealer.top+'%';D.style.right='auto';D.style.transform=`translate(${L.dealer.tx}%,${L.dealer.ty}%)`;root.innerHTML=S.players.map((p,i)=>{const pos=L.seat((i-meIdx+n)%n);const a=p.isBot?{style:`background:${p.color}`,text:p.name[0].toUpperCase()}:(p.id===ME?avStyle(AV,p.name[0].toUpperCase()):avStyle(p.av,p.name[0].toUpperCase()));
    return`<div class="seat" id="seat-${p.id}" data-side="${pos.side}" style="left:${pos.left}%;top:${pos.top}%;transform:translate(${pos.tx}%,${pos.ty}%);animation:seatin .6s ${i*.08}s both"><div class="av" style="${a.style}" ${p.id===ME?'title="Change your avatar"':''}>${a.text}<div class="vid"><video autoplay playsinline ${p.id===ME?'muted':''}></video></div><span class="rec"></span><span class="mic"></span><div class="ring" hidden></div><div class="tleft" hidden></div></div><div class="nm"></div><div class="chips"><span class="chip s c25"></span><span class="num"></span></div><div class="mini"></div><div class="tot"></div></div>`}).join('');
    if(ME>=0){const me=$('#seat-'+ME+' .av');if(me)me.onclick=openAv}
    S.players.forEach(p=>{if(p.isBot||p.id===ME)return;const el=$('#seat-'+p.id);if(!el)return;el.classList.add('human');el.querySelector('.av').onclick=()=>openPlayer(p.id)});
    rtcAttachAll();
  }
  S.players.forEach(p=>{
    const el=$('#seat-'+p.id);if(!el)return;el.querySelector('.nm').textContent=p.name+(p.gone?' · left':p.away?' · reconnecting':'');countTo(el.querySelector('.chips .num'),p.chips);
    el.classList.toggle('friend',!p.isBot&&p.id!==ME&&!!IDS[p.id]&&!!FRIENDS[IDS[p.id]]);el.classList.toggle('turn',S.turn===p.id);el.classList.toggle('sitout',p.sitout||p.gone||p.away||(S.started&&!S.participants.includes(p.id)));
    const mic=p.id===ME?AVS.mic:p.mic,cam=p.id===ME?AVS.cam:p.cam;el.classList.toggle('video',!!cam&&!p.isBot);el.classList.toggle('mic-on',!!mic);el.classList.toggle('mic-off',!mic);
    let btn=el.querySelector('.btn-d');if(S.dealer===p.id&&S.started){if(!btn){btn=document.createElement('div');btn.className='btn-d';btn.textContent='D';el.querySelector('.av').appendChild(btn)}}else if(btn)btn.remove();
    const mini=el.querySelector('.mini');
    const showDrop=p.dropped&&S.phase>=3&&S.phase<=4;const dropHTML=showDrop?`<div class="dropwrap ${S.trickWinner===p.id?'win':''}">${cardHTML(p.dropped,FLY.has(p.dropped.id)?'incoming':'')}<small>drop</small></div>`:'';
    if(p.id!==ME){const show=p.revealed;mini.innerHTML=dropHTML+p.hand.map(c=>show&&c.r!==undefined?cardHTML(c,FLY.has(c.id)?'incoming':''):`<div class="card back" data-id="${c.id}"></div>`).join('');
      const t=el.querySelector('.tot');if(show&&p.hand.length&&p.hand[0].r!==undefined){const tt=total(p);t.textContent=tt>21?'bust':tt;t.classList.toggle('bust',tt>21);t.classList.remove('count')}else{const k=Math.max(0,p.hand.length-(FLYC[p.id]||0));t.textContent=k?k:'';t.classList.remove('bust');t.classList.add('count')}
    }else{mini.innerHTML=dropHTML;el.querySelector('.tot').textContent=''}
  });
  countTo($('#pot'),S.pot);
  const st=$('#potstack');const k=Math.min(6,Math.ceil(S.pot/S.wager));st.innerHTML=Array.from({length:k},(_,i)=>`<span class="chip ${['c1','c5','c25','c100','c500'][i%5]}" style="top:${18-i*3}px"></span>`).join('');
  $('#t-hand').textContent=S.handNo;
  const live=S.players.filter(p=>!p.isBot&&!p.gone&&(p.cam||p.mic)).length;$('#roomav').textContent=live?`${live} on video/voice`:'Join the room with voice or video';
}
// the flushed cards always sit in one row: shrink to fit, then fan (overlap) so every corner index stays readable
function sizeBoard(){
  const slots=$('#slots');const n=(S&&S.boardSize)||0;if(!slots||!n)return;
  const tw=$('#table').clientWidth||360,phone=matchMedia('(max-width:700px)').matches;
  const avail=tw*(phone?(n>=7?0.6:0.8):0.78);
  const maxW=phone?50:70,minW=phone?36:46;
  let w=Math.min(maxW,Math.floor((avail-(n-1)*6)/n)),step=w+6;
  if(w<minW){w=minW;step=Math.max(17,Math.floor((avail-w)/Math.max(1,n-1)))}
  slots.style.setProperty('--card-w',w+'px');slots.style.setProperty('--step',step+'px');slots.classList.toggle('fan',step<w);
}
window.addEventListener('resize',()=>{if(S)sizeBoard()});
function renderBoard(){
  const n=S.boardSize||0;
  $('#slots').innerHTML=Array.from({length:n},(_,i)=>{const c=S.board[i];return`<div class="slot ${S.phase===5&&i===S.boardTop?'next':''}">${c&&!c.taken?cardHTML(c,FLY.has(c.id)?'incoming':''):''}<span class="idx">${i+1}</span></div>`}).join('');
  sizeBoard();
}
function renderSide(){setTimeout(updateSide,0);
  const el=$('#sbs');const bets=S.sideBets.filter(b=>b.status!=='pending');if(!bets.length){el.innerHTML='<div class="note" style="margin:0">No side bets yet. Propose one from the top bar.</div>';return}
  el.innerHTML=bets.slice().reverse().map(b=>{const A=S.players[b.a],B=S.players[b.b];let st=b.status;if(st==='won')st=b.winner===ME?'won':(b.a===ME||b.b===ME?'lost':'won');return`<div class="sb ${b.a===ME||b.b===ME?'mine':''}"><span class="st ${st}">${st}</span><b>${esc(A?A.name:'?')}</b> vs <b>${esc(B?B.name:'?')}</b> · ${fmt(b.amt)}<br><span style="color:var(--fg-dim)">${esc(b.desc)}</span>${b.result?`<br><span>${esc(b.result)}</span>`:''}</div>`}).join('');
}
let NUDGE=null;
function msg(t){if(NUDGE)return;$('#msg').innerHTML=t}
function nudge(t){NUDGE=t;$('#msg').innerHTML=`<span class="nudge">${t}</span>`;clearTimeout(nudge.t);nudge.t=setTimeout(()=>{NUDGE=null;renderMe()},2600)}
function actions(html){$('#actions').innerHTML=html}
function renderMe(){
  const me=ME>=0?S.players[ME]:null;
  if(!me){$('#myhand').innerHTML='';$('#mytotal').textContent='–';$('#mychips').textContent='–';$('#mychips')._n=undefined;return}
  const myTurn=S.turn===ME;
  $('#myhand').innerHTML=me.hand.map(c=>cardHTML(c,(FLY.has(c.id)?'incoming':'')+(S.phase===3&&myTurn?' pickable':''))).join('');
  const tt=total(me);$('#mytotal').textContent=!me.hand.length?'–':(S.phase<=3&&me.hand.length===3?'drop one':tt);$('#mytotal').style.color=tt>21?'var(--bad)':tt===21?'var(--good)':'';
  countTo($('#mychips'),me.chips);
  if(!S.started)return;
  const tp=S.turn>=0?S.players[S.turn]:null;const nm=tp?esc(tp.name):'';
  const out=!S.participants.includes(ME);
  if(S.phase===0){msg(S.msgHost||`Hand ${S.handNo}. Everyone puts ${fmt(S.wager)} into the pot.`);actions(HOST?'<button class="btn btn-gold" id="btn-deal">Deal now</button><span class="note" style="margin:0;align-self:center">auto-deals in 8s</span>':'');const b=$('#btn-deal');if(b)b.onclick=()=>act({type:'deal'})}
  else if(S.phase===1){msg('The dealer shuffles and deals three cards each…');actions('')}
  else if(S.phase===2){msg(`Dealer flushes ${S.boardSize} cards onto the board before anyone drops.`);actions('')}
  else if(S.phase===3){
    if(out){msg('You sit this hand out.');actions('')}
    else if(myTurn&&S.adasiTurn===ME){msg('<b>Two Aces!</b> You hold Adasi. Declare it and the pot is yours.');actions('<button class="btn btn-adasi" id="btn-adasi">DECLARE ADASI</button>');$('#btn-adasi').onclick=()=>{actions('');act({type:'adasi'})}}
    else if(myTurn){const must=S.leadSuit&&me.hand.some(c=>c.s===S.leadSuit);
      msg(S.leadSuit?(must?`Lead suit is ${S.leadSuit} — you must drop a ${S.leadSuit}. Tap a card.`:`Lead suit is ${S.leadSuit}. You have none, so drop any card.`):'You lead. Tap the card you want to drop. It leaves your hand.');actions('');
      $$('#myhand .card').forEach(el=>{const c=me.hand.find(x=>x.id===el.dataset.id);
        if(must&&c.s!==S.leadSuit){el.classList.add('dim');el.classList.remove('pickable');el.onclick=()=>{nudge(`You hold a ${S.leadSuit}, so you have to follow suit.`);SND('error')};return}
        el.onclick=()=>{const keep=me.hand.filter(x=>x!==c);const kt=keep.reduce((a,x)=>a+val(x),0);if(kt>21){nudge(`Keeping ${keep.map(cname).join(' + ')} makes ${kt}. That's over 21 before you even pick, so you'd be bust. Drop a different card.`);SND('error');return}el.classList.add('sel');$$('#myhand .card').forEach(x=>{x.classList.remove('pickable');x.onclick=null});act({type:'drop',card:c.id})}})}
    else{msg(me.dropped?`You dropped ${cname(me.dropped)}. Waiting for ${nm}…`:`${nm} is choosing a card to drop…`);actions('')}
  }
  else if(S.phase===4){const w=S.trickWinner>=0?S.players[S.trickWinner]:null;msg(w?`<b>${esc(w.name)}</b> wins the trick and picks first.`:'');actions('')}
  else if(S.phase===5){
    if(out){msg('You sit this hand out.');actions('')}
    else if(myTurn){const c=S.board[S.boardTop];const t=total(me);
      if(!c){msg('The board is empty.');actions('');return}
      const bust=t+val(c)>21;
      msg(`Your turn to pick. Next card on the board is <b>${cname(c)}</b> (${val(c)}). You're on <b>${t}</b>${bust?'':` → ${t+val(c)}`}.`);
      actions(`<button class="btn btn-gold" id="btn-take" ${bust?'aria-disabled="true"':''}>Take ${cname(c)}</button><button class="btn btn-ghost" id="btn-stay">Stay on ${t}</button>`);
      $('#btn-take').onclick=()=>{if(bust){nudge(`${cname(c)} would take you from ${t} to ${t+val(c)}. Over 21 is bust, so the game won't let you take it. You stay on ${t}.`);SND('error');$('#btn-take').disabled=true;act({type:'stay',bust:1});return}act({type:'take',card:c.id})};
      $('#btn-stay').onclick=()=>act({type:'stay'});
    }else{msg(`${nm} is picking… you're on <b>${total(me)}</b>.`);actions('')}
  }
  else if(S.phase===6){
    const summary=S.participants.map(id=>{const p=S.players[id];return p?`${esc(p.name)}: ${total(p)>21?'bust':total(p)}`:''}).join(' · ');
    if(S.busy){msg(S.msgHost||summary);actions('')}
    else{
      let a='';
      if(me.satOutByTimer)a+='<button class="btn btn-gold" id="btn-rejoin">Rejoin the table</button>';
      else if(me.chips<S.wager)a+=`<button class="btn btn-gold" id="btn-rebuy">Rebuy ${fmt(S.buyIn)}</button>`;
      if(HOST){if(S.msgHost&&!S.next)a+='<button class="btn btn-gold" id="btn-rebuy-all">Rebuy everyone</button>';else a+=`<button class="btn ${a?'btn-ghost':'btn-gold'}" id="btn-next">${S.tiebreak?'Play the tie-break':'Next hand'}</button><span class="note" style="margin:0;align-self:center">auto in 12s</span>`}
      msg(S.msgHost||`${summary}. ${S.tiebreak&&S.next&&!S.next.includes(ME)?'The tie-break is between the others; you sit it out.':(HOST?'Ready when you are.':'Waiting for the host to deal the next hand.')}`);
      actions(a);
      const bn=$('#btn-next');if(bn)bn.onclick=()=>act({type:'next'});const br=$('#btn-rejoin');if(br)br.onclick=()=>act({type:'rejoin'});const bb=$('#btn-rebuy');if(bb)bb.onclick=()=>act({type:'rebuy'});const ba=$('#btn-rebuy-all');if(ba)ba.onclick=()=>act({type:'rebuy_all'});
    }
  }
}
function bubble(pid,text,ms=1400){const el=$('#seat-'+pid);if(!el)return;const p=S.players[pid];if(p&&p.isBot&&p.mic)fakeSpeak(pid,ms);const b=document.createElement('div');b.className='bubble';b.textContent=text;el.appendChild(b);setTimeout(()=>b.remove(),ms)}
function fakeSpeak(pid,ms){const el=$('#seat-'+pid);if(!el||!AVS.spk)return;el.classList.add('speaking');setTimeout(()=>el.classList.remove('speaking'),ms)}
function center(el){const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}}
function drama(kind,e){
  const fx=$('#fx');$$('.drama').forEach(d=>d.remove());SND(kind,{bg:true});
  const cards=(e.cards||[]).map(dec);
  const d=document.createElement('div');d.className='drama '+kind;
  d.innerHTML=`<div class="dim"></div><div class="inner">${kind==='adasi'?`<div class="word">ADASI!</div><div class="cards">${cards.map(c=>cardHTML(c)).join('')}</div><div class="sub">${esc(e.who)} ${e.split?'share':'takes'} the pot — ${fmt(e.pot||0)} chips</div>`:`<div class="word">SERIES!</div><div class="cards">${cards.map(c=>cardHTML(c)).join('')}</div><div class="sub">${e.pid<0?'Three of a kind on the board':esc(e.who)+' was dealt three of a kind'}</div><div class="stamp">REDEAL · POT STAYS</div>`}</div>`;
  fx.appendChild(d);
  const fl=document.createElement('div');fl.className='flash';document.body.appendChild(fl);setTimeout(()=>fl.remove(),600);
  const t=$('#table');t.classList.remove('shake');void t.offsetWidth;t.classList.add('shake');
  if(kind==='adasi'){confetti();setTimeout(confetti,500);setTimeout(confetti,1000);for(const id of (e.pids||[e.pid])){const el=$('#seat-'+id);if(el){el.classList.add('winner');setTimeout(()=>el.classList.remove('winner'),3500)}}}
  buzz(kind==='adasi'?[80,40,80,40,200]:[200,60,200]);
  setTimeout(()=>d.remove(),kind==='adasi'?3500:4000);
}
function banner(text){const b=document.createElement('div');b.className='banner';b.textContent=text;$('#fx').appendChild(b);setTimeout(()=>b.remove(),2300)}
function confetti(){const fx=$('#fx');for(let i=0;i<40;i++){const c=document.createElement('i');c.className='confetti';c.style.left=Math.random()*100+'%';c.style.top='0';c.style.background=['var(--gold)','var(--cream)','var(--good)','var(--red)'][i%4];c.style.animationDelay=(Math.random()*.6)+'s';fx.appendChild(c);setTimeout(()=>c.remove(),2600)}}
function seatEl(id){return id===ME?$('#mychips'):$('#seat-'+id)}
let TICK=-1;
(function ringLoop(){requestAnimationFrame(ringLoop);if(!S)return;$$('.seat').forEach(el=>{const pid=+el.id.slice(5);const ring=el.querySelector('.ring'),tl=el.querySelector('.tleft');if(!ring)return;const on=S.turn===pid&&S.deadline>0&&(S.phase===3||S.phase===5);ring.hidden=!on;tl.hidden=!on;if(pid===ME&&!on)TICK=-1;if(!on)return;const secs=S.timer||20;const left=Math.max(0,(S.deadline-Date.now())/1000);const pct=Math.min(1,left/secs);ring.style.setProperty('--pct',pct);ring.style.setProperty('--ringc',pct>.5?'var(--good)':pct>.25?'var(--warn)':'var(--bad)');tl.textContent=Math.ceil(left);const urgent=left<=5;ring.classList.toggle('urgent',urgent);tl.classList.toggle('urgent',urgent);
  if(pid===ME&&urgent){const sec=Math.ceil(left);if(sec>0&&sec!==TICK){TICK=sec;SND('tick',{bg:true});if(sec<=3)buzz(12)}}})})();

// ---------- table motion: cards fly from the dealer's shoe, chips arc, numbers roll ----------
const CARDSEL='#slots .card[data-id],#seats .card[data-id],#myhand .card[data-id]';
const FLY=new Set(),SEEN=new Set();let FLYC={},FLAYER=null;
function layer(){if(!FLAYER||!FLAYER.isConnected){FLAYER=document.createElement('div');FLAYER.className='flylayer';document.body.appendChild(FLAYER)}return FLAYER}
function rectOf(el){if(!el)return null;const r=el.getBoundingClientRect();return r.width?r:null}
function shoeRect(){return rectOf($('.dealer .shoe'))||rectOf($('.dealer .av'))}
function avRect(pid){return rectOf($(`#seat-${pid} .av`))}
function whereOf(el){if(el.closest('#myhand'))return'hand';if(el.closest('#slots'))return'board';const s=el.closest('.seat');return s?s.id:'?'}
function snapCards(){const m=new Map();$$(CARDSEL).forEach(el=>{if(el.classList.contains('back'))return;const r=rectOf(el);if(r)m.set(el.dataset.id,{r,w:whereOf(el)})});return m}
function cardFromId(id){return{r:id.slice(0,-2),s:id.slice(-2,-1),id}}
function clearMotion(){FLY.clear();SEEN.clear();FLYC={};if(FLAYER)FLAYER.innerHTML=''}
// a stand-in card that travels from one spot to another; the real card stays hidden until it lands
function ghost(o){
  const from=o.from,to=o.to;if(!from||!to){if(o.onland)o.onland();return}
  const w=o.w||to.width,h=o.h||to.height,c=o.c,face=!!(c&&c.r!==undefined);
  const el=document.createElement('div');el.className='card flycard '+(face?(isRed(c)?'red':''):'back');if(face)el.innerHTML=cardInner(c);
  const cx=to.left+to.width/2,cy=to.top+to.height/2;
  el.style.cssText=`--card-w:${w}px;width:${w}px;height:${h}px;left:${cx-w/2}px;top:${cy-h/2}px`;
  const dx=from.left+from.width/2-cx,dy=from.top+from.height/2-cy,s0=Math.max(.3,Math.min(1.8,(o.fromW||from.width)/w)),e=o.endScale||1,spin=o.spin||0,lift=o.lift==null?50:o.lift,P='perspective(700px) ';
  const kf=[{transform:`${P}translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${spin.toFixed(1)}deg) rotateY(0deg) scale(${s0.toFixed(3)})`,opacity:1},
    {offset:.55,transform:`${P}translate(${(dx*.42).toFixed(1)}px,${(dy*.42-lift).toFixed(1)}px) rotate(${(spin*.35).toFixed(1)}deg) rotateY(0deg) scale(${((s0+e)/2*1.06).toFixed(3)})`,opacity:1}];
  if(o.flip)kf.push({offset:.82,transform:`${P}translate(0px,0px) rotate(0deg) rotateY(0deg) scale(${e})`,opacity:1},{transform:`${P}translate(0px,0px) rotate(0deg) rotateY(90deg) scale(${e})`,opacity:1});
  else kf.push({transform:`${P}translate(0px,0px) rotate(0deg) rotateY(0deg) scale(${e})`,opacity:o.fade?0:1});
  layer().appendChild(el);
  let done=false;const fin=()=>{if(done)return;done=true;el.remove();if(o.onland)o.onland()};
  const a=el.animate(kf,{duration:o.dur||440,delay:o.delay||0,easing:'cubic-bezier(.3,.7,.35,1)',fill:'backwards'});a.onfinish=fin;a.oncancel=fin;setTimeout(fin,(o.dur||440)+(o.delay||0)+600);
}
function reveal(id,flip){FLY.delete(id);const el=$$(CARDSEL).find(x=>x.dataset.id===id);if(!el)return;el.classList.remove('incoming');
  if(flip){el.animate([{transform:'perspective(700px) rotateY(-90deg)'},{transform:'perspective(700px) rotateY(0deg)'}],{duration:200,easing:'cubic-bezier(.2,.8,.3,1)'});SND('flip')}
  else el.animate([{transform:'scale(1.08)'},{transform:'scale(1)'}],{duration:180,easing:'ease-out'})}
function setCount(pid,bump){const p=S&&S.players[pid];if(!p||pid===ME)return;const el=$(`#seat-${pid} .tot.count`);if(!el)return;const n=Math.max(0,p.hand.filter(c=>c.r===undefined).length-(FLYC[pid]||0));el.textContent=n?n:'';if(bump&&n)el.animate([{transform:'scale(1.6)'},{transform:'scale(1)'}],{duration:240,easing:'ease-out'})}
function motion(prev,before){
  const els=$$(CARDSEL);
  const live=prev&&prev.code===S.code&&prev.players&&prev.players.length&&!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!live){clearMotion();els.forEach(el=>SEEN.add(el.dataset.id));S.players.forEach(p=>setCount(p.id));return}
  const newHand=S.handNo!==prev.handNo||S.phase<prev.phase,shoe=shoeRect(),now=new Set(els.map(el=>el.dataset.id));
  // cards that left: the board card someone took goes to them; everything else back to the dealer
  const taken=[];let gone=0;
  for(const [id,b] of before){if(now.has(id))continue;
    const nb=!newHand&&S.board.find(c=>c&&c.id===id);
    if(nb&&nb.taken&&b.w==='board'){taken.push({r:b.r,c:nb});continue}
    ghost({from:b.r,to:shoe,c:cardFromId(id),w:b.r.width,h:b.r.height,dur:520,delay:gone*30,spin:(Math.random()-.5)*50,endScale:.25,fade:true,lift:24});gone++}
  if(gone)SND('whoosh');
  if(newHand){SEEN.clear();FLYC={}}
  let flips=0;
  els.forEach(el=>{const id=el.dataset.id;if(el.classList.contains('back'))return;const where=whereOf(el),b=before.get(id);
    if(b&&b.w===where){SEEN.add(id);return}
    const to=rectOf(el);
    if(b){SEEN.add(id);if(!to)return;FLY.add(id);el.classList.add('incoming');SND(where==='hand'?'deal':'flick');ghost({from:b.r,to,c:cardFromId(id),dur:420,lift:where==='hand'?70:36,onland:()=>reveal(id,false)});return}
    if(SEEN.has(id))return;SEEN.add(id);if(!to)return;
    if(where==='board'||where==='hand'){FLY.add(id);el.classList.add('incoming');SND('deal');ghost({from:shoe,fromW:14,to,dur:where==='hand'?480:450,spin:-28+Math.random()*16,flip:true,lift:where==='hand'?90:60,onland:()=>reveal(id,true)});return}
    const pid=+where.slice(5);if(pid===ME)return;
    if(S.phase>=6){el.animate([{transform:'perspective(600px) rotateY(90deg)'},{transform:'perspective(600px) rotateY(0deg)'}],{duration:300,delay:flips*90,easing:'ease-out',fill:'backwards'});SND('flip',{delay:flips*.09});flips++}
    else{FLY.add(id);el.classList.add('incoming');SND('flick');ghost({from:avRect(pid),to,c:cardFromId(id),dur:360,lift:24,onland:()=>reveal(id,false)})}
  });
  // opponents' face-down cards: from the shoe while dealing, from the board when they pick
  if(!newHand)for(const p of S.players){if(p.id===ME)continue;const q=prev.players[p.id];if(!q||q.name!==p.name)continue;
    const hid=x=>x.hand.filter(c=>c.r===undefined).length,gain=hid(p)-hid(q);if(gain<=0)continue;const to=avRect(p.id);if(!to)continue;
    for(let k=0;k<gain;k++){const t=taken.shift();FLYC[p.id]=(FLYC[p.id]||0)+1;const land=()=>{FLYC[p.id]=Math.max(0,(FLYC[p.id]||0)-1);setCount(p.id,true)};SND('deal');
      if(t)ghost({from:t.r,to,c:t.c,w:t.r.width,h:t.r.height,dur:460,lift:50,endScale:.45,fade:true,onland:land});
      else ghost({from:shoe,fromW:14,to,w:30,h:42,dur:420,spin:(Math.random()-.5)*40,lift:60,endScale:.6,fade:true,onland:land})}
    setCount(p.id)}
  for(const t of taken){const to=avRect(S.turn>=0?S.turn:prev.turn);if(to)ghost({from:t.r,to,c:t.c,w:t.r.width,h:t.r.height,dur:460,endScale:.45,fade:true})}
}
// the dealer riffles the deck in the middle of the felt before each deal
function shuffleFx(){
  if(document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches){SND('shuffle');return}
  const tr=rectOf($('#table'));if(!tr)return;const sh=shoeRect();SND('shuffle',{delay:.25});
  const cx=tr.left+tr.width/2,cy=tr.top+tr.height*.5,w=Math.round(Math.min(64,Math.max(40,tr.width*.06))),h=Math.round(w*1.4),n=12;
  const box=document.createElement('div');box.className='riffle';box.style.cssText=`left:${cx-w/2}px;top:${cy-h/2}px;width:${w}px;height:${h}px;--card-w:${w}px`;
  for(let i=0;i<n;i++){const c=document.createElement('div');c.className='card back';c.style.cssText=`position:absolute;left:0;top:0;width:${w}px;height:${h}px`;box.appendChild(c)}
  layer().appendChild(box);
  const tx=sh?sh.left+sh.width/2-cx:0,ty=sh?sh.top+sh.height/2-cy:-120;
  box.animate([{opacity:0,transform:'translate(0px,0px) scale(.6)'},{offset:.12,opacity:1,transform:'translate(0px,0px) scale(1)'},{offset:.82,opacity:1,transform:'translate(0px,0px) scale(1)'},{opacity:0,transform:`translate(${tx.toFixed(0)}px,${ty.toFixed(0)}px) scale(.3)`}],{duration:1150,easing:'ease-in-out',fill:'both'});
  [...box.children].forEach((c,i)=>{const L=i<n/2,j=L?i:i-n/2,order=L?j*2:j*2+1,sx=L?-w*.78:w*.78,rot=L?-14:14;c.style.zIndex=String(order);
    c.animate([{offset:0,transform:`translate(0px,${(-i*.6).toFixed(1)}px) rotate(0deg)`},{offset:.12,transform:`translate(0px,${(-i*.6).toFixed(1)}px) rotate(0deg)`},{offset:.32,transform:`translate(${sx.toFixed(1)}px,${(-j*1.2-6).toFixed(1)}px) rotate(${rot}deg)`},{offset:.38+order*.022,transform:`translate(${sx.toFixed(1)}px,${(-j*1.2-6).toFixed(1)}px) rotate(${rot}deg)`},{offset:.44+order*.022,transform:`translate(0px,${(-order*.6).toFixed(1)}px) rotate(0deg)`},{offset:1,transform:`translate(0px,${(-order*.6).toFixed(1)}px) rotate(0deg)`}],{duration:1150,easing:'ease-in-out',fill:'both'})});
  setTimeout(()=>box.remove(),1250);
}
// chips arc through the air and clink when they land
async function flyChip(fromEl,toEl,cls='c25',count=1){if(!fromEl||!toEl)return;
  if(fromEl===$('#pot'))SND('pot');
  for(let i=0;i<count;i++){const a=center(fromEl),b=center(toEl);const c=document.createElement('span');c.className='chip '+cls;c.style.left=(a.x-11)+'px';c.style.top=(a.y-11)+'px';layer().appendChild(c);
    const dx=b.x-a.x,dy=b.y-a.y,lift=Math.min(110,30+Math.hypot(dx,dy)*.28);
    let gone=false;const end=()=>{if(gone)return;gone=true;c.remove();SND('chip')};
    if(document.hidden){end()}else{const an=c.animate([{transform:'translate(0px,0px) rotateX(0deg) scale(1)'},{offset:.5,transform:`translate(${(dx*.5).toFixed(1)}px,${(dy*.5-lift).toFixed(1)}px) rotateX(200deg) scale(1.2)`},{transform:`translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotateX(360deg) scale(.85)`}],{duration:620,easing:'cubic-bezier(.35,.6,.4,1)'});an.onfinish=end;setTimeout(end,1100)}
    await new Promise(r=>setTimeout(r,85))}}
// numbers roll up and down instead of jumping
function countTo(el,v){if(!el)return;v=+v||0;const shown=el._n;cancelAnimationFrame(el._raf);
  if(shown===undefined||shown===v||document.hidden){el._n=v;el.textContent=fmt(v);return}
  const from=shown,start=performance.now(),dur=Math.min(900,350+Math.abs(v-from)/4);
  const step=t=>{const k=Math.min(1,(t-start)/dur),e=1-Math.pow(1-k,3);el._n=Math.round(from+(v-from)*e);el.textContent=fmt(el._n);if(k<1)el._raf=requestAnimationFrame(step)};el._raf=requestAnimationFrame(step)}
function popGain(pid,d){const el=pid===ME?$('#mychips'):$(`#seat-${pid} .chips`);const r=rectOf(el);if(!r||document.hidden)return;const g=document.createElement('div');g.className='gain';g.textContent='+'+fmt(d);g.style.left=(r.left+r.width/2)+'px';g.style.top=(r.top-6)+'px';layer().appendChild(g);
  const a=g.animate([{transform:'translate(-50%,0px) scale(.6)',opacity:0},{offset:.15,transform:'translate(-50%,-14px) scale(1.15)',opacity:1},{offset:.7,transform:'translate(-50%,-44px) scale(1)',opacity:1},{transform:'translate(-50%,-64px) scale(1)',opacity:0}],{duration:1500,easing:'ease-out'});a.onfinish=()=>g.remove();setTimeout(()=>g.remove(),2000)}

// ---------- side bets ----------
const ASKED=new Set();
function openSideBet(){
  if(!S||!S.started)return;
  if(!S.side){info('Side bets are off','The host turned them off for this table.');return}
  if(ME<0){info('Not seated yet','You can propose side bets once you are in a hand.');return}
  if(S.phase>=5||S.phase<0){info('Too late this hand','Side bets are proposed before the deal (card bets) or before picking starts (total bets). Try again next hand.');return}
  const opp=$('#sb-opp');opp.innerHTML=S.participants.filter(id=>id!==ME&&S.players[id]&&!S.players[id].gone).map(id=>`<option value="${id}">${esc(S.players[id].name)} (${fmt(S.players[id].chips)} chips)</option>`).join('');
  const n=S.participants.length+1;['#sb-mine','#sb-theirs'].forEach((s,i)=>{$(s).innerHTML=Array.from({length:n},(_,k)=>`<option value="${k}" ${k===(i?1:0)?'selected':''}>#${k+1}</option>`).join('')});
  $('#sb-type').onchange=()=>{$('#sb-cards').hidden=$('#sb-type').value!=='cardvcard'};$('#sb-type').onchange();
  openModal('#m-sb');
}
$('#btn-sidebet').onclick=openSideBet;
$('#sb-send').onclick=()=>{
  const b=+$('#sb-opp').value,type=$('#sb-type').value,amt=Math.max(5,+$('#sb-amt').value||25);
  const me=S.players[ME],opp=S.players[b];if(!opp)return;
  if(amt>me.chips||amt>opp.chips){toast('Not enough chips for that amount');return}
  let mine=+$('#sb-mine').value,theirs=+$('#sb-theirs').value;
  if(type==='first'){mine=0;theirs=1}else if(type==='cardvcard'&&mine===theirs){toast('Pick two different cards');return}
  if(type!=='total'&&S.phase>=2){info('Board already flushed','Bets on the flushed cards have to be agreed before the deal. You can still bet on totals.');return}
  closeModal('#m-sb');toast(`Asking ${opp.name}…`,1500);
  act({type:'sb',to:b,bt:type,amt,mine,theirs});
};
function maybeAskSideBet(){
  if(ME<0)return;const bet=S.sideBets.find(b=>b.status==='pending'&&b.b===ME&&!ASKED.has(b.id));if(!bet)return;ASKED.add(bet.id);
  const A=S.players[bet.a];
  $('#ask-title').textContent=`${A.name} wants a side bet`;$('#ask-body').innerHTML=`<b>${esc(A.name)}</b> bets <b>${fmt(bet.amt)}</b> chips that ${bet.type==='first'?'the <b>1st card flushed</b> will be higher than the 2nd':bet.type==='cardvcard'?`board card <b>#${bet.mine+1}</b> (theirs) beats <b>#${bet.theirs+1}</b> (yours)`:'<b>their final total</b> will beat yours'}. Outside the pot; the main game carries on either way.`;
  openModal('#m-ask');SND('pop',{bg:true});
  $('#ask-yes').onclick=()=>{closeModal('#m-ask');act({type:'sb_ans',id:bet.id,yes:true})};
  $('#ask-no').onclick=()=>{closeModal('#m-ask');act({type:'sb_ans',id:bet.id,yes:false})};
}

// ---------- voice & video (WebRTC mesh, server relays the introductions) ----------
let LOCAL=null, ICE=null; const PC=new Map(); // pid -> {pc, stream, analyser}
async function getIce(){if(ICE)return ICE;try{ICE=await (await fetch('/ice')).json()}catch{ICE=[{urls:'stun:stun.l.google.com:19302'}]}return ICE}
function avUI(){['#btn-mic','#btn-cam','#btn-spk','#roomav'].forEach(s=>{$(s).hidden=!!LOCALT});const set=(id,on)=>{const b=$(id);b.classList.toggle('on',on);b.classList.toggle('off',!on)};set('#btn-mic',AVS.mic);set('#btn-cam',AVS.cam);set('#btn-spk',AVS.spk);renderSound();if(S)renderSeats();hello()}
async function ensureLocal(){
  const wantAudio=AVS.mic, wantVideo=AVS.cam;
  if(!wantAudio&&!wantVideo){if(LOCAL){LOCAL.getTracks().forEach(t=>t.stop());LOCAL=null}return}
  try{
    const have={a:LOCAL&&LOCAL.getAudioTracks().length>0,v:LOCAL&&LOCAL.getVideoTracks().length>0};
    if(have.a===wantAudio&&have.v===wantVideo)return;
    if(LOCAL)LOCAL.getTracks().forEach(t=>t.stop());
    LOCAL=await navigator.mediaDevices.getUserMedia({audio:wantAudio?{echoCancellation:true,noiseSuppression:true}:false,video:wantVideo?{width:{ideal:320},height:{ideal:240},frameRate:{ideal:15},facingMode:'user'}:false});
  }catch(e){LOCAL=null;AVS.mic=false;AVS.cam=false;info('Camera or mic not available',`Your browser said: ${esc(e.message||e.name)}. Check the site permission for camera and microphone, then try again.`);}
  attachLocal();
  for(const [pid,c] of PC)renegotiate(pid,c);
}
function attachLocal(){const v=$(`#seat-${ME} .vid video`);if(v&&LOCAL&&AVS.cam){v.srcObject=LOCAL;v.muted=true}else if(v)v.srcObject=null;if(LOCAL&&AVS.mic)watchLevel(ME,LOCAL)}
function replaceTracks(c,create){
  const pc=c.pc;const want={audio:AVS.mic&&LOCAL?LOCAL.getAudioTracks()[0]:null,video:AVS.cam&&LOCAL?LOCAL.getVideoTracks()[0]:null};
  for(const kind of ['audio','video']){let tx=pc.getTransceivers().find(t=>t.receiver&&t.receiver.track&&t.receiver.track.kind===kind);
    if(!tx){if(!create)continue;tx=pc.addTransceiver(kind,{direction:'sendrecv'})}
    if(tx.sender.track!==(want[kind]||null))tx.sender.replaceTrack(want[kind]||null).catch(()=>{});
    if(tx.direction!=='sendrecv')tx.direction='sendrecv'}
}
async function makePC(pid,initiator){
  if(PC.has(pid))return PC.get(pid);
  const pc=new RTCPeerConnection({iceServers:await getIce()});const c={pc,stream:new MediaStream(),polite:ME>pid,making:false};PC.set(pid,c);
  pc.onicecandidate=e=>{if(e.candidate)send({type:'rtc',to:pid,data:{cand:e.candidate}})};
  pc.ontrack=e=>{c.stream.addTrack(e.track);attachRemote(pid,c)};
  pc.onnegotiationneeded=async()=>{try{c.making=true;await pc.setLocalDescription();send({type:'rtc',to:pid,data:{sdp:pc.localDescription}})}catch(e){}finally{c.making=false}};
  pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'){pc.restartIce()}};
  if(initiator)replaceTracks(c,true);
  return c;
}
function renegotiate(pid,c){replaceTracks(c,true)}
async function rtcOnSignal(from,data){
  const c=await makePC(from);const pc=c.pc;
  try{
    if(data.sdp){const offerCollision=data.sdp.type==='offer'&&(c.making||pc.signalingState!=='stable');
      if(offerCollision&&!c.polite)return;
      await pc.setRemoteDescription(data.sdp);
      if(data.sdp.type==='offer'){replaceTracks(c,false);await pc.setLocalDescription();send({type:'rtc',to:from,data:{sdp:pc.localDescription}})}}
    else if(data.cand){try{await pc.addIceCandidate(data.cand)}catch(e){}}
  }catch(e){console.warn('rtc',e)}
}
function rtcOnPeerJoined(pid){if(pid===ME)return;if(ME<pid)makePC(pid,true)}
function rtcOnPeerLeft(pid){const c=PC.get(pid);if(c){c.pc.close();PC.delete(pid)}}
function rtcLeaveAll(){for(const [pid,c] of PC){c.pc.close()}PC.clear();if(LOCAL){LOCAL.getTracks().forEach(t=>t.stop());LOCAL=null}}
function rtcSyncPeers(){if(!S||ME<0)return;for(const p of S.players){if(p.isBot||p.gone||p.id===ME)continue;if(!PC.has(p.id)&&ME<p.id)makePC(p.id,true)}for(const [pid] of PC){const p=S.players[pid];if(!p||p.gone||p.isBot)rtcOnPeerLeft(pid)}}
function attachRemote(pid,c){const v=$(`#seat-${pid} .vid video`);if(v&&v.srcObject!==c.stream){v.srcObject=c.stream;v.muted=!AVS.spk;v.play().catch(()=>{})}if(c.stream.getAudioTracks().length)watchLevel(pid,c.stream)}
function rtcAttachAll(){attachLocal();for(const [pid,c] of PC)attachRemote(pid,c)}
let ACTX=null;const LEVELS=new Map();
function watchLevel(pid,stream){
  if(LEVELS.has(pid))return;try{ACTX=ACTX||new (window.AudioContext||window.webkitAudioContext)();const src=ACTX.createMediaStreamSource(stream);const an=ACTX.createAnalyser();an.fftSize=512;src.connect(an);const buf=new Uint8Array(an.frequencyBinCount);LEVELS.set(pid,{an,buf})}catch{}
}
(function levelLoop(){setTimeout(levelLoop,120);for(const [pid,l] of LEVELS){const el=$('#seat-'+pid);if(!el)continue;l.an.getByteFrequencyData(l.buf);let s=0;for(let i=0;i<l.buf.length;i++)s+=l.buf[i];const avg=s/l.buf.length;const muted=pid===ME?!AVS.mic:(S&&S.players[pid]&&!S.players[pid].mic);el.classList.toggle('speaking',!muted&&avg>18&&AVS.spk)}})();
$('#btn-mic').onclick=async()=>{AVS.mic=!AVS.mic;if(ACTX&&ACTX.state==='suspended')ACTX.resume();await ensureLocal();toast(AVS.mic?'Mic on — the table can hear you':'Mic muted');avUI()};
$('#btn-cam').onclick=async()=>{AVS.cam=!AVS.cam;await ensureLocal();toast(AVS.cam?'Camera on':'Camera off');avUI()};
$('#btn-spk').onclick=()=>{AVS.spk=!AVS.spk;$$('.seat video').forEach(v=>{if(!v.closest('#seat-'+ME))v.muted=!AVS.spk});if(ACTX&&ACTX.state==='suspended')ACTX.resume();toast(AVS.spk?'You can hear the table':'Other players muted');avUI()};
// browsers block remote audio until a tap: resume on first interaction
document.addEventListener('pointerdown',()=>{if(ACTX&&ACTX.state==='suspended')ACTX.resume();$$('.seat video').forEach(v=>v.play().catch(()=>{}))},{passive:true});

// ---------- the lobby comes in after the intro ----------
let ENTERED=false;
function lobbyEnter(){if(ENTERED)return;ENTERED=true;if(!$('#lobby').classList.contains('on')||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const els=[$('.lb-top'),$('#brand'),...$$('#returns .retcard'),...$$('.tiles .tile'),...$$('#lobby .strip:not([hidden])'),$('.lb-foot')].filter(Boolean);
  els.forEach((el,i)=>{const tile=el.classList.contains('tile'),d=80+i*70;
    el.animate(tile?[{transform:'translateY(-70px) rotate(-12deg) scale(.8)',opacity:0},{transform:'translateY(0px) rotate(0deg) scale(1)',opacity:1}]:[{transform:'translateY(16px)',opacity:0},{transform:'translateY(0px)',opacity:1}],{duration:tile?650:520,delay:d,easing:tile?'cubic-bezier(.2,1.3,.35,1)':'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});
    if(tile)SND('deal',{delay:(d+260)/1000})})}
function afterIntro(fn){const st=window.TETE_INTRO;if(!st||st==='exit'||st==='done'){fn();return}let ran=false;const go=()=>{if(!ran){ran=true;fn()}};window.addEventListener('tete:introexit',go,{once:true});window.addEventListener('tete:introdone',go,{once:true})}
afterIntro(()=>{lobbyEnter();if(JOIN_LINK)setTimeout(()=>{if($('#lobby').classList.contains('on'))openJoin()},700)});

if(location.search.includes('demo'))window.__fx=runFx;
setInterval(()=>{if(!LOCALT&&S&&$('#game').classList.contains('on')&&navigator.onLine!==false)fetch('/health',{cache:'no-store'}).catch(()=>{})},240000);
window.addEventListener('online',()=>{if(!CONNECTED)connect();else setStatus('ok','Connected.')});
window.addEventListener('offline',()=>{setStatus('off','Offline. Practice against the computer still works; hosting and joining need a connection.');renderRooms()});
refreshAv();renderSound();renderRooms();renderFriends();
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
let INSTALL=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();INSTALL=e;['#btn-install','#btn-install2'].forEach(s=>{const b=$(s);if(b){b.hidden=false;b.onclick=()=>{if(!INSTALL)return;INSTALL.prompt();INSTALL=null;$$('#btn-install,#btn-install2').forEach(x=>x.hidden=true)}}})});
connect();
})();

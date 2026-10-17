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
const RM=()=>document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches;

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
function renderMeChip(){const n=myName(),chip=$('#me-chip'),sub=$('#me-sub');let dot=chip.querySelector('.dot');
  if(ACCT){const u=ACCT.user;$('#me-name').textContent=u.display;if(!sub.querySelector('#chip-bal'))sub.innerHTML='<span id="chip-bal" class="num"></span> chips · Lv <span id="chip-lv"></span>';countTo($('#chip-bal'),u.balance);$('#chip-lv').textContent=u.level;chip.classList.remove('unset');
    const want=(ACCT.bonus&&ACCT.bonus.ready)||(ACCT.incoming||[]).length>0;if(want&&!dot){dot=document.createElement('span');dot.className='dot';chip.appendChild(dot)}else if(!want&&dot)dot.remove();return}
  if(dot)dot.remove();$('#me-name').textContent=n||'Set your name';sub.textContent=n?'Guest · tap to save your chips':'So the table knows who you are';chip.classList.toggle('unset',!n)}
function refreshAv(){const ini=initial();applyAv($('#av-lobby'),AV,ini);applyAv($('#av-prev'),AV,ini);renderMeChip();
  if(S&&ME>=0)renderSeats(true);
  $('#av-opts').innerHTML=AV_COLORS.map(c=>`<div class="avopt ${AV.kind==='initial'&&AV.color===c?'on':''}" data-color="${c}" style="background:${c}">${ini}</div>`).join('')+AV_EMOJI.map(e=>`<div class="avopt ${AV.kind==='emoji'&&AV.emoji===e?'on':''}" data-emoji="${e}" style="background:#2b1f25">${e}</div>`).join('');
  $$('#av-opts .avopt').forEach(o=>o.onclick=()=>{AV=o.dataset.color?{kind:'initial',color:o.dataset.color}:{kind:'emoji',emoji:o.dataset.emoji};saveAv();SND('pop')})}
function needName(then){if(myName())return true;AFTER_NAME=typeof then==='function'?then:null;openMe(true);return false}
function openMe(ask){
  $('#me-title').textContent=ask?'First, your name':'Your profile';
  $('#me-note').textContent=ask?'Pick a name and a look. Everyone at the table sees them.':'How the table sees you, plus sound settings.';
  $('#me-done').textContent=ask?'Continue':'Done';
  $('#m-me').classList.toggle('ask',!!ask);refreshAv();renderSoundSettings();renderFelts();renderShoutList();renderAcct();openModal('#m-me');if(ACCT&&!ask)send({type:'profile',tz:TZ});
  if(ask)setTimeout(()=>{try{$('#f-name').focus()}catch{}},380)}
function openAv(){openMe(false)}
$('#me-done').onclick=()=>{const f=AFTER_NAME;if(f&&!myName()){nudgeEl($('#f-name'));toast('Type your name first');return}AFTER_NAME=null;$('#m-me').classList.remove('on');if(f)setTimeout(f,150)};
$('#me-chip').onclick=()=>{openMe(false);SND('flick')};
$('#av-prev').onclick=()=>$('#av-file').click();
$('#av-clear').onclick=()=>{AV={kind:'initial',color:'#b8862c'};saveAv()};
$('#f-name').addEventListener('input',()=>{if(ACCT&&myName())ACCT.user.display=myName();refreshAv();try{localStorage.setItem('tete.name',$('#f-name').value)}catch{}sendMe()});
$('#f-name').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#me-done').click()}});
$('#av-file').onchange=()=>{const f=$('#av-file').files[0];if(!f)return;const img=new Image();const fr=new FileReader();fr.onload=()=>{img.onload=()=>{const c=document.createElement('canvas');const s=160;c.width=c.height=s;const x=c.getContext('2d');const m=Math.min(img.width,img.height);x.drawImage(img,(img.width-m)/2,(img.height-m)/2,m,m,0,0,s,s);AV={kind:'photo',data:c.toDataURL('image/jpeg',.82)};saveAv();toast('Photo set')};img.src=fr.result};fr.readAsDataURL(f)};

// ---------- sound settings ----------
const SPK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const SPKX='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>';
function renderSound(){const T=window.TeteSound,m=!T||T.muted;$$('.sndbtn').forEach(b=>{const ico=b.querySelector('.ico')||b;ico.innerHTML=m?SPKX:SPK;b.classList.toggle('off',m);b.setAttribute('aria-label',m?'Game sounds are off':'Game sounds are on');b.title=m?'Game sounds: off':'Game sounds: on'})}
function renderSoundSettings(){const T=window.TeteSound,m=!T||T.muted;if(T&&T.setMusic){$('#mus-on').classList.toggle('on',!!T.musicOn);$('#mus-off').classList.toggle('on',!T.musicOn);$('#mus-vol').value=Math.round(T.musicVolume*100)}$('#snd-on').classList.toggle('on',!m);$('#snd-off').classList.toggle('on',m);$('#snd-vol').value=Math.round((T?T.volume:.7)*100);let io=true;try{io=localStorage.getItem('tete.intro')!=='off'}catch{}$('#intro-on').classList.toggle('on',io);$('#intro-off').classList.toggle('on',!io);$('#say-on').classList.toggle('on',SPEAK);$('#say-off').classList.toggle('on',!SPEAK)}
$('#say-on').onclick=()=>{SPEAK=true;try{localStorage.removeItem('tete.speak')}catch{}renderSoundSettings();sayShout(ME>=0?ME:0,0)};
$('#say-off').onclick=()=>{SPEAK=false;try{localStorage.setItem('tete.speak','off')}catch{}try{speechSynthesis.cancel()}catch{}renderSoundSettings()};
function setMuted(m){const T=window.TeteSound;if(!T)return;T.setMuted(m);if(!m)T.unlock();renderSound();renderSoundSettings();if(!m)setTimeout(()=>SND('chips'),80)}
function toggleSound(){const T=window.TeteSound;if(!T)return;setMuted(!T.muted);toast(T.muted?'Game sounds off':'Game sounds on',1400)}
$('#btn-sound').onclick=toggleSound;
$('#snd-on').onclick=()=>setMuted(false);$('#snd-off').onclick=()=>setMuted(true);
// ---------- music at the table: real Afrobeats, Afrobeat and highlife songs (sound.js), quiet, stepping back when people talk ----------
function musicSync(){const T=window.TeteSound;if(!T||!T.music)return;T.music(!!S&&$('#game').classList.contains('on')&&!(S.dj>=0));renderMusicBtn()}
function setMusicOn(on){const T=window.TeteSound;if(!T||!T.setMusic)return;T.setMusic(on);if(on)T.unlock();musicSync();renderSoundSettings();renderMusicPop();toast(on?'Music on 🎶':'Music off',1300)}
function renderMusicBtn(){const T=window.TeteSound,b=$('#btn-music');if(!b)return;const on=!!(T&&T.musicOn);b.classList.toggle('off',!on);b.title=on?'Music: on':'Music: off';b.setAttribute('aria-label',on?'Music is on':'Music is off')}
function renderMusicPop(){const T=window.TeteSound;if(!T||!T.setMusic)return;renderMusicBtn();const on=!!T.musicOn,s=on?T.song:null;
  $('#sp-mus-on').classList.toggle('on',on);$('#sp-mus-off').classList.toggle('on',!on);$('#sp-mvol').value=Math.round(T.musicVolume*100);$('#sp-next').disabled=!on;
  $('#sp-k').textContent=s?'Now playing':'Music';$('#sp-song').textContent=!on?'Music is off':s?s.title:(T.musicPlaying?'Starting…':'Plays at the table');$('#sp-artist').textContent=s?s.artist:'';
  renderDjBox(on);djMonitor()}
const PHONE=/Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
function renderDjBox(on){const box=$('#sp-dj');if(!box)return;const dj=S&&ME>=0&&!LOCALT?S.dj:-1;$('#sp-next').hidden=dj>=0;
  if(dj>=0){const p=S.players[dj],mine=dj===ME,files=mine&&DJ&&DJ.kind==='files';$('#sp-k').textContent='Now playing';
    $('#sp-song').textContent=!on?'Music is off':mine?(files?(S.djTitle||'Your songs'):DJ&&DJ.kind==='phone'?'Music from your phone':'Music from your tab'):`Music from ${p?p.name:'someone'}`;
    $('#sp-artist').textContent=!on?'':mine?(files?`Song ${DJ.i+1} of ${DJ.list.length} · everyone hears it`:'Everyone at the table hears it'):(S.djTitle||'It keeps playing while people talk')}
  if(dj===ME&&DJ){box.innerHTML=`<div class="setrow"><label for="sp-djvol">Volume for the table</label><input type="range" id="sp-djvol" min="0" max="100" step="5" value="${Math.round(DJ_SEND*100)}"></div><div class="sp-row">${DJ.kind==='files'?'<button type="button" class="btn btn-gold" id="sp-djnext">⏭ Next song</button>':''}<button type="button" class="btn btn-ghost" id="sp-djstop">Stop my music</button></div>`;
    $('#sp-djvol').oninput=e=>setDjSend(+e.target.value/100);$('#sp-djstop').onclick=()=>stopDj();const nx=$('#sp-djnext');if(nx)nx.onclick=()=>djNext()}
  else if(dj>=0||LOCALT||!S)box.innerHTML='';
  else{const locked="Songs saved inside YouTube Music, Spotify or Apple Music can\'t be picked: those apps keep them locked.";
    box.innerHTML=(ANDROID_APP?'<button type="button" class="btn btn-gold btn-wide" id="sp-djphone">🎧 Play music from my phone</button><p class="note" style="margin:6px 0 10px">Start YouTube Music (or any music app) first, then tap this. Android asks first: tap <b>Start</b> (Tete only takes the sound, never your screen). Use earphones, or your mic picks the music up too.</p>':'')
      +(!ANDROID_APP&&/Android/i.test(navigator.userAgent)?'<p class="note" style="margin:0 0 10px">To share YouTube Music from this phone, <a href="/download/tete.apk" class="linkbtn" download>get the Tete app for Android</a>.</p>':'')
      +(DJ_OK?'<button type="button" class="btn btn-ghost btn-wide" id="sp-djgo">🎧 Play music from a tab</button><p class="note" style="margin:6px 0 10px">Play YouTube Music (or any music) in another Chrome tab, tap this, pick that tab and tick <b>Also share tab audio</b>.</p>':'')
      +`<button type="button" class="btn btn-ghost btn-wide" id="sp-djfiles">🎵 Play ${PHONE?'songs from my phone':'song files'}</button><p class="note" style="margin:6px 0 0">${PHONE?'Pick music files (MP3, M4A…) from Files or your downloads.':'Pick music files (MP3, M4A…) from this computer.'} Everyone hears your music, it doesn't dip when people talk, and your mic stays as it is. ${locked}</p>`;
    const g=$('#sp-djgo');if(g)g.onclick=()=>{$('#sndpop').hidden=true;startDj()};const ph=$('#sp-djphone');if(ph)ph.onclick=()=>{$('#sndpop').hidden=true;startPhoneMusic()};$('#sp-djfiles').onclick=()=>pickSongs()}}
// the 🎵 Music button at the table opens a small panel: what's playing, the next song, on or off, and how loud
function openMusicPop(){const p=$('#sndpop'),b=$('#btn-music');renderMusicPop();p.hidden=false;const r=b.getBoundingClientRect(),w=p.offsetWidth,h=p.offsetHeight;p.style.left=Math.round(Math.max(10,Math.min(innerWidth-w-10,r.left+r.width/2-w/2)))+'px';p.style.top=Math.round(Math.max(10,r.top-h-10))+'px';SND('flick');
  const close=e=>{if(e&&e.target&&(p.contains(e.target)||b.contains(e.target)))return;p.hidden=true;document.removeEventListener('pointerdown',close,true);document.removeEventListener('keydown',esc,true)},esc=e=>{if(e.key==='Escape')close()};
  setTimeout(()=>{document.addEventListener('pointerdown',close,true);document.addEventListener('keydown',esc,true)},0)}
$('#btn-music').onclick=()=>{const p=$('#sndpop');if(!p.hidden){p.hidden=true;return}openMusicPop()};
// 🔊 Sounds at the table turns the game's sounds on and off, as in the lobby
$('#btn-fx').onclick=toggleSound;
$('#sp-next').onclick=()=>{const T=window.TeteSound;if(!T||!T.nextSong||!T.musicOn)return;T.unlock();T.nextSong();$('#sp-k').textContent='Music';$('#sp-song').textContent='Next song…';$('#sp-artist').textContent=''};
$('#sp-mus-on').onclick=()=>setMusicOn(true);$('#sp-mus-off').onclick=()=>setMusicOn(false);
$('#sp-mvol').oninput=()=>{if(window.TeteSound&&TeteSound.setMusicVolume)TeteSound.setMusicVolume(+$('#sp-mvol').value/100);$('#mus-vol').value=$('#sp-mvol').value;djMonitor()};
$('#mus-on').onclick=()=>setMusicOn(true);$('#mus-off').onclick=()=>setMusicOn(false);
$('#mus-vol').oninput=()=>{if(window.TeteSound&&TeteSound.setMusicVolume)TeteSound.setMusicVolume(+$('#mus-vol').value/100);djMonitor()};
// each new song shows in the panel; the first time music starts on this phone or laptop, say where its button is
if(window.TeteSound)TeteSound.onSong=(s,skipped)=>{if(!$('#sndpop').hidden)renderMusicPop();if(skipped){toast(`🎵 ${s.title} · ${s.artist}`,2200);return}
  let seen=false;try{seen=localStorage.getItem('tete.musichint')==='1'}catch{}if(seen)return;try{localStorage.setItem('tete.musichint','1')}catch{}
  setTimeout(()=>{if(S)toast('🎵 Music on. Tap Music at the bottom to skip a song or turn it off.',4500)},1500)};
renderMusicBtn();
$('#snd-vol').oninput=()=>{if(window.TeteSound)TeteSound.setVolume(+$('#snd-vol').value/100)};
$('#snd-vol').onchange=()=>SND('chips');
$('#intro-on').onclick=()=>{try{localStorage.removeItem('tete.intro')}catch{}renderSoundSettings()};
$('#intro-off').onclick=()=>{try{localStorage.setItem('tete.intro','off')}catch{}renderSoundSettings()};
$('#intro-replay').onclick=()=>{if(S&&!$('#lobby').classList.contains('on')){toast('Leave the table first, then watch the intro');return}if(window.TeteSound)TeteSound.unlock();$('#m-me').classList.remove('on');AFTER_NAME=null;window.addEventListener('tete:introexit',()=>{ENTERED=false;lobbyEnter()},{once:true});setTimeout(()=>{if(window.TeteIntro)window.TeteIntro.play();else location.href='/?intro'},250)};

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
  WS.onclose=function(ev){if(WS!==this&&WS&&WS.readyState<=1)return;if(ev&&ev.code===4003){CONNECTED=false;toGate();return}gateCheck();CONNECTED=false;PRES_READY=false;hideReqbar();if(navigator.onLine===false)setStatus('off','Offline. Practice against the computer still works; hosting and joining need a connection.');else setStatus('warn','Connection lost. Reconnecting… (the free server can take up to a minute to wake)');$('#conn').textContent='reconnecting…';setTimeout(connect,1500)};
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
function backToLobby(){rtcLeaveAll();S=null;ME=-1;setTimeout(()=>{placeMarks();musicSync()},0);SIDE_MANUAL=null;SIDE_HOLD=-1;$('.room').classList.remove('with-side');$('.me').classList.remove('myturn');IDS=[];REQS=[];$('#reqs').innerHTML='';clearMotion();setTimeout(()=>{renderRooms();renderFriends()},0);$('#game').classList.remove('on');$('#lobby').classList.add('on');$('#btn-join').disabled=false;$('#btn-start').disabled=false;$('#join-note').textContent='Enter the code the host sent you. Just the last four letters works too.';
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)$$('.tiles .tile').forEach((el,i)=>el.animate([{transform:'translateY(-40px) rotate(-8deg) scale(.9)',opacity:0},{transform:'translateY(0px) rotate(0deg) scale(1)',opacity:1}],{duration:520,delay:i*70,easing:'cubic-bezier(.2,1.25,.35,1)',fill:'backwards'}))}
function onMessage(m){
  if(m.type==='joined'){hideReqbar();PENDING_JOIN=null;ME=m.id;if(m.token&&m.code!=='PRACTICE'){SEATS[m.code]=Object.assign({},SEATS[m.code],{token:m.token,rid:m.rid,keep:!!m.keep,t:Date.now()});saveSeats();setCurrent(m.code)}if(!S||$('#lobby').classList.contains('on')){S={code:m.code,players:[],sideBets:[],board:[],participants:[]};enterGame()}if(m.resumed)toast('Back at your seat');return}
  if(m.type==='gone'){if(PENDING_JOIN&&m.code===PENDING_JOIN.code){const pj=PENDING_JOIN;PENDING_JOIN=null;if(SEATS[m.code]){delete SEATS[m.code];saveSeats()}send(pj.msg);return}if(m.code&&SEATS[m.code]){delete SEATS[m.code];saveSeats()}if(!m.code||CURRENT===m.code)setCurrent(null);if(!LOCALT){if(m.final&&m.final.length){if($('#game').classList.contains('on'))backToLobby();setTimeout(()=>showResults(m.final,m.tn,m.owed),350)}else{toast(m.msg,3500);if($('#game').classList.contains('on'))backToLobby()}}renderRooms();return}
  if(m.type==='seal'){const s=SEATS[m.code];if(s){s.seal=m.seal;s.rid=m.rid;s.keep=true;if(S&&S.tableName)s.name=S.tableName;saveSeats()}return}
  if(m.type==='you'){MYID=m.id;if(!m.acct)try{localStorage.setItem('tete.myid',m.id)}catch{}handlePendingFriend();return}
  if(m.type==='voice'){MYVOICE=m.info&&m.info[1]?m.info:null;renderShoutList();return}
  if(m.type==='session'){SESSION=m.token;try{localStorage.setItem('tete.session',m.token)}catch{}if(m.quiet)return;closeModal('#m-auth');$('#au-pass').value='';if(m.welcome)setTimeout(()=>celebrate(m.welcome,'Welcome bonus','chips to start you off'),450);else toast('Signed in. Welcome back');return}
  if(m.type==='account'){setAccount(m);return}
  if(m.type==='members_role'){MO=m;renderMbrBtn();return}
  if(m.type==='members'){MBR=m;MO.waiting=m.waiting.length;renderMbrBtn();if($('#m-members').classList.contains('on'))renderMembers();return}
  if(m.type==='members_ask'){mbrAsk(m.who);return}
  if(m.type==='invite_link'){MBR_FRESH=m.key;toast('Link ready: tap Share to send it',2600);SND('pop');if($('#m-members').classList.contains('on'))renderMembers();return}
  if(m.type==='members_out'){toGate(m.msg||'Members only',true);return}
  if(m.type==='account_lite'){if(!ACCT)return;Object.assign(ACCT,{user:m.user,inPlay:m.inPlay,bonus:m.bonus});renderAcct(true);renderRooms();return}
  if(m.type==='friends'){if(!ACCT)return;Object.assign(ACCT,{friends:m.friends,incoming:m.incoming,outgoing:m.outgoing});syncAcctFriends();renderFriends();renderFriendReqs();renderMeChip();return}
  if(m.type==='friend_req_in'){toast(`${m.from.name} (@${m.from.username}) wants to be friends`,3500);SND('join',{bg:true});buzz([40,30,40]);return}
  if(m.type==='friend_msg'){if($('#m-friends').classList.contains('on')){const el=$('#fr-msg');el.textContent=m.msg;el.className='fr-msg '+(m.ok?'ok':'bad');if(m.ok)$('#fr-user').value=''}else toast(m.msg,3000);if(m.ok)SND('pop');return}
  if(m.type==='auth_error'){showAuthErr(m.msg);return}
  if(m.type==='signed_out'&&m.gate){SESSION=null;ACCT=null;try{localStorage.removeItem('tete.session')}catch{}toGate(m.reason==='asked'?'Signed out':'Please sign in again.',true);return}
  if(m.type==='signed_out'){SESSION=null;ACCT=null;ACCT_FR={};try{localStorage.removeItem('tete.session')}catch{}if(m.reason==='expired')toast('You were signed out. Sign in again from your profile.',3500);else toast('Signed out');renderAcct();renderFriends();renderRooms();return}
  if(m.type==='need_account'){openAuth('up',m.why==='friend'?`Make a free account to be friends with ${m.name||'them'}. It takes ten seconds, and you start with 10,000 chips.`:m.why==='wheel'?'The daily wheel is for account holders. Make one free: you start with 10,000 chips.':'Friend requests need a free account. You start with 10,000 chips.');if(m.why==='friend'&&m.id)PENDING_ACCT=()=>send({type:'friend_add',id:m.id});return}
  if(m.type==='spun'){wheelResult(m);return}
  if(m.type==='rooms'){ROOMS=m.list||[];renderRooms();return}
  if(m.type==='presence'){onPresence(m.list||[]);return}
  if(m.type==='friend_added'){if(ACCT)return;if(m.id&&!FRIENDS[m.id]&&m.id!==MYID){FRIENDS[m.id]={name:m.name||'Friend',av:m.av||null,added:Date.now(),seen:Date.now()};saveFriends();sendMe();toast(`${m.name||'Someone'} added you as a friend`,3000);SND('join');renderFriends()}return}
  if(m.type==='requested'){showReqbar(m.ret?`Asked ${esc(m.host||'the host')} to give you back your seat at <b>${esc(m.room)}</b>…`:`Asked to join <b>${esc(m.room)}</b>. Waiting for ${esc(m.host||'the host')}${m.hostHere?'':' (not at the table right now; your request will wait)'}…`);return}
  if(m.type==='request_cancelled'){hideReqbar();return}
  if(m.type==='declined'){hideReqbar();toast(m.msg,3500);return}
  if(m.type==='invited'){showInvited(m);return}
  if(m.type==='logs'){LOG.length=0;(m.items||[]).forEach(e=>logLocal(e.t,e.cls||''));return}
  if(m.type==='toast'){toast(m.msg,3000);if(SPINNING&&/spun today/.test(m.msg))stopSpin();return}
  if(m.type==='rtc_reset'){for(const [,c] of PC){clearTimeout(c.wob);c.pc.close()}PC.clear();SIGQ.clear();PSID.clear();$$('#voices audio').forEach(a=>{a.srcObject=null;a.remove()});LEVELS.clear();lastSig='';return}
  if(m.type==='error'){hideReqbar();PENDING_JOIN=null;if(m.need==='chips'){showNeedChips(m.msg);return}toast(m.msg,3500);$('#btn-join').disabled=false;$('#btn-start').disabled=false;$('#join-note').textContent=m.msg;return}
  if(m.type==='state'){if(m.ids)IDS=m.ids;applyState(m.st,m.fx||[]);REQS=m.rq||[];renderReqs();renderInviteBadge();return}
  if(m.type==='peer'){if(m.event==='joined')rtcOnPeerJoined(m.id,m.sid);else rtcOnPeerLeft(m.id);return}
  if(m.type==='rtc'){rtcOnSignal(m.from,m.data,m.sid);return}
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
function openFriends(){renderAcct();renderFriends();renderFriendReqs();$('#fr-msg').textContent='';openModal('#m-friends');SND('flick')}
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
function leaveTable(forGood){const code=S&&S.code;if(LOCALT)stopLocal();else send({type:'leave',forGood:!!forGood});if(code&&SEATS[code]&&(forGood||!SEATS[code].keep)){delete SEATS[code];saveSeats()}setCurrent(null);backToLobby();if(forGood)toast('You left the table for good')}
// a standing room asks how you want to go: step away, leave for good, or (host) close it for everyone
$('#btn-leave').onclick=()=>{if(LOCALT||!S||!S.keep){leaveTable(false);return}
  const me=S.players[ME],chips=me?me.chips:0;
  const next=HOST?S.players.find(x=>!x.isBot&&!x.gone&&!x.away&&x.id!==ME):null;
  $('#lv-good-sub').textContent=(ACCT?`Give up your seat. Your ${fmt(chips)} chips go back to your balance.`:`Give up your seat for someone else. Your ${fmt(chips)} table chips go with it.`)+(next?` ${next.name} becomes the host (tap a player and Make host to pick someone else).`:'');
  $('#lv-close').hidden=!HOST;const c=$('#lv-close');c.classList.remove('armed');c.querySelector('b').textContent='Close the room for everyone';
  openModal('#m-leave');SND('flick')};
$('#lv-away').onclick=()=>{closeModal('#m-leave');leaveTable(false)};
$('#lv-good').onclick=()=>{closeModal('#m-leave');leaveTable(true)};
$('#lv-close').onclick=()=>{const c=$('#lv-close');if(!c.classList.contains('armed')){c.classList.add('armed');c.querySelector('b').textContent='Tap again to close the room for everyone';SND('error');return}closeModal('#m-leave');send({type:'close'})};
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
// accounts: friends, balance and history come from the server; guests keep friends on this phone
let SESSION=null,ACCT=null,ACCT_FR={},PENDING_ACCT=null;const TZ=-new Date().getTimezoneOffset();
try{SESSION=localStorage.getItem('tete.session')}catch{}
function FR(){return ACCT?ACCT_FR:FRIENDS}
function identify(){send({type:'id',secret:SECRET,name:myName(),av:publicAv(),friends:Object.keys(FRIENDS),session:SESSION||undefined,tz:TZ});send({type:'voice_get'})}
let meT=null;function sendMe(){clearTimeout(meT);meT=setTimeout(()=>send({type:'me',name:myName(),av:publicAv(),friends:Object.keys(FRIENDS)}),400)}
const ICON={lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',open:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/></svg>'};
function avHTML(av,name,cls='fav'){const a=avStyle(av,(name||'?')[0].toUpperCase());return`<div class="${cls}" style="${a.style}">${esc(a.text)}`}
function ago(t){if(!t)return'';const m=Math.round((Date.now()-t)/60000);if(m<2)return'just now';if(m<60)return m+' min ago';const hh=Math.round(m/60);if(hh<24)return hh+'h ago';return Math.round(hh/24)+'d ago'}
function copyText(text,okMsg){const done=()=>toast(okMsg||'Copied');try{navigator.clipboard.writeText(text).then(done,()=>toast(text,5000))}catch{toast(text,5000)}}
function shareOrCopy(data,okMsg){if(window.TeteAndroid&&TeteAndroid.share){try{TeteAndroid.share(String(data.title||''),String(data.text||''),String(data.url||''));return}catch{}}if(navigator.share){navigator.share(data).catch(e=>{if(e&&e.name!=='AbortError')copyText(data.url,okMsg)})}else copyText(data.url,okMsg)}
function friendLink(){return`${location.origin}/?f=${MYID}&n=${encodeURIComponent(myName()||'A friend')}`}
function shareFriendLink(){if(!MYID){toast('Connecting… try again in a moment');return}if(!needName(shareFriendLink))return;shareOrCopy({title:'Tete 21',text:`Add me as a friend on Tete 21 so we can play together.`,url:friendLink()},'Friend link copied. Paste it to a friend')}
function tableLink(){return`${location.origin}/?t=${S.code}`}
function friendsAt(rid){const F=FR();return Object.keys(F).filter(id=>PRES[id]&&PRES[id].on&&PRES[id].room&&PRES[id].room.rid===rid).map(id=>F[id].name||'A friend')}
function myCodeForRid(rid){for(const [code,s] of Object.entries(SEATS))if(s.rid===rid)return code;if(ACCT&&(ACCT.inPlay||[]).some(x=>x.rid===rid))return'@'+rid;return null}
function returnTo(code){if(code&&code[0]==='@'){if(!CONNECTED){toast('Not connected yet',2500);return}send({type:'return',rid:code.slice(1)});return}const s=SEATS[code];if(!s)return;if(!CONNECTED){toast('Not connected yet',2500);return}setCurrent(code);send({type:'resume',code,token:s.token,seal:s.seal})}
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
function friendState(id){const p=PRES[id]||{};const f=FR()[id];if(p.on&&p.room)return{k:'play',t:`At ${p.room.name}`,o:2};if(p.on)return{k:'on',t:'Online',o:3};return{k:'',t:f&&f.seen?`Last seen ${ago(f.seen)}`:'Offline',o:0}}
function friendIds(){const F=FR();return Object.keys(F).sort((a,b)=>friendState(b).o-friendState(a).o||(F[a].name||'').localeCompare(F[b].name||''))}
function friendRows(ctx){
  return friendIds().map((id,i)=>{const f=FR()[id],s=friendState(id),p=PRES[id]||{};let btn='';
    if(ctx==='invite'){const here=S&&IDS.includes(id);btn=here?'<span class="fstat on">At this table</span>':p.on?`<button class="btn btn-gold" data-inv="${id}">Invite</button>`:'<span class="fstat">Offline</span>'}
    else if(FEDIT)btn=`<button class="btn btn-dark" data-rm="${id}">Remove</button>`;
    else if(p.on&&p.room){const mine=myCodeForRid(p.room.rid);btn=mine?`<button class="btn btn-gold" data-ret="${esc(mine)}">Return</button>`:`<button class="btn ${p.room.pub?'btn-gold':'btn-ghost'}" data-ask="${esc(p.room.rid)}">${p.room.pub?'Join':'Ask to join'}</button>`}
    return`<div class="frow" style="animation-delay:${i*.04}s">${avHTML(f.av,f.name)}<span class="dot ${s.k}"></span></div><div style="min-width:0"><div class="fname">${esc(f.name||'Friend')}</div><div class="fstat ${s.k}">${esc(s.t)}</div></div>${btn}</div>`}).join('');
}
function renderFriends(){
  const ids=friendIds(),n=ids.length,on=ids.filter(id=>PRES[id]&&PRES[id].on).length;
  const cnt=n?(on?`${on} online`:`${n}`):'';$('#friends-count').textContent=cnt;$('#friends-count2').textContent=cnt;
  // lobby strip: an Add button, then faces with online dots
  const inc=ACCT?(ACCT.incoming||[]).length:0;
  $('#fstrip').innerHTML=`<button class="fchip add" id="fs-add" type="button"><span class="fav">+</span>${inc?`<span class="reqdot">${inc}</span>`:''}<span class="fn">${inc?'Requests':'Add'}</span></button>`+ids.slice(0,14).map((id,i)=>{const f=FR()[id],s=friendState(id);return`<button class="fchip" data-fid="${id}" type="button" style="animation-delay:${i*.04}s">${avHTML(f.av,f.name)}<span class="dot ${s.k}"></span></div><span class="fn">${esc(f.name||'Friend')}</span></button>`}).join('')+(n?'':'<p class="empty fs-empty">Share your friend link. One tap from them and you\'ll see when they\'re online.</p>');
  $('#fs-add').onclick=()=>{if(ACCT)openFriends();else shareFriendLink()};$$('#fstrip [data-fid]').forEach(b=>b.onclick=()=>openFriend(b.dataset.fid));
  $('#friends-all').hidden=!n&&!inc;$('#friends-all').textContent=inc?`Requests (${inc})`:'See all';
  // the friends sheet
  $('#friends-edit').hidden=!n;$('#friends-edit').textContent=FEDIT?'Done':'Edit';
  const box=$('#friends');box.innerHTML=n?friendRows('lobby'):'<p class="empty">Add friends to see when they are online and invite them to your table. Share your friend link: they tap it once and you are friends.</p>';
  $$('#friends [data-ask]').forEach(b=>b.onclick=()=>{closeModal('#m-friends');askRoom(b.dataset.ask)});
  $$('#friends [data-ret]').forEach(b=>b.onclick=()=>{closeModal('#m-friends');returnTo(b.dataset.ret)});
  $$('#friends [data-rm]').forEach(b=>b.onclick=()=>removeFriend(b.dataset.rm));
  renderInviteBadge();
}
function removeFriend(id){const F=FR(),nm=F[id]&&F[id].name;delete F[id];if(!ACCT)saveFriends();send({type:'friend_remove',id});toast(`Removed ${nm||'friend'}`);renderFriends()}
function openFriend(id){const f=FR()[id];if(!f)return;const p=PRES[id]||{};const a=avStyle(f.av,(f.name||'?')[0].toUpperCase());const el=$('#pl-av');el.style.cssText=a.style;el.textContent=a.text;
  $('#pl-name').textContent=f.name||'Friend';
  $('#pl-body').innerHTML=p.on?(p.room?`At <b>${esc(p.room.name)}</b> right now`:'Online now'):esc(f.seen?`Last seen ${ago(f.seen)}`:'Offline');
  let h='';if(p.on&&p.room){const mine=myCodeForRid(p.room.rid);h=mine?`<button class="btn btn-gold" data-ret="${esc(mine)}">Return to your seat</button>`:`<button class="btn btn-gold" data-ask="${esc(p.room.rid)}">${p.room.pub?'Join them':'Ask to join them'}</button>`}
  h+=`<button class="btn btn-dark" id="pl-rm">Remove</button><button class="btn btn-ghost" data-close>Close</button>`;
  $('#pl-actions').innerHTML=h;
  $$('#pl-actions [data-ret]').forEach(b=>b.onclick=()=>{closeModal('#m-player');returnTo(b.dataset.ret)});
  $$('#pl-actions [data-ask]').forEach(b=>b.onclick=()=>{closeModal('#m-player');askRoom(b.dataset.ask)});
  $('#pl-rm').onclick=()=>{const b=$('#pl-rm');if(!b.dataset.arm){b.dataset.arm='1';b.textContent='Tap again to remove';return}closeModal('#m-player');removeFriend(id)};
  openModal('#m-player');SND('flick')}
function renderInviteBadge(){const b=$('#invite-badge');if(!b)return;const n=Object.keys(FR()).filter(id=>PRES[id]&&PRES[id].on&&!IDS.includes(id)).length;b.hidden=!n||!!LOCALT;b.textContent=n}
function openInvite(){if(!S||LOCALT)return;$('#inv-room').textContent=S.tableName||'your table';$('#inv-code').textContent=S.code;renderInvite();openModal('#m-invite')}
function renderInvite(){const box=$('#inv-friends');const n=Object.keys(FR()).length;
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
  $('#af-yes').onclick=()=>{closeModal('#m-addfriend');addFriend(id,name,null,true)};$('#af-no').onclick=()=>closeModal('#m-addfriend');openModal('#m-addfriend')}
function addFriend(id,name,av,viaLink){if(!id||id===MYID)return;
  if(ACCT){if(viaLink)send({type:'friend_add',id});else send({type:'friend_req',id});return}
  FRIENDS[id]=Object.assign({},FRIENDS[id],{name:name||(FRIENDS[id]&&FRIENDS[id].name)||'Friend',av:av||(FRIENDS[id]&&FRIENDS[id].av)||null,added:Date.now()});saveFriends();send({type:'friend_add',id});sendMe();toast(`${name||'Friend'} added`);SND('join');renderFriends();if(S)renderSeats()}
function openPlayer(pid){const p=S&&S.players[pid];if(!p||pid===ME||p.gone)return;const id=p.isBot?null:IDS[pid];const a=p.isBot?{style:`background:${p.color}`,text:p.name[0].toUpperCase()}:avStyle(p.av,p.name[0].toUpperCase());const el=$('#pl-av');el.style.cssText=a.style;el.textContent=a.text;
  $('#pl-name').textContent=p.name;$('#pl-body').textContent=`${fmt(p.chips)} chips${p.isBot?' · computer player':''}${p.away?' · away':''}`;
  const isF=id&&FR()[id];const canSpray=S.started&&ME>=0&&!p.gone;const broke=canSpray&&p.chips<S.wager,mine0=S.players[ME]?S.players[ME].chips:0;
  if(broke)$('#pl-body').textContent=`${p.name} is out of chips and sitting out. Give them a buy-in and they're back in from the next hand.`;
  $('#pl-actions').innerHTML=(broke&&mine0>=S.buyIn?`<button class="btn btn-gold" id="pl-give">Give a buy-in (${fmt(S.buyIn)})</button>`:'')+(canSpray&&pid!==ME?`<button class="btn ${broke?'btn-gold':'btn-ghost'}" id="pl-lend">Lend 🤝</button>`:'')+(canSpray?'<button class="btn '+(broke?'btn-ghost':'btn-gold')+'" id="pl-spray">Spray money 💸</button><button class="btn btn-ghost" id="pl-treat">Send a treat 🍹</button>':'')+(p.isBot?'':(!id?'':isF?'<span class="tag you">Friends</span>':'<button class="btn btn-ghost" id="pl-add">Add as a friend</button>'))+(HOST&&!LOCALT&&!p.isBot&&!p.gone&&!p.away&&pid!==S.hostId?'<button class="btn btn-ghost" id="pl-host">Make host</button>':'')+(HOST&&!LOCALT&&!p.gone&&pid!==S.hostId?'<button class="btn btn-ghost kickbtn" id="pl-kick">Remove from the table</button>':'')+'<button class="btn btn-ghost" data-close>Close</button>';
  // the host can take someone off the table, after a second tap to be sure
  const kk=$('#pl-kick');if(kk)kk.onclick=()=>{SND('flick');
    $('#pl-body').textContent=`Take ${p.name} off the table? Their seat goes${S.started&&S.phase>0&&S.phase<6?' and they\'re out of this hand':''}.${p.isBot?'':' They can only come back if you let them in.'}`;
    $('#pl-actions').innerHTML=`<button class="btn kickyes" id="pl-kick-yes">Yes, remove ${esc(p.name)}</button><button class="btn btn-ghost" data-close>Keep them</button>`;
    $('#pl-kick-yes').onclick=()=>{closeModal('#m-player');send({type:'remove',pid});toast(`${p.name} is off the table`,2500)}};
  // the host hands the table over (then they can leave and the game carries on)
  const hb=$('#pl-host');if(hb)hb.onclick=()=>{SND('flick');
    $('#pl-body').textContent=`Make ${p.name} the host? They'll run the table: settings, starting hands and letting people in. You can stay, or leave and the game carries on.`;
    $('#pl-actions').innerHTML=`<button class="btn btn-gold" id="pl-host-yes">Yes, make ${esc(p.name)} host</button><button class="btn btn-ghost" data-close>Not now</button>`;
    $('#pl-host-yes').onclick=()=>{closeModal('#m-player');send({type:'make_host',pid});toast(`${p.name} is the host now`,2500);SND('pop')}};
  const add=$('#pl-add');if(add)add.onclick=()=>{closeModal('#m-player');addFriend(id,p.name,p.av)};
  const sp=$('#pl-spray');if(sp)sp.onclick=()=>{const w=S.wager||50,mine=S.players[ME]?S.players[ME].chips:0;$('#pl-body').innerHTML=`Spray ${esc(p.name)} from your ${fmt(mine)} chips:<div class="opts sprayopts">${[w,w*2,w*5,w*10].map(v=>`<button type="button" data-amt="${v}" ${v>mine?'disabled':''}>${fmt(v)}</button>`).join('')}</div>`;
    $$('#pl-body [data-amt]').forEach(b=>b.onclick=()=>{closeModal('#m-player');act({type:'spray',to:pid,amt:+b.dataset.amt})});SND('flick')};
  const tb=$('#pl-treat');if(tb)tb.onclick=()=>{closeModal('#m-player');openTreats(pid)};
  const gv=$('#pl-give');if(gv)gv.onclick=()=>{closeModal('#m-player');act({type:'spray',to:pid,amt:S.buyIn})};
  const lb=$('#pl-lend');if(lb)lb.onclick=()=>{closeModal('#m-player');setTimeout(()=>openLend(pid),180)};
  openModal('#m-player');SND('flick')}
function onPresence(list){const first=!PRES_READY;PRES_READY=true;const lobby=$('#lobby').classList.contains('on');
  for(const p of list){const was=PRES[p.id];PRES[p.id]={on:!!p.on,room:p.room||null};const f=FR()[p.id];if(!f)continue;
    if(p.on){f.seen=Date.now();if(p.name)f.name=p.name;if(p.av!==undefined)f.av=p.av;if(!first&&lobby&&(!was||!was.on)){toast(`${f.name||'A friend'} is online`,2200);SND('pop')}}
    else if(was&&was.on){f.seen=Date.now()}}
  if(!ACCT)saveFriends();renderFriends();renderRooms();if($('#m-invite').classList.contains('on'))renderInvite()}
// friend link (?f=id&n=name)
try{const u=new URL(location.href);const f=u.searchParams.get('f');if(f&&/^[0-9a-f]{16}$/.test(f))PENDING_FRIEND={id:f,name:(u.searchParams.get('n')||'').slice(0,20)};
  if(f){u.searchParams.delete('f');u.searchParams.delete('n');history.replaceState(null,'',u.pathname+(u.search?u.search:''))}}catch{}
function handlePendingFriend(){if(!PENDING_FRIEND||!MYID)return;const pf=PENDING_FRIEND;PENDING_FRIEND=null;if(pf.id===MYID){toast('That is your own friend link. Send it to a friend');return}if(FR()[pf.id]){toast(`You and ${FR()[pf.id].name||'they'} are already friends`);return}askAddFriend(pf.id,pf.name)}
setInterval(()=>{if($('#lobby').classList.contains('on'))renderFriends()},60000);


// ---------- your account: balance, level, history, the daily wheel ----------
function syncAcctFriends(){const old=ACCT_FR;ACCT_FR={};for(const f of (ACCT.friends||[]))ACCT_FR[f.id]={name:f.name,username:f.username,av:f.av,seen:(old[f.id]&&old[f.id].seen)||0}}
function setAccount(m){const first=!ACCT;ACCT=m;syncAcctFriends();
  // the account's name and look are what the table sees
  const u=m.user;if(u.display&&u.display!==myName()){$('#f-name').value=u.display;try{localStorage.setItem('tete.name',u.display)}catch{}}
  if(u.av&&AV.kind!=='photo'&&JSON.stringify(u.av)!==JSON.stringify(AV)){AV=u.av;try{localStorage.setItem('tete.av',JSON.stringify(AV))}catch{}}
  refreshAv();renderAcct();renderFriends();renderFriendReqs();renderRooms();
  if(first){let w=0;try{w=+localStorage.getItem('tete.welcome')||0;localStorage.removeItem('tete.welcome')}catch{}if(w){const go=()=>setTimeout(()=>celebrate(w,'Welcome bonus','chips to start you off'),500);if(window.TETE_INTRO==='done'||!document.getElementById('intro'))go();else addEventListener('tete:introdone',go,{once:true})}}
  if(first&&PENDING_ACCT){const f=PENDING_ACCT;PENDING_ACCT=null;setTimeout(f,300)}}
// ---------- members only ----------
// The owner (Meka) lets people in: the lobby's Members button (with how many are waiting), the Members sheet, and a
// card that drops in when someone asks. Anyone else lands here only once they've been let in; if they're taken off,
// or sign out, they go back to the sign-in page.
let MO={on:0,owner:0,forced:0,waiting:0},MBR=null,MBR_FRESH=null,MBR_INVN=1,MBR_ASK=null,MBR_ASKT=null;
// a lost connection might mean you're no longer let in (signed out elsewhere, taken off): ask the server, at most every 20 s
let GATECHK=0;function gateCheck(){if(Date.now()-GATECHK<20000)return;GATECHK=Date.now();fetch('/api/me',{cache:'no-store',credentials:'same-origin'}).then(r=>r.json()).then(v=>{if(v&&v.on&&v.status!=='yes'&&v.status!=='owner')toGate('Members only',true)}).catch(()=>{})}
function toGate(msg,force){let last=0;try{last=+sessionStorage.getItem('tete.gate')||0}catch{}
  if(!force&&Date.now()-last<8000){setStatus('warn','Members only: ask Meka to let you in, then reload.');return}
  try{sessionStorage.setItem('tete.gate',String(Date.now()))}catch{}
  if(msg)toast(msg,2400);setTimeout(()=>location.replace(location.pathname+location.search),msg?1300:0)}
function renderMbrBtn(){const b=$('#btn-members');if(!b)return;const was=+(b.dataset.n||0),n=MBR?MBR.waiting.length:(MO.waiting||0);
  b.hidden=!MO.owner;const bd=$('#mbr-badge');bd.hidden=!n;bd.textContent=n;b.dataset.n=n;
  b.setAttribute('aria-label',n?`Members: ${n} waiting to be let in`:'Members: who can play');
  if(n>was&&!matchMedia('(prefers-reduced-motion: reduce)').matches){b.classList.remove('ping');void b.offsetWidth;b.classList.add('ping')}}
function openMembers(){if(!MO.owner)return;send({type:'members'});renderMembers();openModal('#m-members');SND('flick')}
const invUrl=k=>location.origin+'/?key='+encodeURIComponent(k);
function shareInvite(k){shareOrCopy({title:'Tete 21',text:`${myName()||'Meka'} invited you to Tete 21. Open the link, make an account, and you're straight in.`,url:invUrl(k)},'Invite link copied. Send it to your friend.')}
function invRow(x,i){const until=new Date(x.exp).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}),who=x.names&&x.names.length?' · '+x.names.map(esc).join(', '):'';
  const st=x.live?`used ${x.used} of ${x.max} · until ${until}${who}`:x.used>=x.max?`used${who}`:'expired';
  return`<div class="inv ${x.live?'':'dead'} ${x.key===MBR_FRESH?'fresh':''}" data-key="${esc(x.key)}" style="animation-delay:${i*.04}s"><span class="tk" aria-hidden="true">🎟</span><div style="min-width:0"><div class="fname">Invite for ${x.max===1?'1 person':'up to '+x.max+' people'}</div><div class="fstat">${st}</div></div><div class="acts">${x.live?'<button class="btn btn-gold" data-share type="button">Share</button><button class="btn btn-ghost" data-cancel type="button">Cancel</button>':''}</div></div>`}
function renderMembers(){
  const m=MBR,body=$('#mbr-body');if(!body)return;
  if(!m){body.innerHTML='<p class="mempty">Loading…</p>';return}
  $('#mbr-count').textContent=m.yes.length+(m.yes.length===1?' member':' members');
  $('#mbr-note').textContent=m.on?'Only people you let in can open Tete. Anyone else gets a sign-in page and asks you first.':'Members only is off: anyone with the link can play.';
  const hands=p=>p.hands?`${p.hands} hand${p.hands===1?'':'s'} played`:'new to Tete';
  const row=(p,i,meta,acts)=>`<div class="frow" data-id="${esc(p.id)}" style="animation-delay:${i*.035}s">${avHTML(p.av,p.name||p.user)}${p.here?'<span class="dot on"></span>':''}</div><div style="min-width:0"><div class="fname">${esc(p.name||p.user)}</div><div class="fstat">@${esc(p.user)}${meta?' · '+meta:''}</div></div><div class="acts">${acts}</div></div>`;
  let h='';
  if(m.waiting.length)h+=`<div class="msec waiting"><h3 class="subh">Waiting for you · ${m.waiting.length}</h3>${m.waiting.map((p,i)=>row(p,i,`asked ${ago(p.asked)} · ${hands(p)}`,'<button class="btn btn-gold" data-yes type="button">Let in</button><button class="btn btn-ghost" data-no type="button">Not now</button>')).join('')}</div>`;
  const invs=m.invites.filter(x=>x.live).concat(m.invites.filter(x=>!x.live).slice(0,3));
  h+=`<div class="msec"><h3 class="subh">Invite a friend</h3><p class="note" style="margin-top:0">A link that lets them straight in, no waiting. It works for 3 days.</p><div class="invmake"><div class="seg sm" id="mbr-invn"><button type="button" data-n="1" class="${MBR_INVN===1?'on':''}">1 person</button><button type="button" data-n="5" class="${MBR_INVN===5?'on':''}">Up to 5</button></div><button class="btn btn-gold" id="mbr-invnew" type="button">Make a link</button></div>${invs.map(invRow).join('')}</div>`;
  h+=`<div class="msec"><h3 class="subh">Members · ${m.yes.length}</h3>${m.yes.length?m.yes.map((p,i)=>row(p,i,p.via==='invite link'?'came with your invite':`let in ${ago(p.at)}`,'<button class="btn btn-ghost" data-rm type="button">Remove</button>')).join(''):'<p class="mempty">Nobody yet. People you let in show here.</p>'}</div>`;
  if(m.no.length)h+=`<div class="msec"><h3 class="subh">Not let in · ${m.no.length}</h3>${m.no.map((p,i)=>row(p,i,ago(p.at),'<button class="btn btn-ghost" data-yes type="button">Let in</button>')).join('')}</div>`;
  if(m.others.length)h+=`<div class="msec"><h3 class="subh">Everyone else with an account · ${m.othersTotal}</h3><p class="note" style="margin-top:0">They made accounts before members only. They ask when they next come back, or you can let them in now.</p>${m.others.map((p,i)=>row(p,i,hands(p),'<button class="btn btn-ghost" data-yes type="button">Let in</button>')).join('')}${m.othersTotal>m.others.length?`<p class="note more">and ${m.othersTotal-m.others.length} more</p>`:''}</div>`;
  h+=m.forced?'<p class="note">Members only is switched off on the server.</p>':`<div class="setrow mswitch"><span>Members only<small>${m.on?'On: only people you let in can play':'Off: anyone with the link can play'}</small></span><div class="seg sm"><button type="button" id="mbr-on" class="${m.on?'on':''}">On</button><button type="button" id="mbr-off" class="${m.on?'':'on'}">Off</button></div></div>`;
  body.innerHTML=h;
  body.querySelectorAll('.frow').forEach(r=>{const id=r.dataset.id,y=r.querySelector('[data-yes]'),n=r.querySelector('[data-no]'),rm=r.querySelector('[data-rm]');
    if(y)y.onclick=()=>{r.classList.add('go-yes');SND('pop');buzz(20);send({type:'member_set',id,s:'yes'})};
    if(n)n.onclick=()=>{r.classList.add('go-no');send({type:'member_set',id,s:'no'})};
    if(rm)rm.onclick=()=>{if(!rm.dataset.arm){rm.dataset.arm='1';rm.textContent='Tap again';setTimeout(()=>{if(rm.isConnected){delete rm.dataset.arm;rm.textContent='Remove'}},3500);return}r.classList.add('go-no');send({type:'member_set',id,s:'no'})}});
  const seg=$('#mbr-invn');if(seg)seg.querySelectorAll('button').forEach(b=>b.onclick=()=>{MBR_INVN=+b.dataset.n;seg.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b))});
  const nb=$('#mbr-invnew');if(nb)nb.onclick=()=>{nb.disabled=true;send({type:'invite_new',max:MBR_INVN});setTimeout(()=>{if(nb.isConnected)nb.disabled=false},1500)};
  body.querySelectorAll('.inv').forEach(r=>{const k=r.dataset.key,sh=r.querySelector('[data-share]'),c=r.querySelector('[data-cancel]');
    if(sh)sh.onclick=()=>shareInvite(k);
    if(c)c.onclick=()=>{if(!c.dataset.arm){c.dataset.arm='1';c.textContent='Tap again';setTimeout(()=>{if(c.isConnected){delete c.dataset.arm;c.textContent='Cancel'}},3000);return}r.classList.add('dead');send({type:'invite_cancel',key:k})}});
  const on=$('#mbr-on'),off=$('#mbr-off');
  if(on)on.onclick=()=>{if(!m.on)send({type:'members_open',open:false})};
  if(off)off.onclick=()=>{if(!m.on)return;if(!off.dataset.arm){off.dataset.arm='1';off.textContent='Sure?';toast('Off means anyone with the link can play. Tap again to open Tete to everyone.',3500);setTimeout(()=>{if(off.isConnected){delete off.dataset.arm;off.textContent='Off'}},4000);return}send({type:'members_open',open:true})};
}
function mbrAsk(who){if(!who||!MO.owner)return;MBR_ASK=who;const el=$('#mbr-ask');
  $('#mbr-ask-av').innerHTML=avHTML(who.av,who.name||who.user)+'</div>';$('#mbr-ask-name').textContent=who.name||who.user;
  $('#mbr-ask-sub').textContent=`@${who.user} wants to join Tete`+(who.hands?` · ${who.hands} hands played`:'');
  el.classList.remove('out');el.hidden=false;SND('join',{bg:true});buzz([40,30,40]);clearTimeout(MBR_ASKT);MBR_ASKT=setTimeout(hideMbrAsk,30000)}
function hideMbrAsk(){const el=$('#mbr-ask');if(el.hidden)return;el.classList.add('out');setTimeout(()=>{el.hidden=true;el.classList.remove('out')},360)}
$('#btn-members').onclick=openMembers;
$('#mbr-ask-yes').onclick=()=>{if(MBR_ASK){send({type:'member_set',id:MBR_ASK.id,s:'yes'});toast(`${MBR_ASK.name||MBR_ASK.user} is in`);SND('pop')}hideMbrAsk()};
$('#mbr-ask-no').onclick=()=>{if(MBR_ASK)send({type:'member_set',id:MBR_ASK.id,s:'no'});hideMbrAsk()};
$('#mbr-ask-x').onclick=hideMbrAsk;
function until(t){const ms=Math.max(0,t-Date.now()),h=Math.floor(ms/36e5),mn=Math.ceil((ms%36e5)/6e4);return h?`${h}h ${mn}m`:`${mn} min`}
let STATSIG='';
function renderAcct(lite){
  const on=!!ACCT;$('#m-me').classList.toggle('acct',on);$('#m-friends').classList.toggle('acct',on);
  $('#f-name-lbl').textContent=on?'Display name (what the table sees)':'Your name at the table';
  renderMeChip();if(!on)return;
  const u=ACCT.user;
  if(!$('#m-me').classList.contains('ask')){$('#me-title').textContent=u.display;$('#me-note').textContent='@'+u.username}
  $('#my-handle').textContent='@'+u.username;
  $('#acct-lv').textContent='Lv '+u.level;$('#acct-title').textContent=u.title;$('#acct-xp').style.width=Math.max(3,Math.min(100,(u.xp-u.lvFrom)/Math.max(1,u.lvTo-u.lvFrom)*100))+'%';
  countTo($('#acct-bal'),u.balance);
  const ip=ACCT.inPlay||[],tot=ip.reduce((a,x)=>a+x.chips,0);$('#acct-inplay').textContent=tot?`${fmt(tot)} of it is on ${ip.length>1?ip.length+' tables':'the table at '+ip[0].name} right now.`:'All of it is free to play.';
  const wb=$('#btn-wheel'),rd=!!(ACCT.bonus&&ACCT.bonus.ready);wb.classList.toggle('ready',rd);wb.textContent=rd?'Spin the wheel':'Wheel in '+until(ACCT.bonus.next);
  const st=u.stats||{},sig=JSON.stringify(st);
  if(sig!==STATSIG){STATSIG=sig;const rate=st.hands?Math.round(st.wins/st.hands*100)+'%':'–';
    $('#acct-stats').innerHTML=[['Hands',fmt(st.hands||0)],['Wins',fmt(st.wins||0)],['Win rate',rate],['Biggest win',st.biggest?'+'+fmt(st.biggest):'–'],['Adasi',fmt(st.adasi||0)],['Best streak',fmt(st.best||0)]].map(([k,v],i)=>`<div class="stat" style="animation-delay:${i*.04}s"><b>${v}</b><span>${k}</span></div>`).join('')}
  if(!lite)renderHistory();
}
// the last 14 days: green up, red down, tap a day for the details
function renderHistory(){
  const now=new Date(),key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const by={};(ACCT.daily||[]).forEach(r=>by[r.d]=r);
  const rows=[];for(let i=13;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);rows.push({d,r:by[key(d)]||null})}
  const max=Math.max(1,...rows.map(x=>x.r?Math.abs(x.r.net):0));
  $('#acct-chart').innerHTML=rows.map((x,i)=>{const n=x.r?x.r.net:0;return`<button class="col" type="button" data-i="${i}" aria-label="${x.d.toDateString()}"><i class="${!n?'none':n>0?'up':'down'}" style="height:0%"></i></button>`}).join('');
  $('#acct-days').innerHTML=rows.map((x,i)=>`<span${i===13?' style="color:var(--gold-hi);font-weight:700"':''}>${'SMTWTFS'[x.d.getDay()]}</span>`).join('');
  requestAnimationFrame(()=>requestAnimationFrame(()=>$$('#acct-chart .col i').forEach((el,i)=>{const r=rows[i].r;if(r&&r.net)el.style.height=Math.max(4,Math.abs(r.net)/max*48)+'%'})));
  const sum=rows.reduce((a,x)=>a+(x.r?x.r.net:0),0),cls=v=>v>=0?'up':'down',sg=v=>(v>=0?'+':'')+fmt(v);
  $('#chart-tip').innerHTML=rows.some(x=>x.r)?`Two weeks: <b class="${cls(sum)}">${sg(sum)}</b>. Tap a day for details.`:'Play a few hands and your days show up here.';
  $$('#acct-chart .col').forEach(b=>b.onclick=()=>{$$('#acct-chart .col').forEach(x=>x.classList.toggle('sel',x===b));const x=rows[+b.dataset.i],r=x.r,day=x.d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
    $('#chart-tip').innerHTML=r?`${day}: <b class="${cls(r.net)}">${sg(r.net)}</b> over ${r.hands} hand${r.hands>1?'s':''}, ${r.wins} won`:`${day}: no hands played`;SND('flick')});
  const rec=ACCT.recent||[];
  $('#acct-recent').innerHTML=rec.length?rec.map((h,i)=>`<div class="rec" style="animation-delay:${i*.03}s"><span>${esc(h.table||'Table')}${h.adasi?' · <b style="color:var(--gold-hi)">Adasi!</b>':h.total===21?' · 21':''}</span><b class="d ${h.delta>=0?'up':'down'}">${h.delta>=0?'+':''}${fmt(h.delta)}</b><small>${ago(h.at)}${h.won?' · won the pot':''}</small></div>`).join(''):'<p class="empty">No hands yet. Each hand you play lands here.</p>';
}
$('#btn-wheel').onclick=()=>openWheel();
// sign up and sign in
let AUTH_MODE='up';
function openAuth(mode,why){if(AFTER_NAME){PENDING_ACCT=AFTER_NAME;AFTER_NAME=null}AUTH_MODE=mode||'up';setAuthMode(AUTH_MODE);$('#auth-why').textContent=why||(AUTH_MODE==='up'?'Keep your chips, friends and history on any phone or computer. You start with 10,000 chips.':'Welcome back. Sign in to get your chips and friends.');$('#auth-err').hidden=true;$('#m-me').classList.remove('on');openModal('#m-auth');SND('flick');setTimeout(()=>{try{$('#au-user').focus()}catch{}},380)}
function setAuthMode(md){AUTH_MODE=md;$('#auth-up').classList.toggle('on',md==='up');$('#auth-in').classList.toggle('on',md==='in');$('#auth-title').textContent=md==='up'?'Create your account':'Sign in';$('#au-go').textContent=md==='up'?'Create account':'Sign in';$('#au-pass').setAttribute('autocomplete',md==='up'?'new-password':'current-password');$('#au-hint').hidden=md!=='up';$('#auth-err').hidden=true}
function showAuthErr(t){const e=$('#auth-err');e.textContent=t;e.hidden=false;e.style.animation='none';void e.offsetWidth;e.style.animation='';$('#au-go').disabled=false;SND('error')}
$('#auth-up').onclick=()=>setAuthMode('up');$('#auth-in').onclick=()=>setAuthMode('in');
$('#au-show').onclick=()=>{const p=$('#au-pass');p.type=p.type==='password'?'text':'password';$('#au-show').textContent=p.type==='password'?'Show':'Hide'};
$('#au-go').onclick=()=>{const u=$('#au-user').value.trim(),pw=$('#au-pass').value;if(!u||!pw){showAuthErr('Fill in your username and password.');return}if(AUTH_MODE==='up'&&!/^@?[A-Za-z0-9_]{3,16}$/.test(u)){showAuthErr('Usernames are 3 to 16 letters, numbers or _ (no spaces).');return}if(!CONNECTED){showAuthErr('Not connected yet. Try again in a moment.');return}
  $('#auth-err').hidden=true;$('#au-go').disabled=true;setTimeout(()=>{$('#au-go').disabled=false},3000);send({type:AUTH_MODE==='up'?'signup':'signin',username:u,password:pw,display:myName()||u.replace(/^@/,''),av:publicAv()})};
$('#au-user').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#au-pass').focus()}});
$('#au-pass').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#au-go').click()}});
$('#me-signup').onclick=()=>openAuth('up');$('#me-signin').onclick=()=>openAuth('in');$('#me-ask-up').onclick=()=>openAuth('up');$('#me-ask-in').onclick=()=>openAuth('in');$('#fr-signup').onclick=()=>{closeModal('#m-friends');openAuth('up')};
$('#me-signout').onclick=()=>{const b=$('#me-signout');if(!b.dataset.arm){b.dataset.arm='1';b.textContent='Tap again to sign out';setTimeout(()=>{delete b.dataset.arm;b.textContent='Sign out'},3500);return}send({type:'signout'});closeModal('#m-me')};
function showNeedChips(msg){$('#btn-join').disabled=false;$('#btn-start').disabled=false;$('#join-note').textContent='';closeSheets();$('#info-title').textContent='Not enough chips';const rd=ACCT&&ACCT.bonus&&ACCT.bonus.ready;$('#info-body').innerHTML=esc(msg)+(rd?'<p style="margin:14px 0 0"><button class="btn btn-gold" id="info-wheel" type="button">Spin the daily wheel</button></p>':'');openModal('#m-info');const b=$('#info-wheel');if(b)b.onclick=()=>{closeModal('#m-info');openWheel()};SND('error')}
// friend requests by username
function renderFriendReqs(){const box=$('#fr-reqs');if(!box)return;if(!ACCT){box.innerHTML='';return}const inc=ACCT.incoming||[],out=ACCT.outgoing||[];
  const row=(r,btns)=>`<div class="reqrow">${avHTML(r.av,r.name)}</div><div style="min-width:0"><div class="fname">${esc(r.name)}</div><div class="fstat">@${esc(r.username)}</div></div>${btns}</div>`;
  box.innerHTML=(inc.length?'<h3 class="subh">Asking to be your friend</h3>'+inc.map(r=>row(r,`<button class="btn btn-gold" data-fyes="${r.id}" type="button">Accept</button><button class="btn btn-ghost" data-fno="${r.id}" type="button">Not now</button>`)).join(''):'')+
    (out.length?'<h3 class="subh">Waiting for them</h3>'+out.map(r=>row(r,`<span class="fstat">Sent</span><button class="btn btn-ghost" data-fcancel="${r.id}" type="button">Cancel</button>`)).join(''):'')+((inc.length||out.length)&&Object.keys(ACCT_FR).length?'<h3 class="subh">Your friends</h3>':'');
  box.querySelectorAll('[data-fyes]').forEach(b=>b.onclick=()=>{send({type:'friend_ans',id:b.dataset.fyes,yes:true});SND('join');b.closest('.reqrow').style.opacity=.4});
  box.querySelectorAll('[data-fno]').forEach(b=>b.onclick=()=>{send({type:'friend_ans',id:b.dataset.fno,yes:false});b.closest('.reqrow').style.opacity=.4});
  box.querySelectorAll('[data-fcancel]').forEach(b=>b.onclick=()=>{send({type:'friend_cancel',id:b.dataset.fcancel});b.closest('.reqrow').style.opacity=.4})}
$('#fr-add').onclick=()=>{const u=$('#fr-user').value.trim();if(!u){nudgeEl($('#fr-user'));return}const m=$('#fr-msg');m.textContent='Sending…';m.className='fr-msg';send({type:'friend_req',username:u})};
$('#fr-user').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#fr-add').click()}});
// the daily wheel: the server picks the prize, the wheel spins to it
const WHEEL_COLORS=['#7b1f2b','#0f5a3a','#2b1f25','#a17628','#7b1f2b','#0f5a3a','#2b1f25','#5b2d82'];
let WHEEL_ROT=0,SPINNING=false,PRESPIN=null,SPIN_T=null;
function buildWheel(){const vals=(ACCT&&ACCT.bonus&&ACCT.bonus.wheel)||[500,1000,750,2500,500,1500,1000,5000],n=vals.length,R=100;let h='<circle r="108" fill="#3a2414" stroke="#d9b25f" stroke-width="3"/>';
  const pt=a=>[R*Math.sin(a*Math.PI/180),-R*Math.cos(a*Math.PI/180)];
  for(let i=0;i<n;i++){const [x0,y0]=pt((i-.5)*360/n),[x1,y1]=pt((i+.5)*360/n);h+=`<path d="M0,0 L${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z" fill="${WHEEL_COLORS[i%WHEEL_COLORS.length]}" stroke="#d9b25f" stroke-width="1.2"/>`;
    const v=vals[i],lbl=v>=1000?(v/1000)+'K':String(v);h+=`<text transform="rotate(${i*360/n}) translate(0,-66)" text-anchor="middle" dominant-baseline="middle" fill="${v>=2500?'#fff3c4':'#f6efdc'}" font-family="Cinzel,Georgia,serif" font-weight="700" font-size="${v>=5000?19:15}">${lbl}</text>`}
  h+='<circle r="100" fill="none" stroke="#fff3c4" stroke-opacity=".45" stroke-width="1"/>';
  for(let i=0;i<24;i++){const a=i*15*Math.PI/180;h+=`<circle class="bulb${i%2?' alt':''}" cx="${(104*Math.sin(a)).toFixed(2)}" cy="${(-104*Math.cos(a)).toFixed(2)}" r="2.6"/>`}
  const svg=$('#wheel');svg.innerHTML=h;svg.style.transform=`rotate(${WHEEL_ROT}deg)`}
function updateWheelUI(){const b=ACCT&&ACCT.bonus,go=$('#wheel-go');if(b&&b.ready){go.disabled=false;go.textContent='SPIN';$('#wheel-note').textContent='One free spin every day. Tap the middle.'}else{go.disabled=true;go.textContent='DONE';$('#wheel-note').textContent=b?`You've had today's spin. The next one is in ${until(b.next)}.`:''}}
function openWheel(){if(!ACCT){openAuth('up','The daily wheel is for account holders. Make one free: you start with 10,000 chips.');return}buildWheel();$('#wheel-res').innerHTML='';updateWheelUI();$('#m-me').classList.remove('on');openModal('#m-wheel');SND('flick')}
function wheelAngle(el){const t=getComputedStyle(el).transform;const mt=t&&t.match(/matrix\(([^)]+)\)/);if(!mt)return WHEEL_ROT;const [a,b]=mt[1].split(',').map(Number);return Math.atan2(b,a)*180/Math.PI}
function stopSpin(){if(PRESPIN){const r=wheelAngle($('#wheel'));PRESPIN.cancel();PRESPIN=null;WHEEL_ROT=r;$('#wheel').style.transform=`rotate(${r}deg)`}clearTimeout(SPIN_T);SPINNING=false;updateWheelUI()}
$('#wheel-go').onclick=()=>{if(SPINNING||!ACCT||!ACCT.bonus||!ACCT.bonus.ready)return;SPINNING=true;$('#wheel-go').disabled=true;if(window.TeteSound)TeteSound.unlock();send({type:'spin'});SND('whoosh');
  const svg=$('#wheel');PRESPIN=svg.animate([{transform:`rotate(${WHEEL_ROT}deg)`},{transform:`rotate(${WHEEL_ROT+360}deg)`}],{duration:520,iterations:Infinity});SPIN_T=setTimeout(()=>{if(SPINNING){stopSpin();toast('The wheel is not answering. Try again in a moment.')}},8000)};
function wheelResult(m){
  const svg=$('#wheel'),n=8;clearTimeout(SPIN_T);
  if(!$('#m-wheel').classList.contains('on')){buildWheel();openModal('#m-wheel')}
  const cur=PRESPIN?wheelAngle(svg):WHEEL_ROT;if(PRESPIN){PRESPIN.cancel();PRESPIN=null}
  const jitter=(Math.random()-.5)*(360/n)*.6,target=cur+360*5+((((-m.seg*360/n)-cur)%360)+360)%360+jitter;
  svg.style.transform=`rotate(${cur}deg)`;
  const an=svg.animate([{transform:`rotate(${cur}deg)`},{transform:`rotate(${target}deg)`}],{duration:4300,easing:'cubic-bezier(.12,.62,.1,1)',fill:'forwards'});
  let last=Math.floor((cur+180/n)/(360/n));const ptr=$('#wheel-ptr');
  const tick=()=>{if(an.playState!=='running')return;const k=Math.floor((wheelAngle(svg)+180/n)/(360/n));if(k!==last){last=k;SND('tick');ptr.classList.remove('tick');void ptr.offsetWidth;ptr.classList.add('tick')}requestAnimationFrame(tick)};requestAnimationFrame(tick);
  an.onfinish=()=>{WHEEL_ROT=((target%360)+360)%360;svg.style.transform=`rotate(${WHEEL_ROT}deg)`;an.cancel();SPINNING=false;
    if(ACCT){ACCT.user.balance=m.balance;ACCT.bonus=m.bonus}renderAcct(true);updateWheelUI();
    $('#wheel-res').innerHTML=`+${fmt(m.prize)}<small>added to your balance</small>`;
    setTimeout(()=>celebrate(m.prize,m.prize>=5000?'Jackpot!':m.prize>=2500?'Big win!':'You won','chips from the daily wheel'),350)};
}
// the big moments: welcome chips, wheel prizes
function celebrate(amount,title,sub){
  SND(amount>=5000?'adasi':'big21',{bg:true});buzz([60,40,120]);
  const c=document.createElement('div');c.className='celebrate';c.innerHTML=`<div class="cel"><div class="cel-t">${esc(title)}</div><div class="cel-a gold">+0</div><div class="cel-s">${esc(sub)}</div></div>`;document.body.appendChild(c);
  const a=c.querySelector('.cel-a');a.animate([{transform:'scale(.3)',opacity:0},{offset:.6,transform:'scale(1.12)',opacity:1},{transform:'scale(1)',opacity:1}],{duration:650,easing:'cubic-bezier(.2,.9,.3,1.3)'});
  const t0=performance.now(),dur=1300;const step=t=>{const k=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-k,3);a.textContent='+'+fmt(Math.round(amount*e));if(k<1&&c.isConnected)requestAnimationFrame(step)};requestAnimationFrame(step);
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)for(let i=0;i<46;i++){const ch=document.createElement('span');ch.className='chip rain '+['c1','c5','c25','c100','c500'][i%5];ch.style.left=(Math.random()*100)+'%';c.appendChild(ch);
    ch.animate([{transform:'translateY(-40px) rotateX(0deg) rotate(0deg)'},{transform:`translateY(${innerHeight+80}px) rotateX(${720+Math.random()*720}deg) rotate(${(Math.random()-.5)*720}deg)`}],{duration:1600+Math.random()*1400,delay:Math.random()*900,easing:'cubic-bezier(.4,.1,.7,1)',fill:'both'})}
  const close=()=>{if(!c.isConnected)return;c.animate([{opacity:1},{opacity:0}],{duration:300,fill:'forwards'}).onfinish=()=>c.remove()};c.onclick=close;setTimeout(close,3800)}

// ---------- state ----------
function applyState(o,fx){
  const prev=S;const before=prev&&prev.players&&prev.players.length?snapCards():new Map();
  S={dj:o.dj==null?-1:o.dj,djTitle:o.djt||'',tableName:o.tn,wager:o.w,buyIn:o.bi,decks:o.dk,timer:o.tm,side:!!o.sd,handNo:o.hn,pot:o.pot,phase:o.ph,turn:o.turn,deadline:o.dl?o.dl+(Date.now()-o.now):0,dealer:o.dlr,trickWinner:o.tw,leadSuit:o.ls,leadBy:o.lb!=null?o.lb:-1,loans:(o.ln||[]).map(a=>({id:a[0],from:a[1],to:a[2],amt:a[3],paid:a[4],fromName:a[5],toName:a[6],out:!!a[7]})),boardSize:o.bs,boardTop:o.bt,board:o.bd.map(dec),boardBy:o.bw||[],participants:o.pa||[],tiebreak:!!o.tb,started:!!o.st,busy:!!o.bz,code:o.cd,keep:!!o.kp,msgHost:o.mh||'',hostId:o.host,next:o.nx,series:!!o.sr,adasiTurn:o.ad,tieSplit:!!o.ts,fill:!!o.fl,pub:!!o.pb,pending:o.pc||null,
    players:o.pl.map(a=>({id:a[0],name:a[1],isBot:!!a[2],chips:a[3],hand:a[4].map(dec),dropped:dec(a[5]),sitout:!!a[6],strikes:a[7],av:a[8]?(a[8][0]==='e'?{kind:'emoji',emoji:a[8][1]}:{kind:'initial',color:a[8][1]}):null,revealed:!!a[9],gone:!!a[10],mic:!!a[11],cam:!!a[12],satOutByTimer:!!a[13],away:!!a[14],color:a[15]||'#555',treat:a[16]||'',streak:a[17]||0,bought:a[18]!=null?a[18]:null,wins:a[19]||0,best:a[20]||0,voice:a[21]||null})),
    sideBets:o.sbs.map(a=>({id:a[0],a:a[1],b:a[2],type:a[3],amt:a[4],mine:a[5],theirs:a[6],status:a[7],result:a[8],winner:a[9],desc:sbDesc(a[3],a[5],a[6])}))};
  ME=o.me;HOST=o.host===ME;djRefresh();
  $('#t-name').textContent=S.tableName;$('#t-wager').textContent=S.pending&&S.pending.wager!=null&&S.pending.wager!==S.wager?`${fmt(S.wager)} → ${fmt(S.pending.wager)} next hand`:fmt(S.wager);$('#t-decks').textContent=`${S.decks} deck${S.decks>1?'s':''} · ${36*S.decks} cards`;
  if(!S.started)showWait();else $('#wait').hidden=true;
  $('#btn-tset2').classList.toggle('can',canEditTable());tipSettings();
  const lv=S.keep?'away':'leave';const bl=$('#btn-leave');if(bl.dataset.v!==lv){bl.dataset.v=lv;bl.innerHTML='<span class="long">Leave table</span><span class="short">Leave</span>'}
  if(SEATS[S.code]&&S.tableName&&SEATS[S.code].name!==S.tableName){SEATS[S.code].name=S.tableName;saveSeats()}
  $('#btn-invite').hidden=!!LOCALT;
  $('#btn-close').hidden=true;$('#btn-close').onclick=()=>{if(!$('#btn-close').dataset.arm){$('#btn-close').dataset.arm='1';$('#btn-close').textContent='Tap again to close for everyone';setTimeout(()=>{delete $('#btn-close').dataset.arm;$('#btn-close').textContent='Close room'},4000);return}send({type:'close'})};
  renderAll();
  motion(prev,before);
  placeMarks();
  if($('#m-lend').classList.contains('on'))renderLend();renderSideLoans();musicSync();
  SPRAYED=new Set((fx||[]).filter(e=>e.k==='spray').map(e=>e.to));
  cues(prev);
  turnTick();requestAnimationFrame(updateTurnMark);prefetchVoices();
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
  S.players.forEach(p=>{const q=prev.players[p.id];if(!q||q.name!==p.name||SPRAYED.has(p.id))return;const d=p.chips-q.chips;if(d>0)setTimeout(()=>popGain(p.id,d),60)});
  const me=ME>=0&&S.players[ME],pm=ME>=0&&prev.players[ME];
  if(me&&pm&&S.handNo===prev.handNo&&S.phase>=3&&S.phase<=5&&me.hand.length>=2&&total(me)===21&&total(pm)!==21){fx21(ME,'mine');toast('21 in your hand 🤫 Only you can see it until the cards are turned over',3400)}
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
    case 'bubble':if(e.t==='21!')fx21(e.pid,'hit');if(e.t!=='21!'||RM())bubble(e.pid,e.t,e.ms);break;
    case 'chip':flyChip(e.from==='pot'?$('#pot'):seatEl(e.from),e.to==='pot'?$('#pot'):seatEl(e.to),e.cls,e.n2||1);if(e.to==='pot'){const pe=$('.pot');pe.classList.remove('grow');void pe.offsetWidth;pe.classList.add('grow')}break;
    case 'banner':banner(e.t);SND('stamp');break;
    case 'win':{const el=$('#seat-'+e.pid);if(el){el.classList.add('winner','won');setTimeout(()=>el.classList.remove('winner'),2500)}const wp=S.players[e.pid],w21=!!(wp&&total(wp)===21);if(w21)fx21(e.pid,'win');else SND('win');if(e.pid===ME||w21){confetti();if(w21)setTimeout(confetti,450)}if(e.pid===ME)buzz([40,30,80]);break}
    case 'log':logLocal(e.t,e.cls||'');break;
    case 'toast':if(e.pid===undefined||e.pid===ME)toast(e.t,e.ms||2200);break;
    case 'nudge':if(e.pid===ME){nudge(e.t);SND('error');buzz(40)}break;
    case 'adasi':drama('adasi',e);break;
    case 'series':drama('series',e);break;
    case 'sel':if(e.pid===ME){const el=$(`#myhand .card[data-id="${e.id}"]`);el&&el.classList.add('pop')}break;
    case 'shuffle':shuffleFx();break;
    case 'spray':sprayFx(e.from,e.to,e.amt);break;
    case 'lend':lendFx(e.from,e.to,e.amt,e.back);break;
    case 'treat':treatFx(e.from,e.to,e.item);break;
    case 'react':reactFx(e.pid,e.r);break;
    case 'chat':bubble(e.pid,e.t,Math.min(6500,2200+e.t.length*55),'chat');if(e.pid!==ME)SND('pop');break;
    case 'streak':streakFx(e.pid,e.run);break;
    case 'streakend':streakEndFx(e.pid,e.run);break;
  }
}

// ---------- rendering ----------
function renderAll(){const sig=S.players.map(p=>p.id+(p.isBot?'b':'h')+p.name+(p.av?JSON.stringify(p.av):'')).join('|')+'#'+ME;const fresh=sig!==lastSig;lastSig=sig;renderSeats(fresh||lastCount!==S.players.length||lastME!==ME);renderBoard();renderSide();renderMe();renderPhases()}
// seats round the oval; on a tall phone table, seats that would sit level with the board row are lifted
// (or dropped) out of its way, so a face, a dropped card or a video never hides behind the cards
function seatLayout(n,tall){
  const N=n+1,step=360/N,d=Math.round(N/2),sq=v=>Math.sign(v)*Math.pow(Math.abs(v),.62),B=.5;
  let mid=false;
  // eight players on a tall phone: hand-placed spots, four up the left, three down the right, none level with the board
  const A9=[[50,94],[28,90],[7,71],[7,29],[27,9],[50,6],[73,9],[93,29],[93,71]];
  const at=j=>{if(tall&&N===9){const [l,t]=A9[j],c=(l-50)/44,s=(t-50)/44;return{left:l,top:t,tx:-(1+c)*50,ty:-(1+s)*50,side:s>0.6?'b':(c>0.05?'r':'l')}}
    const a=(90+j*step)*Math.PI/180;let c=sq(Math.cos(a)),s=sq(Math.sin(a));if(Math.abs(s)<1e-9)s=0;
    if(tall&&Math.abs(s)<B){s=(s<=0?-1:1)*(B+(1-B)*Math.abs(s))}
    // a full tall table: corner seats step inwards so the lifted side seats have room beside them
    else if(tall&&N>=8&&Math.abs(s)>.7&&Math.abs(c)>.3)c*=.8;
    if(!tall&&Math.abs(s)<.45&&j!==d)mid=true;
    return{left:50+44*c,top:50+44*s,tx:-(1+c)*50,ty:-(1+s)*50,side:s>0.6?'b':(c>0.05?'r':'l')}};
  for(let j=0;j<N;j++)at(j);
  // a wide table with seats level with the board: the board row narrows so their faces stay clear
  BOARD_FRAC=mid?.6:null;
  return{seat:k=>at(k<d?k:k+1),dealer:at(d)};
}
function renderPhases(){$('#phases').innerHTML=PHASES.map((p,i)=>`<span class="phase ${i<S.phase?'done':i===S.phase?'now':''}">${p}</span>`).join('')}
let TALL=null,BOARD_FRAC=null;
function renderSeats(fresh){
  const n=S.players.length, root=$('#seats');const meIdx=Math.max(0,ME);
  const tb=$('#table'),tall=!!(tb&&tb.clientHeight>tb.clientWidth*1.05);
  if(fresh||lastCount!==n||lastME!==ME||TALL!==tall){lastCount=n;lastME=ME;TALL=tall;const L=seatLayout(n,tall);sizeBoard();const D=$('.dealer');D.style.left=L.dealer.left+'%';D.style.top=L.dealer.top+'%';D.style.right='auto';D.style.transform=`translate(${L.dealer.tx}%,${L.dealer.ty}%)`;root.innerHTML=S.players.map((p,i)=>{const pos=L.seat((i-meIdx+n)%n);const a=p.isBot?{style:`background:${p.color}`,text:p.name[0].toUpperCase()}:(p.id===ME?avStyle(AV,p.name[0].toUpperCase()):avStyle(p.av,p.name[0].toUpperCase()));
    return`<div class="seat" id="seat-${p.id}" data-side="${pos.side}" style="left:${pos.left}%;top:${pos.top}%;transform:translate(${pos.tx}%,${pos.ty}%);animation:seatin .6s ${i*.08}s both"><span class="flame"></span><div class="av" style="${a.style}" ${p.id===ME?'title="Change your avatar"':''}>${a.text}<div class="vid"><video autoplay playsinline ${p.id===ME?'muted':''}></video></div><span class="rec"></span><span class="mic"></span><span class="treat"></span><div class="ring" hidden></div><div class="tleft" hidden></div></div><div class="nm"></div><div class="chips"><span class="chip s c25"></span><span class="num"></span></div><div class="mini"></div><div class="tot"></div></div>`}).join('');
    if(ME>=0){const me=$('#seat-'+ME+' .av');if(me)me.onclick=openAv}
    S.players.forEach(p=>{if(p.id===ME)return;const el=$('#seat-'+p.id);if(!el)return;el.classList.add('human');el.querySelector('.av').onclick=()=>openPlayer(p.id)});
    rtcAttachAll();
  }
  S.players.forEach(p=>{
    const el=$('#seat-'+p.id);if(!el)return;
    // someone new in a seat that was empty: draw the seats again so the face is theirs
    if(!p.gone&&el.dataset.who!==p.name){el.dataset.who=p.name;if(el.dataset.drawn)setTimeout(()=>renderSeats(true),0);el.dataset.drawn=1}
    // a seat whose player left or was taken off the table shows as an empty chair
    el.classList.toggle('empty',!!p.gone);
    el.querySelector('.nm').textContent=p.gone?'Empty seat':p.name+(p.away?' · reconnecting':'');countTo(el.querySelector('.chips .num'),p.chips);
    el.classList.toggle('friend',!p.isBot&&p.id!==ME&&!!IDS[p.id]&&!!FR()[IDS[p.id]]);el.classList.toggle('turn',S.turn===p.id);el.classList.toggle('sitout',p.sitout||p.gone||p.away||(S.started&&!S.participants.includes(p.id)));
    const mic=p.id===ME?AVS.mic:p.mic,cam=p.id===ME?AVS.cam:p.cam;el.classList.toggle('video',!!cam&&!p.isBot);el.classList.toggle('mic-on',!!mic);el.classList.toggle('mic-off',!mic);
    let btn=el.querySelector('.btn-d');if(S.dealer===p.id&&S.started){if(!btn){btn=document.createElement('div');btn.className='btn-d';btn.textContent='D';el.querySelector('.av').appendChild(btn)}}else if(btn)btn.remove();
    const tr=el.querySelector('.treat'),te=p.treat&&TREATS[p.treat]?TREATS[p.treat].e:'';if(tr&&tr.textContent!==te)tr.textContent=te;
    const fl=el.querySelector('.flame'),sk=p.streak>=2&&!p.gone?p.streak:0;if(fl&&fl.dataset.n!==String(sk)){fl.dataset.n=sk;fl.innerHTML=sk?`<i>🔥</i><b>${sk}</b>`:''}el.classList.toggle('hot',sk>=2);el.classList.toggle('blaze',sk>=4);
    const mini=el.querySelector('.mini');
    const showDrop=p.dropped&&S.phase>=3&&S.phase<=4;const dropHTML=showDrop?`<div class="dropwrap ${S.trickWinner===p.id?'win':''}">${cardHTML(p.dropped,FLY.has(p.dropped.id)?'incoming':'')}<small>drop</small></div>`:'';
    if(p.id!==ME){const show=p.revealed;mini.innerHTML=dropHTML+p.hand.map(c=>show&&c.r!==undefined?cardHTML(c,FLY.has(c.id)?'incoming':''):`<div class="card back" data-id="${c.id}"></div>`).join('');
      const t=el.querySelector('.tot');if(show&&p.hand.length&&p.hand[0].r!==undefined)seatTot(t,p);else{const k=Math.max(0,p.hand.length-(FLYC[p.id]||0));t.textContent=k?k:'';t.classList.remove('bust','t21','big');t.classList.add('count')}
    }else{mini.innerHTML=dropHTML;const t=el.querySelector('.tot');if(S.phase>=6&&p.revealed&&p.hand.length)seatTot(t,p);else{t.textContent='';t.classList.remove('bust','t21','big','count')}}
    if(S.phase<6)el.classList.remove('won');
  });
  countTo($('#pot'),S.pot);
  const st=$('#potstack');const k=Math.min(6,Math.ceil(S.pot/S.wager));st.innerHTML=Array.from({length:k},(_,i)=>`<span class="chip ${['c1','c5','c25','c100','c500'][i%5]}" style="top:${18-i*3}px"></span>`).join('');
  $('#t-hand').textContent=S.handNo;
  const live=S.players.filter(p=>!p.isBot&&!p.gone&&(p.cam||p.mic)).length;$('#roomav').textContent=live?`${live} on video/voice`:'Join the room with voice or video';
}
// a seat's total once its cards are turned over: big at the end of the hand, so nobody has to add up
function seatTot(t,p){const tt=total(p),txt=tt>21?'bust':String(tt),was=t.textContent,big=S.phase>=6;t.textContent=txt;t.classList.toggle('bust',tt>21);t.classList.toggle('t21',tt===21);t.classList.toggle('big',big);t.classList.remove('count');
  if(big&&was!==txt&&!RM())t.animate([{transform:'scale(.3)',opacity:0},{offset:.6,transform:'scale(1.35)',opacity:1},{transform:'scale(1)',opacity:1}],{duration:420,easing:'cubic-bezier(.2,.9,.3,1.2)'})}
// the flushed cards always sit in one row: shrink to fit, then fan (overlap) so every corner index stays readable
function sizeBoard(){
  const slots=$('#slots');const n=(S&&S.boardSize)||0;if(!slots||!n)return;
  const tw=$('#table').clientWidth||360,phone=matchMedia('(max-width:700px)').matches;
  const avail=tw*(phone?(n>=7?0.6:0.8):(BOARD_FRAC||0.78));
  const maxW=phone?50:70,minW=phone?36:46;
  let w=Math.min(maxW,Math.floor((avail-(n-1)*6)/n)),step=w+6;
  if(w<minW){w=minW;step=Math.max(17,Math.floor((avail-w)/Math.max(1,n-1)))}
  slots.style.setProperty('--card-w',w+'px');slots.style.setProperty('--step',step+'px');slots.classList.toggle('fan',step<w);
}
window.addEventListener('resize',()=>{if(!S)return;sizeBoard();const tb=$('#table');if(tb&&TALL!==null&&TALL!==(tb.clientHeight>tb.clientWidth*1.05))renderSeats(true)});
function renderBoard(){
  const n=S.boardSize||0;
  // a card someone picks leaves the table (it flies to them); only the cards still to be picked stay, closing up
  $('#slots').innerHTML=Array.from({length:n},(_,i)=>i).filter(i=>!(S.board[i]&&S.board[i].taken)).map(i=>{const c=S.board[i];
    return`<div class="slot ${S.phase===5&&i===S.boardTop?'next':''}">${c?cardHTML(c,FLY.has(c.id)?'incoming':''):''}<span class="idx">${i+1}</span></div>`}).join('');
  // on your pick, the next card itself can be tapped to take it
  const me=S.players[ME],nx=$('#slots .slot.next'),c=S.board[S.boardTop];
  if(nx&&me&&c&&S.phase===5&&S.turn===ME&&total(me)+val(c)<=21){nx.classList.add('tap');nx.onclick=()=>{nx.onclick=null;act({type:'take',card:c.id})}}
  sizeBoard();
}
function renderSide(){setTimeout(updateSide,0);renderTonight();
  const el=$('#sbs');const bets=S.sideBets.filter(b=>b.status!=='pending');if(!bets.length){el.innerHTML='<div class="note" style="margin:0">No side bets yet. Propose one from the top bar.</div>';return}
  el.innerHTML=bets.slice().reverse().map(b=>{const A=S.players[b.a],B=S.players[b.b];let st=b.status;if(st==='won')st=b.winner===ME?'won':(b.a===ME||b.b===ME?'lost':'won');return`<div class="sb ${b.a===ME||b.b===ME?'mine':''}"><span class="st ${st}">${st}</span><b>${esc(A?A.name:'?')}</b> vs <b>${esc(B?B.name:'?')}</b> · ${fmt(b.amt)}<br><span style="color:var(--fg-dim)">${esc(b.desc)}</span>${b.result?`<br><span>${esc(b.result)}</span>`:''}</div>`}).join('');
}
let NUDGE=null,SPRAYED=new Set();
function msg(t){if(NUDGE)return;$('#msg').innerHTML=t}
function nudge(t){NUDGE=t;$('#msg').innerHTML=`<span class="nudge">${t}</span>`;clearTimeout(nudge.t);nudge.t=setTimeout(()=>{NUDGE=null;renderMe()},2600)}
function actions(html){$('#actions').innerHTML=html}
function renderMe(){
  const me=ME>=0?S.players[ME]:null;
  if(!me){$('#myhand').innerHTML='';$('#mytotal').textContent='–';$('#mychips').textContent='–';$('#mychips')._n=undefined;return}
  const myTurn=S.turn===ME&&!(S.phase===3&&me.dropped); // once you've dropped, the table's short pause isn't your turn
  $('#myhand').innerHTML=me.hand.map(c=>cardHTML(c,(FLY.has(c.id)?'incoming':'')+(S.phase===3&&myTurn&&S.adasiTurn!==ME?' pickable':''))).join('');
  const tt=total(me);$('#mytotal').textContent=!me.hand.length?'–':(S.phase<=3&&me.hand.length===3?'drop one':tt);$('#mytotal').style.color=tt>21?'var(--bad)':tt===21?'var(--good)':'';
  countTo($('#mychips'),me.chips);
  if(!S.started)return;
  const tp=S.turn>=0?S.players[S.turn]:null;const nm=tp?esc(tp.name):'';$$('#myhand .wl').forEach(x=>x.remove());
  const out=!S.participants.includes(ME);
  if(S.phase===0){msg(S.msgHost||`Hand ${S.handNo}. Everyone puts ${fmt(S.wager)} into the pot.`);actions(HOST?'<button class="btn btn-gold" id="btn-deal">Deal now</button><span class="note" style="margin:0;align-self:center">auto-deals in 8s</span>':'');const b=$('#btn-deal');if(b)b.onclick=()=>act({type:'deal'})}
  else if(S.phase===1){msg('The dealer shuffles and deals three cards each…');actions('')}
  else if(S.phase===2){msg(`Dealer flushes ${S.boardSize} cards onto the board before anyone drops.`);actions('')}
  else if(S.phase===3){
    // two Aces: the caller declares Adasi straight away; anyone else waits for the call, which breaks it when the
    // called suit makes them drop an Ace (the table decides; this only explains it to the one holding them)
    const L=S.leadSuit,aces=me.hand.filter(c=>c.r==='A').length,lead=L?me.hand.filter(c=>c.s===L):[],ADS=window.TeteEngine&&window.TeteEngine.Table.adasiStands;
    const two=aces>=2&&!me.dropped&&!out,broke=two&&!!L&&!!ADS&&!ADS(me.hand,L),why=lead.length>1?`all your ${L} are Aces`:`your only ${L} is an Ace`;
    if(out){msg('You sit this hand out.');actions('')}
    else if(myTurn&&S.adasiTurn===ME){msg('<b>Two Aces!</b> You hold Adasi. Declare it and the pot is yours.');actions('<button class="btn btn-adasi" id="btn-adasi">DECLARE ADASI</button>');$('#btn-adasi').onclick=()=>{actions('');act({type:'adasi'})}}
    else if(myTurn){const must=S.leadSuit&&me.hand.some(c=>c.s===S.leadSuit),ci=callInfo(),tv=ci?ci.tv:-1,beats=c=>!!(c&&S.leadSuit&&c.s===S.leadSuit&&val(c)>tv),anyBeat=me.hand.some(beats);
      msg(broke?`<b>No Adasi this hand.</b> ${L} is called and ${why}, so you have to drop ${lead.length>1?'one':'it'}. Tap ${lead.length>1?'one':'it'}.`:S.leadSuit?(must?`${S.leadSuit} is called: you must drop a ${S.leadSuit}.${anyBeat?' 👑 marks a card that would take the lead.':''} Tap a card.`:`${S.leadSuit} is called. You have none, so drop any card.`):'You make the call: everyone has to follow the suit you drop. Tap a card.');actions('');
      $$('#myhand .card').forEach(el=>{const c=me.hand.find(x=>x.id===el.dataset.id);
        if(beats(c)){const w=document.createElement('span');w.className='wl';w.textContent='👑';el.appendChild(w)}
        if(must&&c.s!==S.leadSuit){el.classList.add('dim');el.classList.remove('pickable');el.onclick=()=>{nudge(`You hold a ${S.leadSuit}, so you have to follow suit.`);SND('error')};return}
        el.onclick=()=>{const keep=me.hand.filter(x=>x!==c);const kt=keep.reduce((a,x)=>a+val(x),0);if(kt>21){nudge(`Keeping ${keep.map(cname).join(' + ')} makes ${kt}. That's over 21 before you even pick, so you'd be bust. Drop a different card.`);SND('error');return}el.classList.add('sel');$$('#myhand .wl').forEach(x=>x.remove());$$('#myhand .card').forEach(x=>{x.classList.remove('pickable');x.onclick=null});act({type:'drop',card:c.id})}})}
    else if(S.turn<0){msg('');actions('')} // an Adasi is being shown
    else if(two&&ADS){msg(!L?`<b>Two Aces!</b> Wait for the call: if it misses your Aces, you declare Adasi on your turn. ${nm} is making the call…`:broke?`${L} is called and ${why}, so it has to go when the drop reaches you. No Adasi this hand.`:`<b>Two Aces!</b> ${L} is called and misses your Aces. You declare Adasi when the drop reaches you.`);actions('')}
    else{msg(me.dropped?`You dropped ${cname(me.dropped)}.${S.turn!==ME?` Waiting for ${nm}…`:''}`:`${nm} is choosing a card to drop…`);actions('')}
  }
  else if(S.phase===4){const w=S.trickWinner>=0?S.players[S.trickWinner]:null;msg(w?`<b>${esc(w.name)}</b> wins the trick and picks first.`:'');actions('')}
  else if(S.phase===5){
    if(out){msg('You sit this hand out.');actions('')}
    else if(myTurn){const c=S.board[S.boardTop];const t=total(me);
      if(!c){msg('The board is empty.');actions('');return}
      // you must keep picking while the next card keeps you on 21 or under; when it would take you over, you stay
      if(t+val(c)>21){msg(`<b>${cname(c)}</b> would take you to ${t+val(c)}, over 21, so you can't pick it. You stay on <b>${t}</b>.`);actions('');return}
      msg(`Your pick: <b>${cname(c)}</b> takes you from <b>${t}</b> to <b>${t+val(c)}</b>. You keep picking until you reach 21 or the next card would take you over${S.timer?'. When the clock runs out, the card is given to you':''}.`);
      actions(`<button class="btn btn-gold" id="btn-take">Take ${cname(c)}</button>`);
      $('#btn-take').onclick=()=>act({type:'take',card:c.id});
    }else{msg(`${nm} is picking… you're on <b>${total(me)}</b>.`);actions('')}
  }
  else if(S.phase===6){
    const shown=S.participants.map(id=>S.players[id]).filter(p=>p&&p.revealed&&p.hand.length&&p.hand.every(c=>c.r!==undefined)).sort((a,b)=>{const x=total(a),y=total(b);return (x>21?-1:x)>(y>21?-1:y)?-1:1});
    const summary=shown.map(p=>`${esc(p.id===ME?'You':p.name)} <b>${total(p)>21?'bust':total(p)}</b>`).join(' · '),tl=summary?`<span class="totline">${summary}</span>`:'';
    if(S.busy){msg(S.msgHost?`${S.msgHost} ${tl}`:`Turning the cards over… ${tl}`);actions('')}
    else{
      let a='';
      if(me.satOutByTimer)a+='<button class="btn btn-gold" id="btn-rejoin">Rejoin the table</button>';
      else if(me.chips<S.wager)a+=`<button class="btn btn-gold" id="btn-rebuy">Rebuy ${fmt(S.buyIn)}</button>`;
      if(HOST){if(S.msgHost&&!S.next)a+='<button class="btn btn-gold" id="btn-rebuy-all">Rebuy everyone</button>';else a+=`<button class="btn ${a?'btn-ghost':'btn-gold'}" id="btn-next">${S.tiebreak?'Play for the bigger pot':'Next hand'}</button><span class="note" style="margin:0;align-self:center">auto in 12s</span>`}
      msg(S.msgHost?`${S.msgHost} ${tl}`:`${tl} ${HOST?'Ready when you are.':'Waiting for the host to deal the next hand.'}`);
      actions(a);
      const bn=$('#btn-next');if(bn)bn.onclick=()=>act({type:'next'});const br=$('#btn-rejoin');if(br)br.onclick=()=>act({type:'rejoin'});const bb=$('#btn-rebuy');if(bb)bb.onclick=()=>act({type:'rebuy'});const ba=$('#btn-rebuy-all');if(ba)ba.onclick=()=>act({type:'rebuy_all'});
    }
  }
}
function bubble(pid,text,ms=1400,cls){const el=$('#seat-'+pid);if(!el)return;const p=S.players[pid];if(p&&p.isBot&&p.mic)fakeSpeak(pid,ms);if(cls)el.querySelectorAll('.bubble.'+cls).forEach(x=>x.remove());const b=document.createElement('div');b.className='bubble'+(cls?' '+cls:'');b.textContent=text;el.appendChild(b);
  // keep it on screen: seats at the edge of a phone push their bubble inwards
  const sr=el.getBoundingClientRect(),w=b.offsetWidth,l=sr.left+sr.width/2-w/2;let dx=0;if(l<6)dx=6-l;else if(l+w>innerWidth-6)dx=innerWidth-6-(l+w);if(dx)b.style.marginLeft=dx.toFixed(0)+'px';
  setTimeout(()=>b.remove(),ms)}
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
function banner(text,cls){const b=document.createElement('div');b.className='banner'+(cls?' '+cls:'');b.textContent=text;$('#fx').appendChild(b);setTimeout(()=>b.remove(),2300)}
// confetti that really falls the whole way down whatever it rains on
function confetti(box){const fx=box||$('#fx');if(!fx||RM())return;const H=((box||$('#table')||document.body).getBoundingClientRect().height||innerHeight)+40;
  for(let i=0;i<40;i++){const c=document.createElement('i');c.className='confetti';c.style.left=Math.random()*100+'%';c.style.top='-14px';c.style.animation='none';c.style.background=['var(--gold)','var(--cream)','var(--good)','var(--red)'][i%4];fx.appendChild(c);
    const dx=(Math.random()-.5)*90,r=360+Math.random()*540;
    c.animate([{transform:'translate(0px,0px) rotate(0deg)',opacity:1},{offset:.85,opacity:1},{transform:`translate(${dx.toFixed(0)}px,${H.toFixed(0)}px) rotate(${r.toFixed(0)}deg)`,opacity:0}],{duration:1700+Math.random()*900,delay:Math.random()*600,easing:'cubic-bezier(.3,.1,.6,1)',fill:'backwards'}).onfinish=()=>c.remove();setTimeout(()=>c.remove(),3500)}}
function seatEl(id){return id===ME?$('#mychips'):$('#seat-'+id)}
let TICK=-1,RING_T=null;
function turnTick(){
  clearTimeout(RING_T);RING_T=null;if(!S)return;
  const on=S.turn>=0&&S.deadline>0&&(S.phase===3||S.phase===5);
  $$('.seat .ring:not([hidden]),.seat .tleft:not([hidden])').forEach(x=>{if(!on||x.closest('.seat').id!=='seat-'+S.turn)x.hidden=true});
  if(!on){TICK=-1;return}
  const el=$('#seat-'+S.turn);const ring=el&&el.querySelector('.ring'),tl=el&&el.querySelector('.tleft');
  if(ring){ring.hidden=false;tl.hidden=false;const secs=S.timer||20,left=Math.max(0,(S.deadline-Date.now())/1000),pct=Math.min(1,left/secs);
    ring.style.setProperty('--pct',pct.toFixed(3));ring.style.setProperty('--ringc',pct>.5?'var(--good)':pct>.25?'var(--warn)':'var(--bad)');tl.textContent=Math.ceil(left);
    const urgent=left<=5;ring.classList.toggle('urgent',urgent);tl.classList.toggle('urgent',urgent);
    if(S.turn===ME&&urgent){const sec=Math.ceil(left);if(sec>0&&sec!==TICK){TICK=sec;SND('tick',{bg:true});if(sec<=3)buzz(12)}}}
  if(S.turn!==ME)TICK=-1;
  RING_T=setTimeout(turnTick,document.hidden?1000:250)}
// whose turn: a soft spotlight and a gold pointer glide from seat to seat
function updateTurnMark(){
  const g=$('#turnglow'),ar=$('#turnarrow'),tb=$('#table');if(!g||!ar||!tb)return;
  const on=!!S&&S.started&&S.turn>=0&&(S.phase===3||S.phase===5);const av=on?$(`#seat-${S.turn} .av`):null;
  if(!av){g.classList.add('off');ar.classList.add('off');return}
  const t=tb.getBoundingClientRect(),r=av.getBoundingClientRect();if(!r.width)return;
  const x=r.left+r.width/2-t.left,y=r.top+r.height/2-t.top,ay=r.top-t.top-6;const first=g.classList.contains('off');
  if(first){g.style.transition=ar.style.transition='none'}
  g.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;ar.style.transform=`translate(${x.toFixed(1)}px,${ay.toFixed(1)}px)`;
  if(first){void g.offsetWidth;g.style.transition=ar.style.transition=''}
  g.classList.remove('off');ar.classList.remove('off');const mine=S.turn===ME;g.classList.toggle('mine',mine);ar.classList.toggle('mine',mine)}
window.addEventListener('resize',()=>{if(S)setTimeout(updateTurnMark,80)});

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
function reveal(id,flip){FLY.delete(id);const el=$$(CARDSEL).find(x=>x.dataset.id===id);if(!el)return;el.classList.remove('incoming');if(el.closest('.dropwrap'))placeMarks();
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
    if(b&&b.w===where){SEEN.add(id);
      // the cards left on the board slide over to close the gap a picked card leaves
      if(where==='board'){const to=rectOf(el),dx=to?b.r.left-to.left:0,dy=to?b.r.top-to.top:0;if(Math.abs(dx)>1||Math.abs(dy)>1)(el.closest('.slot')||el).animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'none'}],{duration:380,delay:120,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'})}
      return}
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
// ---------- spray money and treats ----------
const TREATS=(window.TeteEngine&&window.TeteEngine.TREATS)||{};
let TREAT_TO='all';
function openTreats(to){if(!S||!S.started||ME<0){toast('Treats are for when the game is on');return}TREAT_TO=to===undefined?'all':to;renderTreats();openModal('#m-treat');SND('flick')}
function renderTreats(){const others=S.players.filter(p=>!p.gone&&p.id!==ME),n=S.players.filter(p=>!p.gone).length,mine=S.players[ME]?S.players[ME].chips:0;
  const who=[[ME,'Me']].concat(others.map(p=>[p.id,p.name])).concat([['all',`Everyone (${n})`]]);
  $('#treat-who').innerHTML=who.map(([v,l])=>`<button type="button" data-to="${v}" class="${String(v)===String(TREAT_TO)?'on':''}">${esc(l)}</button>`).join('');
  $$('#treat-who button').forEach(b=>b.onclick=()=>{TREAT_TO=b.dataset.to==='all'?'all':+b.dataset.to;renderTreats();SND('flick')});
  const k=TREAT_TO==='all'?n:1;
  $('#treats').innerHTML=Object.entries(TREATS).map(([id,t])=>`<button class="tbtn" type="button" data-item="${id}" ${t.price*k>mine?'disabled':''}><span class="e">${t.e}</span><b>${esc(t.n)}</b><small>${fmt(t.price*k)}</small></button>`).join('');
  $$('#treats .tbtn').forEach(b=>b.onclick=()=>{closeModal('#m-treat');act({type:'treat',item:b.dataset.item,to:TREAT_TO})})}
$('#btn-treat').onclick=()=>openTreats('all');
// ---------- lending: chips to someone (usually someone who has run out), written down, paid back later ----------
let LEND_TO=null,LEND_AMT=0,ARMED={id:-1,until:0};
// redraw a part of a sheet only when what it shows has changed, so a button never moves under a finger
function setH(el,html,bind){if(!el||el._h===html)return false;el.innerHTML=html;el._h=html;if(bind)bind(el);return true}
function openLend(to){if(!S||!S.started||ME<0){toast('Lending is for when the game is on');return}
  const others=S.players.filter(p=>!p.gone&&p.id!==ME);LEND_TO=to!=null?to:((others.find(p=>p.chips<S.wager)||others[0]||{}).id);LEND_AMT=0;$('#ld-other').hidden=true;$('#ld-other').value='';
  renderLend();openModal('#m-lend');SND('flick')}
function renderLend(){if(!S||ME<0)return;const me=S.players[ME],mine=me?me.chips:0,others=S.players.filter(p=>!p.gone&&p.id!==ME);
  if(LEND_TO!=null&&!others.some(p=>p.id===LEND_TO))LEND_TO=others.length?others[0].id:null;
  setH($('#ld-who'),others.length?others.map(p=>`<button type="button" data-to="${p.id}" class="${p.id===LEND_TO?'on':''}">${esc(p.name)}${p.chips<S.wager?' <small class="out">out of chips</small>':''}</button>`).join(''):'<span class="note" style="margin:0">Nobody else is at the table yet.</span>',
    el=>el.querySelectorAll('button').forEach(b=>b.onclick=()=>{LEND_TO=+b.dataset.to;renderLend();SND('flick')}));
  const pre=[...new Set([S.wager*2,Math.round(S.buyIn/2),S.buyIn,S.buyIn*2].filter(v=>v>=5))].sort((a,b)=>a-b),other=$('#ld-other');
  if(!LEND_AMT&&other.hidden)LEND_AMT=pre.filter(v=>v<=mine&&v<=S.buyIn).pop()||0;
  setH($('#ld-amts'),pre.map(v=>`<button type="button" data-v="${v}" class="${other.hidden&&v===LEND_AMT?'on':''}" ${v>mine?'disabled':''}>${fmt(v)}</button>`).join('')+`<button type="button" data-v="other" class="${other.hidden?'':'on'}">Other</button>`,
    el=>el.querySelectorAll('button').forEach(b=>b.onclick=()=>{SND('flick');if(b.dataset.v==='other'){other.hidden=false;other.focus();LEND_AMT=Math.round(+other.value)||0}else{other.hidden=true;LEND_AMT=+b.dataset.v}renderLend()}));
  lendBtn();renderLoans()}
function lendBtn(){const me=S&&S.players[ME],mine=me?me.chips:0,tp=S&&LEND_TO!=null?S.players[LEND_TO]:null,b=$('#ld-go'),ok=!!tp&&LEND_AMT>=5&&LEND_AMT<=mine;
  b.textContent=tp&&LEND_AMT>=5?`Lend ${fmt(LEND_AMT)} to ${tp.name}`:'Lend';b.disabled=!ok;$('#ld-mine').textContent=`You have ${fmt(mine)} in front of you.`+(LEND_AMT>mine?' Not enough for that.':'')}
$('#ld-other').addEventListener('input',()=>{LEND_AMT=Math.round(+$('#ld-other').value)||0;lendBtn()});
$('#ld-go').onclick=()=>{const tp=S&&S.players[LEND_TO];if(!tp||!(LEND_AMT>=5))return;closeModal('#m-lend');act({type:'lend',to:LEND_TO,amt:LEND_AMT})};
$('#btn-lend').onclick=()=>openLend();
// the record: who lent whom, what's still owed; the borrower can pay back, the lender can mark it settled
function loanRows(list,withActions){const me=S&&S.players[ME],can=me?me.chips:0;return list.map(l=>{const owe=l.amt-l.paid,who=`${esc(l.from===ME?'You':l.fromName)} → ${esc(l.to===ME?'you':l.toName)}`;
    const st=owe<=0?(l.out?'Settled outside the game ✓':'Paid back ✓'):l.paid>0?`${fmt(owe)} still owed · ${fmt(l.paid)} paid`:`${fmt(owe)} owed`;let a='';
    if(withActions&&owe>0&&l.to===ME){const part=Math.min(owe,can-(S?S.wager:0));a=can>=owe?`<button class="btn btn-gold" type="button" data-pay="${l.id}" data-amt="${owe}">Pay back</button>`:part>=5?`<button class="btn btn-ghost" type="button" data-pay="${l.id}" data-amt="${part}">Pay ${fmt(part)}</button>`:''}
    else if(withActions&&owe>0&&l.from===ME){const armed=ARMED.id===l.id&&Date.now()<ARMED.until;a=`<button class="btn ${armed?'btn-gold':'btn-ghost'}" type="button" data-settle="${l.id}">${armed?'Tap again: paid outside the game':'Settled'}</button>`}
    return`<div class="loan${owe<=0?' done':''}"><span class="lt">${who} <b class="num">${fmt(l.amt)}</b><span class="ls">${st}</span></span>${a}</div>`}).join('')}
function renderLoans(){const box=$('#ld-list');if(!box||!S)return;const ls=(S.loans||[]).slice().reverse();if(!setH(box,ls.length?loanRows(ls,true):'<p class="note" style="margin:0">No loans yet at this table.</p>'))return;
  box.querySelectorAll('[data-pay]').forEach(b=>b.onclick=()=>{act({type:'repay',loan:+b.dataset.pay,amt:+b.dataset.amt});SND('chips')});
  // marking a loan settled takes two taps; the list redraws as the game moves, so the first tap is remembered here
  box.querySelectorAll('[data-settle]').forEach(b=>b.onclick=()=>{const id=+b.dataset.settle;if(!(ARMED.id===id&&Date.now()<ARMED.until)){ARMED={id,until:Date.now()+4000};renderLoans();setTimeout(()=>{if(ARMED.id===id){ARMED={id:-1,until:0};renderLoans()}},4100);return}ARMED={id:-1,until:0};act({type:'settle_loan',loan:id});SND('flick')})}
// the scores panel lists what's still owed
function renderSideLoans(){const box=$('#side-loans');if(!box||!S)return;const open=(S.loans||[]).filter(l=>l.paid<l.amt);box.hidden=!open.length;const k=open.map(l=>l.id+':'+l.paid).join(',');if(box.dataset.k===k)return;box.dataset.k=k;
  box.innerHTML=open.length?'<h3>Loans</h3>'+loanRows(open.slice().reverse(),false)+'<button class="btn btn-ghost" type="button" id="side-lend">Lend or pay back</button>':'';const b=$('#side-lend');if(b)b.onclick=()=>openLend()}
// notes fly from lender to borrower (or back again), with a word over the seat
function lendFx(from,to,amt,back){const a=seatEl(from),b=seatEl(to);if(a&&b&&!RM())flyChip(a,b,'c100',Math.min(5,2+Math.floor(amt/Math.max(1,S?S.buyIn:1000))));SND('chips');
  setTimeout(()=>bubble(to,back?`Paid back ${fmt(amt)} ✓`:`Loan ${fmt(amt)} 🤝`,2000),350)}
// shouts said out loud: the player's own recording if they made one, otherwise the device's voice, a Nigerian
// English one when the phone or laptop has it (Edge does; Android can download one; iPhones don't), with each
// player's voice pitched a little differently
const SAY={'Oya!':'Oya!','Chai!':'Chaai!','Na wa o!':'Na wa o!','E choke!':'E choke!','Wahala!':'Wahala!','Ehen!':'Ehen!','Abeg!':'Abeg!','Conjour!':'Conjour!','School boi!':'School boy!','Guy play nowwww!':'Guy, play now!','Witch people!':'Witch people!','You be idiot!':'You be idiot!','We go fry egg for you!':'We go fry egg for you!','🔥':'Fire!','😂':'Ha ha ha ha!','👏':'Well done!','🙏':'Thank God o!','😱':'Ye!'};
let SPEAK=true;try{SPEAK=localStorage.getItem('tete.speak')!=='off'}catch{}
let VOICES=null;
function voicesFor(){if(!('speechSynthesis' in window))return[];const vs=speechSynthesis.getVoices()||[];if(!vs.length)return[];
  const tiers=[v=>/^en[-_]NG/i.test(v.lang)||/nigeria/i.test(v.name),v=>/^en[-_](GH|KE|ZA|TZ|UG)/i.test(v.lang),v=>/^en[-_]GB/i.test(v.lang),v=>/^en/i.test(v.lang)];
  for(const f of tiers){const m=vs.filter(f);if(m.length)return m}return vs.slice(0,1)}
if('speechSynthesis' in window)speechSynthesis.onvoiceschanged=()=>{VOICES=voicesFor()};
// the house voice: every shout in one real Nigerian voice, the same on every phone and laptop
// (Meka's own, cut from one voice note by tools/house-voice.py; index.json names whose voice it is)
let HV=null;
function loadHouseVoice(){fetch('/shouts/house/index.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(j=>{if(!j||!(j.n>0))return;HV=j;renderShoutList();if(S)prefetchHouse()}).catch(()=>{})}
function houseUrl(r){return`/shouts/house/${r}.mp3?v=${HV.v}`}
function playHouse(r){if(!HV||!(r>=0&&r<HV.n)||!window.TeteSound||!TeteSound.clip)return false;TeteSound.clip(houseUrl(r),{gain:1.4});return true}
function prefetchHouse(){if(!HV||!window.TeteSound||!TeteSound.loadClip)return;for(let r=0;r<HV.n;r++)TeteSound.loadClip(houseUrl(r)).catch(()=>{})}
loadHouseVoice();
function sayShout(pid,r){const t=REACTS[r];if(!t||!SPEAK||document.hidden||(window.TeteSound&&TeteSound.muted))return;
  if(playHouse(r))return;
  if(playRecorded(pid,r))return;
  if(!('speechSynthesis' in window))return;VOICES=VOICES&&VOICES.length?VOICES:voicesFor();
  const u=new SpeechSynthesisUtterance(SAY[t]||t),k=Math.max(0,pid),v=VOICES[k%Math.max(1,VOICES.length)];if(v){u.voice=v;u.lang=v.lang}else u.lang='en-NG';
  u.pitch=.82+(k%5)*.1;u.rate=1.02;u.volume=Math.min(1,((window.TeteSound&&TeteSound.volume)||.7)+.25);
  try{speechSynthesis.cancel();speechSynthesis.speak(u)}catch{}}
// phones only let a page talk after a tap: say nothing once, on the first tap
document.addEventListener('pointerdown',function warm(){document.removeEventListener('pointerdown',warm);try{if('speechSynthesis' in window){const u=new SpeechSynthesisUtterance(' ');u.volume=0;speechSynthesis.speak(u)}}catch{}},{passive:true});
let MYVOICE=null;const CLIPS=new Map();
function clipUrl(v,r){return`/shout/${v[0]}/${r}?v=${v[2]}`}
function clipAudio(url){let a=CLIPS.get(url);if(!a){a=new Audio(url);a.preload='auto';CLIPS.set(url,a)}return a}
function voiceOf(pid){const p=S&&S.players[pid];return(p&&p.voice)||(pid===ME?MYVOICE:null)}
function playRecorded(pid,r){const v=voiceOf(pid);if(!v||!((v[1]>>r)&1))return false;const a=clipAudio(clipUrl(v,r));
  try{a.currentTime=0;a.volume=Math.min(1,((window.TeteSound&&TeteSound.volume)||.7)+.25);const pr=a.play();if(pr&&pr.catch)pr.catch(()=>{})}catch{}return true}
// fetch everyone's recordings ahead of time so a shout plays the moment it's made
function prefetchVoices(){if(!S)return;prefetchHouse();if(HV)return;for(const p of S.players){const v=p.voice;if(!v)continue;for(let r=0;r<REACTS.length;r++)if((v[1]>>r)&1)clipAudio(clipUrl(v,r))}}
// ---------- record your own shouts ----------
let REC=null;
function renderShoutList(){const box=$('#shoutlist');if(!box)return;const words=REACTS.map((t,i)=>i).filter(i=>!isEmo(REACTS[i]));
  const who=HV&&HV.voice?esc(HV.voice):'';
  const hh=$('#shout-h');if(hh)hh.innerHTML=HV?`Shouts <small>${who?`in ${who}'s voice`:'in the house voice'}</small>`:'My shouts <small>in your own voice</small>';
  const nn=$('#shout-note');if(nn)nn.textContent=HV?`Everyone hears every shout in ${who?`${HV.voice}'s`:'the house'} voice, at every table. Tap ▶ to hear one.`:'Record each shout once and everyone at your table hears you say it. Tap the red dot, shout, and it stops by itself after two seconds.';
  if(HV){box.innerHTML=REACTS.map((t,i)=>`<div class="shrow house"><b>${esc(t)}</b><span class="who">${who||'House voice'}</span><button type="button" class="sh-play" data-i="${i}" aria-label="Hear ${esc(t)}">▶</button></div>`).join('');
    box.querySelectorAll('.sh-play').forEach(b=>b.onclick=()=>{if(window.TeteSound)TeteSound.unlock();playHouse(+b.dataset.i)});return}
  box.innerHTML=words.map(i=>{const mine=MYVOICE&&((MYVOICE[1]>>i)&1);return`<div class="shrow${mine?' mine':''}"><b>${esc(REACTS[i])}</b><span class="who">${mine?'Your voice':'Phone voice'}</span><button type="button" class="sh-play" data-i="${i}" aria-label="Hear ${esc(REACTS[i])}">▶</button><button type="button" class="sh-rec" data-i="${i}" aria-label="Record ${esc(REACTS[i])}"><i></i></button>${mine?`<button type="button" class="sh-del" data-i="${i}" aria-label="Go back to the phone voice">✕</button>`:'<span class="sh-gap"></span>'}</div>`}).join('');
  box.querySelectorAll('.sh-play').forEach(b=>b.onclick=()=>{const i=+b.dataset.i;if(!playRecorded(ME>=0?ME:-1,i)){const v=MYVOICE;if(v&&((v[1]>>i)&1))return;const was=SPEAK;SPEAK=true;sayShout(ME>=0?ME:0,i);SPEAK=was}});
  box.querySelectorAll('.sh-rec').forEach(b=>b.onclick=()=>recordShout(+b.dataset.i,b));
  box.querySelectorAll('.sh-del').forEach(b=>b.onclick=()=>{send({type:'shout_del',i:+b.dataset.i});SND('flick')})}
async function recordShout(i,btn){
  if(REC){REC.stop();return}
  let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}})}catch(e){info('Microphone not available',`Your browser said: ${esc(e.message||e.name)}. Allow the microphone for this site, then try again.`);return}
  const AC=window.AudioContext||window.webkitAudioContext,ac=new AC(),src=ac.createMediaStreamSource(stream),proc=ac.createScriptProcessor(4096,1,1),chunks=[];let done=false;
  proc.onaudioprocess=e=>{if(!done)chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))};src.connect(proc);proc.connect(ac.destination);
  btn.classList.add('rec');
  const stop=async()=>{if(done)return;done=true;clearTimeout(REC&&REC.t);REC=null;btn.classList.remove('rec');try{src.disconnect();proc.disconnect()}catch{}stream.getTracks().forEach(t=>t.stop());const rate=ac.sampleRate;ac.close().catch(()=>{});
    const wav=encodeShout(chunks,rate);if(!wav){toast('Nothing heard. Try again, a little louder.');return}
    send({type:'shout_set',i,wav});toast(`Saved. That's your ${REACTS[i]}`)};
  REC={stop,t:setTimeout(stop,1900)}}
// trim the silence, keep up to 1.8 seconds, even out the level, and pack it as a small 11 kHz WAV
function encodeShout(chunks,rate){let n=0;for(const c of chunks)n+=c.length;if(!n)return null;const x=new Float32Array(n);let o=0;for(const c of chunks){x.set(c,o);o+=c.length}
  let a=0,b=n-1;while(a<n&&Math.abs(x[a])<.03)a++;while(b>a&&Math.abs(x[b])<.03)b--;if(b-a<rate*.08)return null;
  a=Math.max(0,a-Math.round(rate*.04));b=Math.min(n-1,b+Math.round(rate*.12));b=Math.min(b,a+Math.round(rate*1.8));
  const R=11025,step=rate/R,m=Math.floor((b-a)/step),y=new Float32Array(m);let peak=0;
  for(let k=0;k<m;k++){const t=a+k*step,i0=Math.floor(t),f=t-i0;let acc=0,cnt=0;for(let j=Math.max(a,i0-1);j<=Math.min(b,i0+1);j++){acc+=x[j];cnt++}y[k]=cnt?acc/cnt:(x[i0]*(1-f)+(x[i0+1]||0)*f);peak=Math.max(peak,Math.abs(y[k]))}
  const g=peak>0?Math.min(6,.92/peak):1,fade=Math.round(R*.01);
  const buf=new ArrayBuffer(44+m*2),d=new DataView(buf),w=(off,str)=>{for(let k=0;k<str.length;k++)d.setUint8(off+k,str.charCodeAt(k))};
  w(0,'RIFF');d.setUint32(4,36+m*2,true);w(8,'WAVE');w(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,R,true);d.setUint32(28,R*2,true);d.setUint16(32,2,true);d.setUint16(34,16,true);w(36,'data');d.setUint32(40,m*2,true);
  for(let k=0;k<m;k++){let v=y[k]*g;if(k<fade)v*=k/fade;if(k>m-fade)v*=(m-k)/fade;d.setInt16(44+k*2,Math.max(-1,Math.min(1,v))*32767,true)}
  const bytes=new Uint8Array(buf);let bin='';for(let k=0;k<bytes.length;k+=8192)bin+=String.fromCharCode.apply(null,bytes.subarray(k,k+8192));return btoa(bin)}
// quick reactions
const REACTS=(window.TeteEngine&&window.TeteEngine.REACTS)||[];const isEmo=t=>!/[A-Za-z]/.test(t);
function toggleReacts(){const bar=$('#reactbar');if(!bar.hidden){bar.hidden=true;return}if(!S||!S.started||ME<0){toast('Reactions are for when the game is on');return}
  const order=REACTS.map((t,i)=>i).sort((a,b)=>isEmo(REACTS[a])-isEmo(REACTS[b])||a-b);
  bar.innerHTML=order.map(i=>{const t=REACTS[i];return`<button type="button" data-r="${i}" class="${isEmo(t)?'em':''}">${esc(t)}</button>`}).join('')+'<form class="chatrow" id="chatrow" autocomplete="off"><input id="chat-in" maxlength="120" placeholder="Say something to the table…" enterkeyhint="send" aria-label="Message to the table"><button type="submit" class="send">Send</button></form>';bar.hidden=false;
  bar.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{bar.hidden=true;act({type:'react',r:+b.dataset.r})});
  $('#chatrow').onsubmit=e=>{e.preventDefault();const t=$('#chat-in').value.trim();if(!t)return;act({type:'chat',t});bar.hidden=true;SND('flick')};SND('flick')}
$('#btn-react').onclick=e=>{e.stopPropagation();toggleReacts()};
document.addEventListener('pointerdown',e=>{const bar=$('#reactbar');if(!bar.hidden&&!e.target.closest('#reactbar')&&!e.target.closest('#btn-react'))bar.hidden=true});
function reactFx(pid,r){const t=REACTS[r];if(t===undefined)return;const a=seatCenterRect(pid);SND('pop',{bg:true});sayShout(pid,r);if(!a||document.hidden)return;
  const e=document.createElement('div');e.className='react'+(isEmo(t)?' em':'');e.textContent=t;layer().appendChild(e);const w=e.offsetWidth,h=e.offsetHeight;
  e.style.left=(a.left+a.width/2-w/2)+'px';e.style.top=(a.top-h*.4)+'px';const wob=(Math.random()-.5)*16;
  e.animate([{transform:'translateY(10px) scale(.4)',opacity:0},{offset:.15,transform:`translateY(-12px) scale(1.25) rotate(${wob}deg)`,opacity:1},{offset:.3,transform:`translateY(-20px) scale(1) rotate(${-wob/2}deg)`,opacity:1},{offset:.8,transform:'translateY(-58px) scale(1)',opacity:1},{transform:'translateY(-76px) scale(.95)',opacity:0}],{duration:2100,easing:'ease-out'}).onfinish=()=>e.remove();setTimeout(()=>e.remove(),2600)}
function seatCenterRect(pid){return rectOf($(`#seat-${pid} .av`))}
// spraying money, party style: notes peel off the sprayer's hand, flutter across, rain on the receiver and pile up at
// their seat, then get gathered in; a big spray (ten wagers or more) also makes it rain over the whole table
const NOTES=[['n1000','1000'],['n500','500'],['n200','200'],['n1000','1000'],['n500','500']];
function noteEl(i){const e=document.createElement('div');const [c,v]=NOTES[i%NOTES.length];e.className='naira '+c;e.textContent=v;return e}
function sprayFx(from,to,amt){
  const P=S.players,w=S.wager||50,mult=amt/w,big=mult>=10;
  SND('spray',{bg:true});setTimeout(()=>SND('cash',{bg:true}),650);if(big)setTimeout(()=>SND('spray',{bg:true}),380);
  if(P[from])bubble(from,big?'Make it rain! 💸':'Spray am! 💸',1700);
  if(big&&P[from]&&P[to])setTimeout(()=>banner(`${P[from].name} is spraying ${P[to].name}! 💸`,'cash'),250);
  if(to===ME)buzz([30,40,30,40,30,40,140]);else if(from===ME)buzz(25);
  const a=seatCenterRect(from),b=seatCenterRect(to),land=650+Math.min(1400,amt/w*60);
  setTimeout(()=>{cashGain(to,amt);const tel=$('#seat-'+to);if(tel){tel.classList.add('showered');setTimeout(()=>tel.classList.remove('showered'),2200)}},land);
  if(!a||!b||RM())return;
  const n=Math.round(Math.max(14,Math.min(80,8+mult*7))),L=layer(),ax=a.left+a.width/2,ay=a.top+a.height/2,bx=b.left+b.width/2,by=b.top+b.height/2;
  for(let i=0;i<n;i++){const e=noteEl(i);L.appendChild(e);const W=e.offsetWidth||38,H=e.offsetHeight||20;
    e.style.left=(ax-W/2)+'px';e.style.top=(ay-H/2)+'px';
    const hx=bx-ax+(Math.random()-.5)*90,hy=Math.max(24-ay,(b.top-ay)-50-Math.random()*70); // over their head, never off the top
    const px=bx-ax+(Math.random()-.5)*(70+Math.min(60,n)),py=by-ay+6+Math.random()*30; // the pile round their seat
    const r0=(Math.random()-.5)*60,r1=(Math.random()-.5)*540,r2=(Math.random()-.5)*50,f=Math.random()<.5?1:-1;
    const dur=1500+Math.random()*500,delay=i*Math.max(18,Math.min(45,1400/n)),hold=1300+Math.random()*500;
    const an=e.animate([
      {transform:`translate(0px,0px) rotate(${r0}deg) rotateY(0deg) scale(.55)`,opacity:0},
      {offset:.06,opacity:1},
      {offset:.42,transform:`translate(${hx.toFixed(0)}px,${hy.toFixed(0)}px) rotate(${(r1*.6).toFixed(0)}deg) rotateY(${180*f}deg) scale(1.08)`},
      {offset:.7,transform:`translate(${((hx+px)/2+f*14).toFixed(0)}px,${((hy+py)/2).toFixed(0)}px) rotate(${(r1*.85).toFixed(0)}deg) rotateY(${300*f}deg) scale(1)`},
      {offset:1,transform:`translate(${px.toFixed(0)}px,${py.toFixed(0)}px) rotate(${(r1+r2).toFixed(0)}deg) rotateY(${360*f}deg) scale(.92)`,opacity:1}
    ],{duration:dur,delay,easing:'cubic-bezier(.25,.6,.35,1)',fill:'both'});
    // gathered in: the pile slides into their seat and is gone
    an.onfinish=()=>{const g=e.animate([{transform:`translate(${px.toFixed(0)}px,${py.toFixed(0)}px) rotate(${(r1+r2).toFixed(0)}deg) scale(.92)`,opacity:1},{offset:.7,opacity:1},{transform:`translate(${(bx-ax).toFixed(0)}px,${(by-ay).toFixed(0)}px) rotate(0deg) scale(.2)`,opacity:0}],{duration:420,delay:hold,easing:'cubic-bezier(.5,0,.75,0)',fill:'forwards'});g.onfinish=()=>e.remove()};
    setTimeout(()=>e.remove(),dur+delay+hold+900)}
  if(big)rainFx(Math.min(46,Math.round(mult*2.5)),450);
}
// money rain over the whole table
function rainFx(n,delay0){const tr=rectOf($('#table'));if(!tr||RM())return;const L=layer();
  for(let i=0;i<n;i++){const e=noteEl(i+2);L.appendChild(e);const x=tr.left+Math.random()*tr.width,y0=tr.top-30,fall=tr.height+60,sway=(Math.random()-.5)*120,f=Math.random()<.5?1:-1;
    e.style.left=x+'px';e.style.top=y0+'px';
    e.animate([{transform:'translate(0px,0px) rotate(0deg) rotateY(0deg)',opacity:0},{offset:.08,opacity:1},{offset:.5,transform:`translate(${(sway*.6).toFixed(0)}px,${(fall*.5).toFixed(0)}px) rotate(${f*200}deg) rotateY(${f*240}deg)`},{offset:.88,opacity:1},{transform:`translate(${sway.toFixed(0)}px,${fall.toFixed(0)}px) rotate(${f*420}deg) rotateY(${f*520}deg)`,opacity:0}],{duration:1800+Math.random()*900,delay:delay0+Math.random()*900,easing:'linear',fill:'both'}).onfinish=()=>e.remove();
    setTimeout(()=>e.remove(),4200)}}
// the big "+₦" over the receiver
function cashGain(pid,amt){const el=pid===ME?$('#mychips'):$(`#seat-${pid} .chips`),r=rectOf(el);if(!r||document.hidden)return;
  const g=document.createElement('div');g.className='gain cashgain';g.textContent='+₦'+fmt(amt);g.style.left=(r.left+r.width/2)+'px';g.style.top=(r.top-10)+'px';layer().appendChild(g);
  g.animate([{transform:'translate(-50%,0px) scale(.5)',opacity:0},{offset:.12,transform:'translate(-50%,-18px) scale(1.35)',opacity:1},{offset:.25,transform:'translate(-50%,-24px) scale(1)',opacity:1},{offset:.8,transform:'translate(-50%,-58px) scale(1)',opacity:1},{transform:'translate(-50%,-78px) scale(.95)',opacity:0}],{duration:2100,easing:'ease-out'}).onfinish=()=>g.remove();setTimeout(()=>g.remove(),2600)}
function treatFx(from,to,item){const t=TREATS[item];if(!t)return;SND('pour',{bg:true});if(to.length>1)bubble(from,'Round on me! 🥂',1800);
  const a=seatCenterRect(from);let landed=false;
  to.forEach((pid,i)=>{const b=seatCenterRect(pid);if(!a||!b||document.hidden)return;const e=document.createElement('div');e.className='flytreat';e.textContent=t.e;layer().appendChild(e);
    const sx=a.left+a.width/2-15,sy=a.top+a.height/2-15,ex=b.left-6,ey=b.top-8;e.style.left=sx+'px';e.style.top=sy+'px';const dx=ex-sx,dy=ey-sy;
    const an=e.animate([{transform:'translate(0px,0px) scale(.4) rotate(-20deg)',opacity:0},{offset:.15,opacity:1},{offset:.55,transform:`translate(${(dx*.5).toFixed(1)}px,${(dy*.5-70).toFixed(1)}px) scale(1.5) rotate(12deg)`},{transform:`translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(.7) rotate(0deg)`,opacity:1}],{duration:900,delay:i*130,easing:'cubic-bezier(.3,.7,.35,1)',fill:'backwards'});
    an.onfinish=()=>{e.remove();if(!landed){landed=true;SND('clink',{bg:true})}const tr=$(`#seat-${pid} .treat`);if(tr)tr.animate([{transform:'scale(2.2)'},{transform:'scale(1)'}],{duration:380,easing:'cubic-bezier(.2,1.4,.4,1)'})};setTimeout(()=>e.remove(),2500)})}
// ---------- table settings: the host (or anyone seated while the host is away) can change them mid-game ----------
let TSV={};
function canEditTable(){if(!S||ME<0)return false;if(HOST||LOCALT)return true;const h=S.players[S.hostId];return!h||h.isBot||h.gone||h.away}
function openTableSettings(){if(!S)return;const pc=S.pending||{};
  TSV={tie:(pc.tieSplit!=null?pc.tieSplit:S.tieSplit)?'split':'playoff',series:+(pc.series!=null?pc.series:S.series),side:+(pc.side!=null?pc.side:S.side),fill:+(pc.fill!=null?pc.fill:S.fill),pub:+S.pub,keep:+S.keep};
  $('#ts-name').value=S.tableName||'';
  setOpt($('.opts[data-for="ts-wager"]'),pc.wager!=null?pc.wager:S.wager);setOpt($('.opts[data-for="ts-buyin"]'),S.buyIn);setOpt($('.opts[data-for="ts-timer"]'),S.timer);
  $$('#m-tset .seg[data-ts="pub"],#m-tset .seg[data-ts="keep"]').forEach(g=>{g.closest('.field').hidden=!!LOCALT});syncTS();
  const edit=canEditTable(),hp=S.players[S.hostId];$('#m-tset').classList.toggle('readonly',!edit);$('#ts-save').hidden=!edit;
  $('#ts-note').textContent=edit?'The wager and the rules change from the next hand; the rest at once. Everyone at the table is told.':`Only the host${hp?` (${hp.name})`:''} can change these, or anyone seated while the host is away.`;
  renderTsPlayers();openModal('#m-tset');SND('flick')}
// the host can take anyone off the table from Table settings too (tap Remove, then tap again to be sure)
function renderTsPlayers(){const f=$('#ts-players-f');if(!f||!S)return;const others=S.players.filter(p=>!p.gone&&p.id!==ME&&p.id!==S.hostId);f.hidden=!(HOST&&!LOCALT&&others.length);if(f.hidden)return;
  $('#ts-players').innerHTML=others.map(p=>`<div class="tsp"><span class="tsp-n">${esc(p.name)}${p.isBot?'<small>computer</small>':p.away?'<small>away</small>':''}</span>${!p.isBot&&!p.away?`<button type="button" class="btn btn-ghost" data-host="${p.id}">Make host</button>`:''}<button type="button" class="btn btn-ghost kickbtn" data-kick="${p.id}">Remove</button></div>`).join('');
  $$('#ts-players [data-host]').forEach(b=>b.onclick=()=>{const pid=+b.dataset.host,p=S&&S.players[pid];if(!p||p.gone)return;
    if(!b.classList.contains('armed')){$$('#ts-players .armed').forEach(x=>{x.classList.remove('armed');x.textContent=x.dataset.kick?'Remove':'Make host'});b.classList.add('armed');b.textContent=`Yes, make ${p.name} host`;SND('flick');return}
    send({type:'make_host',pid});closeModal('#m-tset');toast(`${p.name} is the host now`,2500);SND('pop')});
  $$('#ts-players [data-kick]').forEach(b=>b.onclick=()=>{const pid=+b.dataset.kick,p=S&&S.players[pid];if(!p||p.gone)return;
    if(!b.classList.contains('armed')){$$('#ts-players .armed').forEach(x=>{x.classList.remove('armed');x.textContent=x.dataset.kick?'Remove':'Make host'});b.classList.add('armed');b.textContent=`Yes, remove ${p.name}`;SND('flick');return}
    send({type:'remove',pid});b.closest('.tsp').remove();toast(`${p.name} is off the table`,2500);if(!$('#ts-players .tsp'))f.hidden=true})}
function syncTS(){$$('#m-tset .seg[data-ts]').forEach(g=>{const k=g.dataset.ts;g.querySelectorAll('button').forEach(b=>b.classList.toggle('on',String(TSV[k])===b.dataset.v))})}
$$('#m-tset .seg[data-ts] button').forEach(b=>b.onclick=()=>{const k=b.closest('.seg').dataset.ts;TSV[k]=k==='tie'?b.dataset.v:+b.dataset.v;syncTS();SND('flick')});
$('#ts-save').onclick=()=>{const c={tableName:$('#ts-name').value.trim(),wager:+$('#ts-wager').value,buyIn:+$('#ts-buyin').value,timer:+$('#ts-timer').value,tie:TSV.tie,series:!!TSV.series,side:!!TSV.side,fill:!!TSV.fill,pub:!!TSV.pub,keep:!!TSV.keep};
  if(LOCALT){delete c.pub;delete c.keep}if(c.wager>c.buyIn){toast('The wager can\'t be more than the buy-in');nudgeEl($('.opts[data-for="ts-wager"]'));return}
  closeModal('#m-tset');act({type:'settings',cfg:c})};
$('#btn-tset').onclick=openTableSettings;$('#btn-tset2').onclick=openTableSettings;$('#btn-wager').onclick=openTableSettings;
// a one-time pointer for whoever can change the table: where the wager and the rules live
var TIP_TSET,TIP_WAIT=0;
function tipSettings(){if(TIP_TSET===undefined)try{TIP_TSET=localStorage.getItem('tete.tip.tset')==='1'}catch{TIP_TSET=false}
  if(TIP_TSET||TIP_WAIT||!S||!S.started||!canEditTable())return;
  TIP_WAIT=setTimeout(function show(){TIP_WAIT=0;const b=$('#btn-tset2');
    if(TIP_TSET||!S||!S.started||!canEditTable()||!$('#game').classList.contains('on')||!b||!b.offsetParent)return;
    if($('.modal.on')){TIP_WAIT=setTimeout(show,1200);return} // wait until nothing is covering it
    const r=b.getBoundingClientRect();if(!r.width)return;
    TIP_TSET=true;try{localStorage.setItem('tete.tip.tset','1')}catch{}
    const t=document.createElement('div');t.className='coach';t.setAttribute('role','status');
    t.innerHTML='<b>New</b>Change the wager, Series and the other rules here, any time in the game.';document.body.appendChild(t);
    const w=t.offsetWidth,x=Math.min(innerWidth-w-10,Math.max(10,r.left+r.width/2-w/2));t.style.left=x+'px';t.style.top=(r.bottom+12)+'px';t.style.setProperty('--ax',(r.left+r.width/2-x)+'px');
    let gone=false;const bye=()=>{if(gone)return;gone=true;t.classList.add('out');setTimeout(()=>t.remove(),300);document.removeEventListener('pointerdown',bye,true)};
    document.addEventListener('pointerdown',bye,true);setTimeout(bye,9000)},1600)}
// ---------- tonight: who's up and who's down since they sat ----------
const signed=n=>(n>0?'+':n<0?'−':'±')+fmt(Math.abs(n));
const avOf=(r,me)=>me?avStyle(AV,esc(r.name[0].toUpperCase())):r.bot||r.isBot?{style:`background:${r.color}`,text:esc(r.name[0].toUpperCase())}:avStyle(Array.isArray(r.av)?(r.av[0]==='e'?{kind:'emoji',emoji:r.av[1]}:{kind:'initial',color:r.av[1]}):r.av,esc(r.name[0].toUpperCase()));
let TSIG='';
function renderTonight(){const box=$('#tonight');if(!box||!S)return;
  if(!S.started){if(TSIG!=='-'){TSIG='-';box.innerHTML='<div class="note" style="margin:0">Scores start with the first hand.</div>'}return}
  const rows=S.players.filter(p=>!p.gone).map(p=>({p,net:p.chips-(p.bought!=null?p.bought:S.buyIn)})).sort((a,b)=>b.net-a.net||b.p.wins-a.p.wins);
  const sig=rows.map(r=>[r.p.id,r.net,r.p.wins,r.p.best,r.p.name,r.p.id===ME].join(':')).join('|');if(sig===TSIG)return;TSIG=sig;
  box.innerHTML=rows.map((r,i)=>{const p=r.p,a=avOf(p,p.id===ME),medal=r.net>0&&i<3?['🥇','🥈','🥉'][i]:String(i+1),cls=r.net>0?'up':r.net<0?'down':'even';
    return`<div class="trow${p.id===ME?' me':''}"><span class="rk">${medal}</span><span class="dot" style="${a.style}">${a.text}</span><span class="who">${esc(p.name)}${p.id===ME?'<small>you</small>':''}</span><span class="meta">${p.wins?p.wins+' won':''}${p.best>=2?' · 🔥'+p.best:''}</span><span class="net ${cls}">${signed(r.net)}</span></div>`}).join('')}
// the host closed the room: everyone sees the final table, winner on top
function showResults(final,tn,owed){
  const ow=$('#res-owed');if(ow){ow.innerHTML=owed&&owed.length?'<h3>Still owed</h3>'+owed.map(l=>`<div class="owe"><b>${esc(l.to)}</b> owes <b>${esc(l.from)}</b> <span class="num">${fmt(l.owe)}</span></div>`).join(''):'';ow.hidden=!(owed&&owed.length)}
  const w=final[0];$('#res-title').textContent=(tn&&tn!=='Table'?tn+': ':'')+'final scores';
  $('#res-sub').textContent=w.net>0?`${w.name} takes the night, ${signed(w.net)}.`:'Nobody finished up. The house thanks you all.';
  const pod=(r,place)=>{if(!r)return'<div class="pod empty"></div>';const a=avOf(r,false);return`<div class="pod p${place}"><div class="pav" style="${a.style}">${a.text}${place===1&&r.net>0?'<span class="crown">👑</span>':''}</div><b>${esc(r.name)}</b><span class="net ${r.net>0?'up':r.net<0?'down':'even'}">${signed(r.net)}</span><small>${r.wins} won${r.best>=2?' · best run '+r.best:''}</small><div class="step">${place}</div></div>`};
  $('#res-podium').innerHTML=pod(final[1],2)+pod(final[0],1)+pod(final[2],3);
  $('#res-rest').innerHTML=final.slice(3).map((r,i)=>{const a=avOf(r,false);return`<div class="trow"><span class="rk">${i+4}</span><span class="dot" style="${a.style}">${a.text}</span><span class="who">${esc(r.name)}</span><span class="meta">${r.wins?r.wins+' won':''}</span><span class="net ${r.net>0?'up':r.net<0?'down':'even'}">${signed(r.net)}</span></div>`}).join('');
  openModal('#m-results');SND('sting',{bg:true});buzz([40,30,90]);
  if(!RM()){const b=$('#m-results .box');$$('#res-podium .pod').forEach((el,i)=>el.animate([{transform:'translateY(40px)',opacity:0},{transform:'none',opacity:1}],{duration:520,delay:[260,0,420][i],easing:'cubic-bezier(.2,1.3,.4,1)',fill:'backwards'}));if(w.net>0)setTimeout(()=>confetti(b),300)}}
$('#res-done').onclick=()=>closeModal('#m-results');
// ---------- the call: the first card dropped calls the suit; a crown rides on the card leading the call ----------
let MKL=null,MKS={hand:-1,by:-1,top:-1};
function markLayer(){if(MKL)return MKL;MKL=document.createElement('div');MKL.className='marklayer';MKL.innerHTML='<div class="crownmk" hidden><i>👑</i></div><div class="callmk" hidden>CALL</div>';document.body.appendChild(MKL);
  try{new ResizeObserver(()=>placeMarks()).observe($('#table'))}catch{}return MKL}
function callInfo(){if(!S||S.phase<3||S.phase>4||!S.leadSuit||!$('#game').classList.contains('on'))return null;
  let top=-1,tv=-1;for(const id of S.participants){const c=S.players[id]&&S.players[id].dropped;if(c&&c.r!==undefined&&c.s===S.leadSuit&&val(c)>tv){tv=val(c);top=id}}
  if(S.phase===4&&S.trickWinner>=0)top=S.trickWinner;
  return{suit:S.leadSuit,by:S.leadBy,top,tv}}
// a seat's dropped card once it has landed (not while it is still flying in)
function landedDrop(pid){if(pid==null||pid<0)return null;const c=$(`#seat-${pid} .dropwrap .card`);return c&&!c.classList.contains('incoming')&&c.getBoundingClientRect().width?c:null}
function hideMark(el){if(el.hidden||el.dataset.out)return;el.dataset.out='1';const done=()=>{if(!el.dataset.out)return;delete el.dataset.out;el.hidden=true};if(RM()){done();return}el.animate([{opacity:1},{opacity:0}],{duration:220}).onfinish=done;setTimeout(done,400)}
function showMark(el){const fresh=el.hidden||!!el.dataset.out;delete el.dataset.out;el.hidden=false;return fresh}
function placeMarks(){
  const L=markLayer(),cr=L.querySelector('.crownmk'),cl=L.querySelector('.callmk'),ci=callInfo();
  $$('#seats .dropwrap').forEach(w=>w.classList.remove('call','top','off'));
  if(!ci){hideMark(cr);hideMark(cl);MKS={hand:-1,by:-1,top:-1};callPill(null);return}
  if(MKS.hand!==S.handNo)MKS={hand:S.handNo,by:-1,top:-1};
  // cards that didn't follow the call can't win: greyed
  for(const id of S.participants){const c=S.players[id]&&S.players[id].dropped,w=$(`#seat-${id} .dropwrap`);if(w&&c&&c.r!==undefined&&c.s!==ci.suit)w.classList.add('off')}
  // the call card wears a CALL tag just under it (the card's number stays clear), and its suit flies to the middle of the table
  const cc=landedDrop(ci.by);
  if(cc){cc.parentNode.classList.add('call');const r=cc.getBoundingClientRect();cl.style.left=Math.round(r.left+r.width/2)+'px';cl.style.top=Math.round(r.bottom+(r.width<36?6:8))+'px';cl.classList.toggle('sm',r.width<36);
    if(showMark(cl)&&!RM())cl.animate([{transform:'translate(-50%,-10%) scale(.3)',opacity:0},{offset:.6,transform:'translate(-50%,-50%) scale(1.2)',opacity:1},{transform:'translate(-50%,-50%) scale(1)',opacity:1}],{duration:420,easing:'cubic-bezier(.2,.9,.3,1.2)'});
    if(MKS.by!==ci.by){MKS.by=ci.by;callFly(cc,ci.suit)}}
  else if(ci.by<0)hideMark(cl);
  // the crown sits on the top-right corner of the card leading the call, clear of its number (top left and
  // bottom right); when someone beats it, it hops across
  const want=landedDrop(ci.top)?ci.top:(landedDrop(MKS.top)?MKS.top:-1),tc=landedDrop(want);
  if(tc){tc.parentNode.classList.add('top');const r=tc.getBoundingClientRect(),x=Math.round(r.right-r.width*.1),y=Math.round(r.top+1);cr.style.setProperty('--cs',Math.round(Math.max(14,Math.min(24,r.width*.5)))+'px');
    const px=parseFloat(cr.style.left),py=parseFloat(cr.style.top),hop=!cr.hidden&&!cr.dataset.out&&MKS.top>=0&&MKS.top!==want;
    cr.style.left=x+'px';cr.style.top=y+'px';
    if(showMark(cr)){if(!RM())cr.animate([{transform:'translateY(-30px) scale(1.9)',opacity:0},{offset:.6,transform:'translateY(3px) scale(.92)',opacity:1},{transform:'none',opacity:1}],{duration:560,delay:MKS.by===ci.by&&want===ci.by?380:0,easing:'cubic-bezier(.3,.7,.3,1)',fill:'backwards'})}
    else if(hop){const dx=px-x,dy=py-y,lift=Math.min(110,46+Math.hypot(dx,dy)*.22);if(!RM()){cr.animate([{transform:`translate(${dx}px,${dy}px)`},{offset:.5,transform:`translate(${dx*.5}px,${dy*.5-lift}px) rotate(200deg) scale(1.55)`},{transform:'none'}],{duration:640,easing:'cubic-bezier(.45,0,.3,1)'});setTimeout(()=>sparksAt(x,y,'spark',12,Math.PI*2,48,0),600)}SND('sparkle')}
    MKS.top=want}
  else hideMark(cr);
  callPill(ci);
}
// the middle of the table says which suit is called and who leads it
function callPill(ci){const el=$('#callpill');if(!el)return;$('#board').classList.toggle('calling',!!ci);if(!ci){el.hidden=true;return}
  el.classList.toggle('red',ci.suit==='♥'||ci.suit==='♦');el.querySelector('.cs').textContent=ci.suit;
  const tp=MKS.top>=0?S.players[MKS.top]:null,tc=tp&&tp.dropped,k=tp&&tc&&tc.r!==undefined?`👑 ${tp.id===ME?'You':tp.name} · ${cname(tc)}`:'',cl=el.querySelector('.cl');
  if(cl.textContent!==k){cl.textContent=k;if(!el.hidden&&k&&!RM())cl.animate([{transform:'translateY(7px)',opacity:0},{transform:'none',opacity:1}],{duration:280,easing:'ease-out'})}
  el.hidden=false}
function callFly(card,suit){const pill=$('#callpill');SND('snap');if(!pill||RM())return;
  callPill(callInfo());const tgt=pill.querySelector('.cs').getBoundingClientRect(),a=card.getBoundingClientRect();if(!tgt.width)return;
  const g=document.createElement('div');g.className='suitfly'+(suit==='♥'||suit==='♦'?' red':'');g.textContent=suit;layer().appendChild(g);
  const x1=tgt.left+tgt.width/2,y1=tgt.top+tgt.height/2,dx=a.left+a.width/2-x1,dy=a.top+a.height/2-y1;g.style.left=x1+'px';g.style.top=y1+'px';
  g.animate([{transform:`translate(-50%,-50%) translate(${dx}px,${dy}px) scale(.6)`,opacity:0},{offset:.15,opacity:1},{offset:.55,transform:`translate(-50%,-50%) translate(${dx*.4}px,${dy*.4-56}px) scale(2.3)`,opacity:1},{transform:'translate(-50%,-50%) scale(1)',opacity:.2}],{duration:720,easing:'cubic-bezier(.3,.6,.3,1)'}).onfinish=()=>g.remove();setTimeout(()=>g.remove(),1600);
  pill.animate([{transform:'translateX(-50%) scale(.5)',opacity:0},{offset:.7,transform:'translateX(-50%) scale(1.12)',opacity:1},{transform:'translateX(-50%) scale(1)',opacity:1}],{duration:480,delay:560,easing:'cubic-bezier(.2,.9,.3,1.2)',fill:'backwards'})}
// ---------- hot streaks and twenty-one ----------
// glowing bits that shoot out from a seat: embers for a streak, gold sparks for 21, smoke when a run ends
function sparks(pid,cls,n,spread,reach,up){const a=seatCenterRect(pid);if(!a)return;sparksAt(a.left+a.width/2,a.top+a.height/2,cls,n,spread,reach,up)}
function sparksAt(cx,cy,cls,n,spread,reach,up){if(RM())return;
  for(let i=0;i<n;i++){const e=document.createElement('div');e.className=cls;layer().appendChild(e);const ang=-Math.PI/2+(Math.random()-.5)*spread,dist=reach*(.45+Math.random()*.55),dx=Math.cos(ang)*dist,dy=Math.sin(ang)*dist-(up||0),s=.6+Math.random()*.8;
    e.style.left=cx+'px';e.style.top=cy+'px';
    e.animate([{transform:`translate(-50%,-50%) scale(${s.toFixed(2)})`,opacity:1},{offset:.55,opacity:1},{transform:`translate(calc(-50% + ${dx.toFixed(0)}px),calc(-50% + ${dy.toFixed(0)}px)) scale(${(s*.25).toFixed(2)})`,opacity:0}],{duration:650+Math.random()*650,delay:Math.random()*140,easing:'cubic-bezier(.2,.7,.3,1)',fill:'backwards'}).onfinish=()=>e.remove();setTimeout(()=>e.remove(),2000)}}
function streakFx(pid,n){const p=S&&S.players[pid];if(!p)return;
  SND('flare',{bg:true,arg:n});
  if(n===3)setTimeout(()=>bubble(pid,'3 in a row! 🔥',1900),350);else if(n>=5)setTimeout(()=>bubble(pid,`${n} in a row! 🔥🔥`,2100),350);
  if(n>=5)setTimeout(()=>banner(`🔥 ${p.name} is on fire 🔥`,'fire'),1300);
  if(pid===ME)buzz(n>=5?[40,30,40,30,140]:[30,30,70]);
  const fl=$(`#seat-${pid} .flame`);if(fl&&!RM())fl.animate([{transform:'translateX(-50%) scale(2.6)',opacity:.1},{offset:.55,transform:'translateX(-50%) scale(.85)',opacity:1},{transform:'translateX(-50%) scale(1)',opacity:1}],{duration:700,easing:'cubic-bezier(.2,1.4,.4,1)'});
  sparks(pid,'ember',Math.min(30,8+n*4),Math.PI*1.2,60+n*14,24)}
function streakEndFx(pid,n){SND('fizzle',{bg:true});bubble(pid,n>=5?'Fire out 💨':'Streak over 💨',1700);sparks(pid,'smoke',9,Math.PI*.7,46,30)}
// 21: a gold burst from the seat; bigger when it wins the pot, with a glow round your screen when it's yours
function fx21(pid,mode){
  const big=mode==='win',mine=pid===ME;
  if(mode!=='mine'){SND('twentyone',{bg:true});if(big)SND('sparkle',{bg:true,delay:.5})}
  if(mine)buzz(big?[50,40,50,40,160]:[30,40,30,40,90]);
  const a=seatCenterRect(pid);if(!a||RM())return;
  const cx=a.left+a.width/2,cy=a.top+a.height/2,size=Math.max(a.width,a.height);
  const b=document.createElement('div');b.className='b21'+(big?' big':'');b.style.left=cx+'px';b.style.top=cy+'px';b.style.setProperty('--s',size+'px');
  b.innerHTML=`${big?'<div class="b21-rays"></div>':''}<div class="b21-ring"></div><div class="b21-ring r2"></div><div class="b21-num">21</div>`;layer().appendChild(b);
  const dur=big?2600:1900,ring=(el,d)=>el.animate([{transform:'translate(-50%,-50%) scale(.35)',opacity:1},{transform:`translate(-50%,-50%) scale(${big?3.6:2.6})`,opacity:0}],{duration:big?900:700,delay:d,easing:'cubic-bezier(.15,.7,.3,1)',fill:'backwards'});
  const rs=b.querySelectorAll('.b21-ring');ring(rs[0],0);ring(rs[1],160);
  b.querySelector('.b21-num').animate([{transform:'translate(-50%,-50%) scale(.2) rotate(-14deg)',opacity:0},{offset:.14,transform:'translate(-50%,-50%) scale(1.55) rotate(4deg)',opacity:1},{offset:.26,transform:'translate(-50%,-50%) scale(1) rotate(0deg)',opacity:1},{offset:.78,transform:`translate(-50%,calc(-50% - ${big?30:44}px)) scale(1)`,opacity:1},{transform:`translate(-50%,calc(-50% - ${big?44:64}px)) scale(.92)`,opacity:0}],{duration:dur,easing:'ease-out',fill:'both'});
  const ry=b.querySelector('.b21-rays');if(ry)ry.animate([{transform:'translate(-50%,-50%) rotate(0deg) scale(.4)',opacity:0},{offset:.2,opacity:1},{offset:.75,opacity:.9},{transform:'translate(-50%,-50%) rotate(70deg) scale(1.15)',opacity:0}],{duration:dur,easing:'ease-out',fill:'both'});
  setTimeout(()=>b.remove(),dur+120);
  sparks(pid,'spark',big?34:20,Math.PI*2,big?150:100,0);
  if(mine){const g=document.createElement('div');g.className='goldglow';document.body.appendChild(g);g.animate([{opacity:0},{offset:.18,opacity:1},{opacity:0}],{duration:big?1700:1200,easing:'ease-out'}).onfinish=()=>g.remove();setTimeout(()=>g.remove(),2200);
    $$('#myhand .card').forEach((c,i)=>{c.classList.remove('shine21');void c.offsetWidth;c.style.animationDelay=(i*.08)+'s';c.classList.add('shine21');setTimeout(()=>c.classList.remove('shine21'),1600)})}}
// ---------- table felt: classic green, royal blue, wine, midnight or ankara ----------
const FELTS=[['green','Classic green'],['royal','Royal blue'],['wine','Wine'],['midnight','Midnight'],['ankara','Ankara']];
let FELT='green';try{FELT=localStorage.getItem('tete.felt')||'green'}catch{}
function applyFelt(f){if(!FELTS.some(x=>x[0]===f))f='green';FELT=f;document.documentElement.dataset.felt=f}
function renderFelts(){const box=$('#felt-opts');if(!box)return;box.innerHTML=FELTS.map(([k,n])=>`<button type="button" class="felt-sw${k===FELT?' on':''}" data-felt="${k}" title="${n}" aria-label="${n}" aria-pressed="${k===FELT}"></button>`).join('');$('#felt-name').textContent=(FELTS.find(x=>x[0]===FELT)||FELTS[0])[1];
  box.querySelectorAll('.felt-sw').forEach(b=>b.onclick=()=>setFelt(b.dataset.felt))}
function setFelt(f){applyFelt(f);try{localStorage.setItem('tete.felt',FELT)}catch{}renderFelts();SND('flick');const t=$('.felt');if(t&&!RM())t.animate([{filter:'brightness(1.7) saturate(1.3)'},{filter:'none'}],{duration:600,easing:'ease-out'})}
applyFelt(FELT);
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
  if(S.phase>=6||S.phase<0){info('Too late this hand','Card bets are made before the deal, and total bets until the cards are shown. Try again next hand.');return}
  if(S.phase>=1&&!S.participants.includes(ME)){info('You\'re not in this hand','Side bets are between two players in the hand. Try again next hand.');return}
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
const PCP=new Map(); // pid -> connection being set up (so two messages at once never make two connections)
function makePC(pid,initiator){
  if(PC.has(pid))return Promise.resolve(PC.get(pid));
  if(PCP.has(pid))return PCP.get(pid);
  const pr=buildPC(pid,initiator).finally(()=>PCP.delete(pid));PCP.set(pid,pr);return pr}
async function buildPC(pid,initiator){
  const ice=await getIce();if(PC.has(pid))return PC.get(pid);
  const pc=new RTCPeerConnection({iceServers:ice});const c={pc,stream:new MediaStream(),polite:ME>pid,init:ME<pid,making:false,cands:[]};PC.set(pid,c);
  pc.onicecandidate=e=>{if(e.candidate)send({type:'rtc',to:pid,data:{cand:e.candidate}})};
  pc.ontrack=e=>{if(e.track.kind==='audio'&&e.streams&&e.streams.length){c.djStream=e.streams[0];djRefresh();return}c.stream.addTrack(e.track);attachRemote(pid,c)};
  pc.onnegotiationneeded=async()=>{try{c.making=true;await pc.setLocalDescription();send({type:'rtc',to:pid,data:{sdp:pc.localDescription}})}catch(e){}finally{c.making=false}};
  pc.onconnectionstatechange=()=>{const st=pc.connectionState;clearTimeout(c.wob);
    const rearm=()=>{clearTimeout(c.dog);c.dog=setTimeout(()=>watchdog(pid,c),c.init?9000:13000)};
    if(st==='failed'){try{pc.restartIce()}catch{}rearm()}
    else if(st==='disconnected')c.wob=setTimeout(()=>{if(pc.connectionState==='disconnected'){try{pc.restartIce()}catch{}rearm()}},4000);
    else if(st==='connected'){clearTimeout(c.dog);TRIES.delete(pid);tuneSenders();if(DJ&&!(c.musicTx&&c.musicTx.sender&&c.musicTx.sender.track))addMusic(c)}};
  if(c.init)replaceTracks(c,true);
  tuneSenders();
  c.dog=setTimeout(()=>watchdog(pid,c),c.init?9000:13000);
  return c;
}
// a link that hasn't come up after a few seconds is started again from scratch (a few times at most):
// phones that lock, reload or hop between wifi and mobile data otherwise leave someone silent
const TRIES=new Map();
function watchdog(pid,c){
  if(PC.get(pid)!==c||c.pc.connectionState==='connected')return;
  const n=(TRIES.get(pid)||0)+1;TRIES.set(pid,n);if(n>4)return;
  if(c.init){dropPC(pid);makePC(pid,true)}else{send({type:'rtc',to:pid,data:{redo:1}});c.dog=setTimeout(()=>watchdog(pid,c),13000)}}
const fpOf=sdp=>(/a=fingerprint:\S+ (\S+)/.exec(sdp||'')||[])[1]||'';
// keep video light so voices never break up: the more people on camera, the less each stream may use
function tuneSenders(){const n=Math.max(1,PC.size),br=Math.round(Math.min(320000,Math.max(90000,720000/n)));
  for(const [,c] of PC){for(const s of c.pc.getSenders()){if(!s.track||s.track.kind!=='video')continue;try{const p=s.getParameters();if(!p.encodings||!p.encodings.length)p.encodings=[{}];if(p.encodings[0].maxBitrate===br)continue;p.encodings[0].maxBitrate=br;p.encodings[0].maxFramerate=15;s.setParameters(p).catch(()=>{})}catch{}}}}
function renegotiate(pid,c){const run=()=>{if(PC.get(pid)!==c)return;replaceTracks(c,c.init);tuneSenders()};SIGQ.set(pid,(SIGQ.get(pid)||Promise.resolve()).then(()=>capped(Promise.resolve().then(run))).catch(()=>{}))}
const SIGQ=new Map();
// in order, but never stuck: a step waiting on a connection that has since been closed may never finish, so each gets four seconds at most
const capped=p=>Promise.race([p,new Promise(r=>setTimeout(r,4000))]);
function rtcOnSignal(from,data,sid){const next=(SIGQ.get(from)||Promise.resolve()).then(()=>capped(handleSignal(from,data,sid))).catch(()=>{});SIGQ.set(from,next);return next}
// which screen each player is on right now: a message from a screen they have since left is ignored
const PSID=new Map();
async function handleSignal(from,data,sid){
  if(sid){const cur=PSID.get(from);if(cur&&cur!==sid)return;if(!cur)PSID.set(from,sid)}
  // the other side gave up on a stuck link: if we open this conversation, start it again
  if(data.redo){const cur=PC.get(from);if(cur&&cur.init&&cur.pc.connectionState!=='connected'){dropPC(from);makePC(from,true)}else if(!cur&&ME<from)makePC(from,true);return}
  let c=await makePC(from),pc=c.pc;
  try{
    // a brand-new connection from their side (different key): throw ours away and answer the new one
    if(data.sdp&&data.sdp.type==='offer'&&pc.remoteDescription&&fpOf(pc.remoteDescription.sdp)!==fpOf(data.sdp.sdp)){dropPC(from);c=await makePC(from);pc=c.pc}
    if(data.sdp){const offerCollision=data.sdp.type==='offer'&&(c.making||pc.signalingState!=='stable');
      if(offerCollision&&!c.polite)return;
      await pc.setRemoteDescription(data.sdp);
      for(const k of c.cands.splice(0))try{await pc.addIceCandidate(k)}catch{}
      if(data.sdp.type==='offer'){replaceTracks(c,false);await pc.setLocalDescription();send({type:'rtc',to:from,data:{sdp:pc.localDescription}})}
      tuneSenders()}
    else if(data.cand){if(!pc.remoteDescription){c.cands.push(data.cand);return}try{await pc.addIceCandidate(data.cand)}catch(e){}}
  }catch(e){console.warn('rtc',e)}
}
// someone (re)joined: whatever we had with them belongs to their old session, so start clean
function rtcOnPeerJoined(pid,sid){if(pid===ME)return;if(sid){if(PSID.get(pid)===sid&&(PC.has(pid)||PCP.has(pid)))return;PSID.set(pid,sid)}TRIES.delete(pid);dropPC(pid);if(ME<pid)makePC(pid,true)}
function dropPC(pid){toutDrop(pid);const c=PC.get(pid);if(c){clearTimeout(c.wob);clearTimeout(c.dog);c.pc.close();PC.delete(pid)}const a=$('#voice-'+pid);if(a){a.srcObject=null;a.remove()}LEVELS.delete(pid);if(c&&c.djStream)djRefresh()}
function rtcOnPeerLeft(pid){dropPC(pid);SIGQ.delete(pid);PSID.delete(pid);tuneSenders()}
function rtcLeaveAll(){stopDj(true);if(window.TeteSound&&TeteSound.djPlay)TeteSound.djPlay(null);DJ_LAST=-2;for(const [pid,c] of PC){clearTimeout(c.wob);c.pc.close()}PC.clear();SIGQ.clear();PSID.clear();$$('#voices audio').forEach(a=>{a.srcObject=null;a.remove()});LEVELS.clear();if(LOCAL){LOCAL.getTracks().forEach(t=>t.stop());LOCAL=null}}
function rtcSyncPeers(){if(!S||ME<0)return;for(const p of S.players){if(p.isBot||p.gone||p.id===ME)continue;if(!PC.has(p.id)&&ME<p.id)makePC(p.id,true)}for(const [pid] of PC){const p=S.players[pid];if(!p||p.gone||p.isBot)rtcOnPeerLeft(pid)}}
function voiceBox(){let b=$('#voices');if(!b){b=document.createElement('div');b.id='voices';b.hidden=true;document.body.appendChild(b)}return b}
function attachRemote(pid,c){if(TOUT)toutVoice(pid,c);const v=$(`#seat-${pid} .vid video`);if(v&&v.srcObject!==c.stream){v.srcObject=c.stream;v.muted=true;v.play().catch(()=>{})}
  if(c.stream.getAudioTracks().length){let a=$('#voice-'+pid);if(!a){a=document.createElement('audio');a.id='voice-'+pid;a.autoplay=true;a.setAttribute('playsinline','');voiceBox().appendChild(a)}if(a.srcObject!==c.stream)a.srcObject=c.stream;a.muted=!AVS.spk;if(a.paused)a.play().catch(()=>{});watchLevel(pid,c.stream)}}
function rtcAttachAll(){attachLocal();for(const [pid,c] of PC)attachRemote(pid,c)}
// ---------- music from your computer: a Chrome tab's sound (YouTube Music, say) played for the whole table ----------
// It goes to everyone as its own stream, apart from your mic (which carries on as normal), and it doesn't step back
// when people talk. You set how loud it goes to the table; everyone still has their own music volume. Phones can't
// share another app's sound, and Safari and Firefox can't share a tab's sound, so it's offered on Chrome or Edge.
const DJ_OK=!!(navigator.mediaDevices&&navigator.mediaDevices.getDisplayMedia)&&!/Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent)&&/Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent);
let DJ=null,DJ_SEND=0.8,DJ_LAST=-2;
try{const v=parseFloat(localStorage.getItem('tete.djvol'));if(!isNaN(v))DJ_SEND=Math.max(0,Math.min(1,v))}catch{}
async function startDj(){
  if(!S||ME<0||LOCALT)return;if(DJ)stopDj(true);
  if(!DJ_OK){info('Use a computer for this',"To play your own music for the table, open Tete in Chrome or Edge on a computer, with the music playing in another tab. Phones can't share another app's sound.");return}
  let ctx=null;try{ctx=new (window.AudioContext||window.webkitAudioContext)()}catch{}
  let cap;
  try{cap=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser',width:{max:320},height:{max:240},frameRate:{max:1}},audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,suppressLocalAudioPlayback:true},preferCurrentTab:false,selfBrowserSurface:'exclude',surfaceSwitching:'include',systemAudio:'include'})}
  catch(e){if(ctx)ctx.close().catch(()=>{});if(e&&e.name!=='NotAllowedError'&&e.name!=='AbortError')toast("Sharing didn't start: "+(e.message||e.name),3500);return}
  const a=cap.getAudioTracks()[0];
  if(!a||!ctx||!S||ME<0){cap.getTracks().forEach(t=>t.stop());if(ctx)ctx.close().catch(()=>{});if(!a)info('No sound came with it','Pick the <b>Chrome Tab</b> that is playing the music (not a window or the whole screen), and make sure <b>Also share tab audio</b> is ticked, then try again.');return}
  try{if(ctx.state==='suspended')await ctx.resume()}catch{}
  const src=ctx.createMediaStreamSource(new MediaStream([a])),lvl=ctx.createGain(),mon=ctx.createGain(),dest=ctx.createMediaStreamDestination();
  lvl.gain.value=DJ_SEND;src.connect(lvl);lvl.connect(dest);lvl.connect(mon);mon.connect(ctx.destination);
  const track=dest.stream.getAudioTracks()[0];try{track.contentHint='music'}catch{}
  DJ={kind:'tab',cap,ctx,lvl,mon,out:dest.stream,track,since:Date.now()};djMonitor();
  a.addEventListener('ended',()=>stopDj());cap.getVideoTracks().forEach(v=>v.addEventListener('ended',()=>{if(DJ&&DJ.cap===cap&&a.readyState==='ended')stopDj()}));
  for(const [,c] of PC)addMusic(c);
  send({type:'dj',on:true});SND('pop');toast('🎵 Your music is playing for the table',2600);
  if(!$('#sndpop').hidden)renderMusicPop()}
// what you hear of your own music: it's your tab, muted there and played here at your music volume
function djMonitor(){if(!DJ||!DJ.mon)return;const T=window.TeteSound;try{DJ.mon.gain.value=T?T.djLevel:0.5}catch{}}
function addMusic(c){if(!DJ||!DJ.track||!c||!c.pc||c.pc.connectionState==='closed')return;
  try{if(c.musicTx&&c.musicTx.sender){c.musicTx.direction='sendonly';c.musicTx.sender.replaceTrack(DJ.track).catch(()=>{});try{if(c.musicTx.sender.setStreams)c.musicTx.sender.setStreams(DJ.out)}catch{}}
    else c.musicTx=c.pc.addTransceiver(DJ.track,{direction:'sendonly',streams:[DJ.out]});
    const p=c.musicTx.sender.getParameters();if(!p.encodings||!p.encodings.length)p.encodings=[{}];p.encodings[0].maxBitrate=128000;c.musicTx.sender.setParameters(p).catch(()=>{})}catch(e){console.warn('music',e)}}
function stopDj(quiet){const d=DJ;if(!d)return;DJ=null;
  for(const [,c] of PC){const tx=c.musicTx;if(!tx)continue;try{tx.sender.replaceTrack(null).catch(()=>{});tx.direction='inactive'}catch{}}
  if(d.cap)d.cap.getTracks().forEach(t=>{try{t.stop()}catch{}});
  if(d.kind==='phone'){tableOutStop();try{d.node.port.onmessage=null;d.node.disconnect()}catch{}try{window.TeteAndroid.stopMusic()}catch{}}
  if(d.el){d.el.onended=null;d.el.onerror=null;try{d.el.pause()}catch{}d.el.removeAttribute('src');try{d.el.load()}catch{}(d.list||[]).forEach(s=>{try{URL.revokeObjectURL(s.url)}catch{}})}
  try{d.ctx.close()}catch{}
  if(S&&ME>=0&&S.dj===ME)send({type:'dj',on:false});
  if(!quiet)toast('Your music stopped',1800);if(!$('#sndpop').hidden)renderMusicPop();musicSync()}
// songs from your phone (or computer): files you pick, played in order (round again at the end) through the same path
// as a shared tab. The audio is unlocked inside the tap that opens the picker, because phones only let sound start from a tap.
let DJ_PRE=null;
function silentWav(){const n=800,b=new ArrayBuffer(44+n*2),v=new DataView(b),w=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
  w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);
  return URL.createObjectURL(new Blob([b],{type:'audio/wav'}))}
function pickSongs(){if(!S||ME<0||LOCALT)return;
  let inp=$('#dj-files');if(!inp){inp=document.createElement('input');inp.type='file';inp.accept='audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac';inp.multiple=true;inp.id='dj-files';inp.hidden=true;document.body.appendChild(inp);
    inp.addEventListener('change',()=>{const fs=[...inp.files].filter(f=>/^audio\//.test(f.type)||/\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i.test(f.name));inp.value='';
      if(fs.length)startDjFiles(fs);else{if(inp.files&&inp.files.length===0)return;info('No music files there','Pick music files such as MP3 or M4A. '+"Songs saved inside YouTube Music, Spotify or Apple Music can't be picked: those apps keep them locked.")}})}
  // unlock sound now, inside the tap
  if(!DJ_PRE){try{const ctx=new (window.AudioContext||window.webkitAudioContext)();ctx.resume().catch(()=>{});const el=new Audio();el.setAttribute('playsinline','');el.src=silentWav();const p=el.play();if(p&&p.catch)p.catch(()=>{});DJ_PRE={ctx,el}}catch{}}
  $('#sndpop').hidden=true;inp.click()}
async function startDjFiles(files){
  const pre=DJ_PRE;DJ_PRE=null;
  if(!S||ME<0||LOCALT||!pre){if(pre)try{pre.ctx.close()}catch{}return}
  if(DJ)stopDj(true);
  const {ctx,el}=pre;try{if(ctx.state==='suspended')await ctx.resume()}catch{}
  let src;try{src=ctx.createMediaElementSource(el)}catch(e){toast("Your music couldn't start: "+(e.message||e.name),3500);return}
  const lvl=ctx.createGain(),mon=ctx.createGain(),dest=ctx.createMediaStreamDestination();
  lvl.gain.value=DJ_SEND;src.connect(lvl);lvl.connect(dest);lvl.connect(mon);mon.connect(ctx.destination);
  const track=dest.stream.getAudioTracks()[0];try{track.contentHint='music'}catch{}
  const list=files.slice(0,200).map(f=>({title:f.name.replace(/\.[^.]+$/,'').replace(/[_]+/g,' ').replace(/\s+/g,' ').trim().slice(0,80)||'Song',url:URL.createObjectURL(f)}));
  DJ={kind:'files',ctx,lvl,mon,out:dest.stream,track,el,list,i:0,since:Date.now(),bad:0};
  el.onended=()=>{if(DJ&&DJ.el===el){DJ.bad=0;djNext()}};
  el.onerror=()=>{if(!DJ||DJ.el!==el||!el.getAttribute('src'))return;const s=DJ.list[DJ.i];toast(`Couldn't play ${s?s.title:'that song'}`,2500);if(++DJ.bad<DJ.list.length)setTimeout(djNext,400);else stopDj()};
  djMonitor();djPlayIndex(0);
  for(const [,c] of PC)addMusic(c);
  SND('pop');toast(list.length>1?`🎵 Playing your ${list.length} songs for the table`:'🎵 Playing your song for the table',2600)}
function djPlayIndex(i){const d=DJ;if(!d||d.kind!=='files')return;d.i=((i%d.list.length)+d.list.length)%d.list.length;const s=d.list[d.i];
  d.el.src=s.url;const p=d.el.play();if(p&&p.catch)p.catch(()=>toast('Tap Next song to start the music',2500));
  send({type:'dj',on:true,title:s.title});if(!$('#sndpop').hidden)renderMusicPop()}
function djNext(){if(DJ&&DJ.kind==='files')djPlayIndex(DJ.i+1)}
// ---------- music from the Tete app for Android: whatever the phone is playing (YouTube Music, say) ----------
// The app (android/) records the phone's playing sound, with Android's OK, and passes it here in small chunks of
// 48 kHz stereo 16-bit sound over a message port. A small audio worklet turns them back into sound, which goes to the
// table exactly like a shared tab. Nothing is played back here: the phone is already playing the music out loud.
const ANDROID_APP=!!(window.TeteAndroid&&window.TeteAndroid.startMusic);
let MUSIC_PORT=null,PCM_URL=null;
window.addEventListener('message',e=>{if(e.data==='tete-music-port'&&e.ports&&e.ports[0]){MUSIC_PORT=e.ports[0];MUSIC_PORT.onmessage=onPhonePcm;try{if(MUSIC_PORT.start)MUSIC_PORT.start()}catch{}}});
if(ANDROID_APP){try{TeteAndroid.hello()}catch{}const ib=$('#btn-install');if(ib)ib.hidden=true}
function b64buf(s){const bin=atob(s),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u.buffer}
function onPhonePcm(e){const d=DJ;if(!d||d.kind!=='phone')return;let b=e.data;if(typeof b==='string')b=b64buf(b);else if(b&&b.buffer&&!(b instanceof ArrayBuffer))b=b.buffer;if(!(b instanceof ArrayBuffer))return;d.got=(d.got||0)+1;try{d.node.port.postMessage(b,[b])}catch{}}
function pcmWorkletUrl(){if(PCM_URL)return PCM_URL;const src=`class TetePcm extends AudioWorkletProcessor{
  constructor(){super();this.cap=48000*3;this.L=new Float32Array(this.cap);this.R=new Float32Array(this.cap);this.w=0;this.r=0;this.n=0;this.on=false;this.ratio=48000/sampleRate;this.f=0;
    this.port.onmessage=e=>{const s=new Int16Array(e.data);for(let i=0;i+1<s.length;i+=2){if(this.n>=this.cap){this.r=(this.r+1)%this.cap;this.n--}this.L[this.w]=s[i]/32768;this.R[this.w]=s[i+1]/32768;this.w=(this.w+1)%this.cap;this.n++}}}
  process(inputs,outputs){const o=outputs[0],l=o[0],r=o[1]||o[0],N=l.length;
    if(!this.on){if(this.n<9600){l.fill(0);r.fill(0);return true}this.on=true}
    for(let i=0;i<N;i++){if(this.n<2){this.on=false;l.fill(0,i);r.fill(0,i);break}
      const a=this.r,b=(this.r+1)%this.cap,f=this.f;l[i]=this.L[a]+(this.L[b]-this.L[a])*f;r[i]=this.R[a]+(this.R[b]-this.R[a])*f;
      this.f+=this.ratio;while(this.f>=1){this.f-=1;this.r=(this.r+1)%this.cap;this.n--}}
    if(this.n>28800){const drop=this.n-12000;this.r=(this.r+drop)%this.cap;this.n-=drop}
    return true}}
registerProcessor('tete-pcm',TetePcm);`;PCM_URL=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));return PCM_URL}
async function startPhoneMusic(){
  if(!S||ME<0||LOCALT||!ANDROID_APP)return;if(DJ)stopDj(true);
  let ctx=null;try{ctx=new AudioContext({sampleRate:48000,latencyHint:'playback'})}catch{try{ctx=new AudioContext()}catch{}}
  if(!ctx){toast("Your music couldn't start",2500);return}
  try{if(ctx.state==='suspended')await ctx.resume()}catch{}
  try{await ctx.audioWorklet.addModule(pcmWorkletUrl())}catch(e){try{ctx.close()}catch{}toast("Your music couldn't start: "+(e.message||e.name),3500);return}
  if(!S||ME<0){try{ctx.close()}catch{}return}
  const node=new AudioWorkletNode(ctx,'tete-pcm',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
  const lvl=ctx.createGain(),dest=ctx.createMediaStreamDestination();lvl.gain.value=DJ_SEND;node.connect(lvl);lvl.connect(dest);
  const track=dest.stream.getAudioTracks()[0];try{track.contentHint='music'}catch{}
  DJ={kind:'phone',ctx,lvl,mon:null,out:dest.stream,track,node,since:Date.now(),waiting:true,got:0};
  if(!MUSIC_PORT)try{TeteAndroid.hello()}catch{}
  try{TeteAndroid.startMusic()}catch(e){stopDj(true);toast("Your music couldn't start",2500)}}
// what the app says: started (Android said yes and the sound is coming), stopped, denied or an error
window.__teteMusicEvent=ev=>{if(!ev||!ev.type)return;const mine=DJ&&DJ.kind==='phone';
  if(ev.type==='started'){if(!mine){try{TeteAndroid.stopMusic()}catch{}return}DJ.waiting=false;if(ev.out)tableOutStart(!!ev.bin);DJ.since=Date.now();for(const [,c] of PC)addMusic(c);send({type:'dj',on:true,title:''});SND('pop');toast("🎵 Your phone's music is playing for the table",2600);if(!$('#sndpop').hidden)renderMusicPop()}
  else if(ev.type==='stopped'){if(mine)stopDj(ev.why==='user')}
  else if(ev.type==='denied'){if(mine)stopDj(true);toast("Not shared: Android needs your OK to pick up the music",3200)}
  else if(ev.type==='error'){if(mine)stopDj(true);info("Music from your phone didn't start",esc(ev.msg||'Android said no.'))}};
// While your phone's music is shared, the Android app mutes this page: Android pauses YouTube Music whenever a page
// starts playing voices. So the table's sound (everyone's voices and the game's sounds) is mixed here instead and sent
// to the app, which plays it without disturbing your music: 48 kHz stereo 16-bit, 20 ms at a time.
let TOUT=null,TOUT_URL=null;
function toutWorkletUrl(){if(TOUT_URL)return TOUT_URL;const src=`class TeteOut extends AudioWorkletProcessor{
  constructor(){super();this.n=960;this.b=new Int16Array(this.n*2);this.i=0}
  process(inputs){const inp=inputs[0]||[],l=inp[0],r=inp[1]||inp[0],N=l?l.length:128;
    for(let k=0;k<N;k++){const a=l?l[k]:0,c=r?r[k]:0;this.b[this.i++]=(a<-1?-1:a>1?1:a)*32767|0;this.b[this.i++]=(c<-1?-1:c>1?1:c)*32767|0;
      if(this.i>=this.b.length){this.port.postMessage(this.b.buffer,[this.b.buffer]);this.b=new Int16Array(this.n*2);this.i=0}}
    return true}}
registerProcessor('tete-out',TeteOut);`;TOUT_URL=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));return TOUT_URL}
function bufB64(ab){const u=new Uint8Array(ab);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)}
async function tableOutStart(bin){
  if(TOUT)return;if(!MUSIC_PORT){try{TeteAndroid.hello()}catch{}await new Promise(r=>setTimeout(r,600));if(!MUSIC_PORT){stopDj(true);info("Music from your phone didn't start",'Tete lost touch with the app. Close Tete and open it again.');return}}
  let ctx=null;try{ctx=new AudioContext({sampleRate:48000,latencyHint:'interactive'})}catch{}
  if(!ctx||ctx.sampleRate!==48000){try{ctx&&ctx.close()}catch{}return outOff()}
  try{await ctx.audioWorklet.addModule(toutWorkletUrl())}catch{try{ctx.close()}catch{}return outOff()}
  if(!DJ||DJ.kind!=='phone'||TOUT){try{ctx.close()}catch{}return}
  const node=new AudioWorkletNode(ctx,'tete-out',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit'});
  const mix=ctx.createGain(),hush=ctx.createGain();hush.gain.value=0;mix.connect(node);node.connect(hush);hush.connect(ctx.destination);
  TOUT={ctx,mix,node,voices:new Map(),fx:null,sent:0};
  node.port.onmessage=e=>{const t=TOUT,p=MUSIC_PORT;if(!t||!p)return;t.sent++;try{if(bin)p.postMessage(e.data,[e.data]);else p.postMessage('b64:'+bufB64(e.data))}catch{}};
  for(const [pid,c] of PC)toutVoice(pid,c);
  try{const st=window.TeteSound&&TeteSound.tap&&TeteSound.tap();if(st){const src=ctx.createMediaStreamSource(st);src.connect(mix);TOUT.fx=src}}catch{}
  try{if(ctx.state!=='running')await ctx.resume()}catch{}
  try{MUSIC_PORT.postMessage('tete:out-on')}catch{}}
function outOff(){try{if(MUSIC_PORT)MUSIC_PORT.postMessage('tete:out-off')}catch{}}
function toutVoice(pid,c){const t=TOUT;if(!t||!c||!c.stream||!c.stream.getAudioTracks().length)return;const had=t.voices.get(pid);if(had&&had.stream===c.stream)return;if(had)toutDrop(pid);
  try{const src=t.ctx.createMediaStreamSource(c.stream),g=t.ctx.createGain();g.gain.value=AVS.spk?1:0;src.connect(g);g.connect(t.mix);t.voices.set(pid,{src,g,stream:c.stream})}catch{}}
function toutDrop(pid){const t=TOUT,v=t&&t.voices.get(pid);if(!v)return;try{v.src.disconnect();v.g.disconnect()}catch{}t.voices.delete(pid)}
function toutSpk(){const t=TOUT;if(t)for(const [,v] of t.voices)v.g.gain.value=AVS.spk?1:0}
function tableOutStop(){const t=TOUT;if(!t)return;TOUT=null;try{t.node.port.onmessage=null}catch{}try{window.TeteSound&&TeteSound.untap&&TeteSound.untap()}catch{}try{t.ctx.close()}catch{}}
function setDjSend(v){DJ_SEND=Math.max(0,Math.min(1,v));try{localStorage.setItem('tete.djvol',String(DJ_SEND))}catch{}if(DJ)try{DJ.lvl.gain.setTargetAtTime(DJ_SEND,DJ.ctx.currentTime,0.08)}catch{}}
// who's playing, from the table's state: their stream plays here (not on their own screen: they hear their tab), the
// table's songs rest meanwhile; if someone else starts, yours stops; if the server lost track of yours, it's told again
function djRefresh(){const dj=S&&ME>=0&&!LOCALT?S.dj:-1;
  if(DJ&&!DJ.waiting&&dj!==ME&&Date.now()-DJ.since>3000){if(dj>=0){stopDj(true);const p=S.players[dj];toast(`🎵 ${p?p.name:'Someone'} is playing music now`,2500)}else if(S&&ME>=0){DJ.since=Date.now();send({type:'dj',on:true,title:DJ.kind==='files'&&DJ.list[DJ.i]?DJ.list[DJ.i].title:''})}}
  const c=dj>=0&&dj!==ME?PC.get(dj):null,T=window.TeteSound;if(T&&T.djPlay)T.djPlay(c&&c.djStream||null);
  const key=dj+'|'+(S&&S.djTitle||'');if(key!==DJ_LAST){DJ_LAST=key;musicSync();if(!$('#sndpop').hidden)renderMusicPop()}}
let ACTX=null;const LEVELS=new Map();
function watchLevel(pid,stream){
  if(LEVELS.has(pid))return;try{ACTX=ACTX||new (window.AudioContext||window.webkitAudioContext)();const src=ACTX.createMediaStreamSource(stream);const an=ACTX.createAnalyser();an.fftSize=512;src.connect(an);const buf=new Uint8Array(an.frequencyBinCount);LEVELS.set(pid,{an,buf});if(ACTX.state==='suspended')ACTX.resume().catch(()=>{});levelKick()}catch{}
}
let LV_T=null;
function levelKick(){if(!LV_T)LV_T=setTimeout(levelLoop,180)}
function levelLoop(){LV_T=null;if(!LEVELS.size){if(ACTX&&ACTX.state==='running')ACTX.suspend().catch(()=>{});return}
  if(!document.hidden)for(const [pid,l] of LEVELS){const el=$('#seat-'+pid);if(!el)continue;l.an.getByteFrequencyData(l.buf);let s=0;for(let i=0;i<l.buf.length;i+=2)s+=l.buf[i];const avg=2*s/l.buf.length;const muted=pid===ME?!AVS.mic:(S&&S.players[pid]&&!S.players[pid].mic);el.classList.toggle('speaking',!muted&&avg>18&&AVS.spk)}
  if(window.TeteSound&&TeteSound.duck)TeteSound.duck(!document.hidden&&!!$('#seats .seat.speaking'));
  LV_T=setTimeout(levelLoop,document.hidden?1500:200)}
$('#btn-mic').onclick=async()=>{AVS.mic=!AVS.mic;if(ACTX&&ACTX.state==='suspended')ACTX.resume();await ensureLocal();toast(AVS.mic?'Mic on — the table can hear you':'Mic muted');avUI()};
$('#btn-cam').onclick=async()=>{AVS.cam=!AVS.cam;await ensureLocal();toast(AVS.cam?'Camera on':'Camera off');avUI()};
$('#btn-spk').onclick=()=>{AVS.spk=!AVS.spk;toutSpk();$$('#voices audio').forEach(a=>{a.muted=!AVS.spk;if(AVS.spk&&a.paused)a.play().catch(()=>{})});if(ACTX&&ACTX.state==='suspended')ACTX.resume();toast(AVS.spk?'You can hear the table':'Other players muted');avUI()};
document.addEventListener('visibilitychange',()=>{const v=LOCAL&&LOCAL.getVideoTracks()[0];if(v)v.enabled=!document.hidden&&AVS.cam;if(!document.hidden&&S){turnTick();updateTurnMark()}});
// browsers block remote audio until a tap: resume on first interaction
document.addEventListener('pointerdown',()=>{if(ACTX&&ACTX.state==='suspended')ACTX.resume();$$('.seat video').forEach(v=>{if(v.paused)v.play().catch(()=>{})});$$('#voices audio').forEach(a=>{if(a.paused)a.play().catch(()=>{})})},{passive:true});

// ---------- the lobby comes in after the intro ----------
let ENTERED=false;
function lobbyEnter(){if(ENTERED)return;ENTERED=true;if(!$('#lobby').classList.contains('on')||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const els=[$('.lb-top'),$('#brand'),...$$('#returns .retcard'),...$$('.tiles .tile'),...$$('#lobby .strip:not([hidden])'),$('.lb-foot')].filter(Boolean);
  els.forEach((el,i)=>{const tile=el.classList.contains('tile'),d=80+i*70;
    el.animate(tile?[{transform:'translateY(-70px) rotate(-12deg) scale(.8)',opacity:0},{transform:'translateY(0px) rotate(0deg) scale(1)',opacity:1}]:[{transform:'translateY(16px)',opacity:0},{transform:'translateY(0px)',opacity:1}],{duration:tile?650:520,delay:d,easing:tile?'cubic-bezier(.2,1.3,.35,1)':'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});
    if(tile)SND('deal',{delay:(d+260)/1000})})}
function afterIntro(fn){const st=window.TETE_INTRO;if(!st||st==='exit'||st==='done'){fn();return}let ran=false;const go=()=>{if(!ran){ran=true;fn()}};window.addEventListener('tete:introexit',go,{once:true});window.addEventListener('tete:introdone',go,{once:true})}
afterIntro(()=>{lobbyEnter();if(JOIN_LINK)setTimeout(()=>{if($('#lobby').classList.contains('on'))openJoin()},700)});

if(location.search.includes('demo')){window.__fx=runFx;window.__t={get S(){return S},get L(){return LOCALT},get ME(){return ME},get PC(){return PC},get TRIES(){return TRIES},get PSID(){return PSID},get MKS(){return MKS},act,fx21,streakFx,streakEndFx,setFelt}}
setInterval(()=>{if(!LOCALT&&S&&$('#game').classList.contains('on')&&navigator.onLine!==false)fetch('/health',{cache:'no-store'}).catch(()=>{})},240000);
window.addEventListener('online',()=>{if(!CONNECTED)connect();else setStatus('ok','Connected.')});
window.addEventListener('offline',()=>{setStatus('off','Offline. Practice against the computer still works; hosting and joining need a connection.');renderRooms()});
refreshAv();renderSound();renderRooms();renderFriends();
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
let INSTALL=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();INSTALL=e;['#btn-install','#btn-install2'].forEach(s=>{const b=$(s);if(b){b.hidden=false;b.onclick=()=>{if(!INSTALL)return;INSTALL.prompt();INSTALL=null;$$('#btn-install,#btn-install2').forEach(x=>x.hidden=true)}}})});
connect();
})();

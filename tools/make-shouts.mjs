// The house voice: every shout spoken by Microsoft Azure's Nigerian English voice, Abeo (en-NG-AbeoNeural).
// Run by the "Make the shout clips" GitHub Action, which keeps the Azure key in the repository's secrets
// (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION).
//   MODE=lab   three versions of every shout (a, b, c), slower and more dragged out each time, into public/shouts/lab
//   MODE=final the chosen version of each shout (tools/voice-picks.json) into public/shouts/abeo, which the game plays
// Nigerians drag the words out ("Chhhaaaaiiii!", "Waaahaaalaaa!"), so the words are spelled long and spoken slowly,
// with the voice rising and then falling across the long vowels.
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { REACTS } = require('../public/engine.js');
const KEY = (process.env.AZURE_SPEECH_KEY || '').trim();
const REGION = (process.env.AZURE_SPEECH_REGION || '').trim().toLowerCase().replace(/\s+/g, '');
if (!KEY || !REGION) { console.error('Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION (add them as repository secrets)'); process.exit(1); }
const VOICE = process.env.VOICE || 'en-NG-AbeoNeural', MODE = process.env.MODE === 'lab' ? 'lab' : 'final';
// what is said for each shout in each version (the emoji ones get words)
const WORDS = {
  'Oya!':        ['Oyaaa!', 'Oooyaaa!', 'Ooooyaaaaa!'],
  'Chai!':       ['Chaaai!', 'Chaaaaai!', 'Chaaaaaaiii!'],
  'Na wa o!':    ['Na waa o!', 'Na waaa ooo!', 'Naaa waaaa ooooo!'],
  'E choke!':    ['E chooke!', 'Eeh chooooke!', 'Eeeeh chooooke ooo!'],
  'Wahala!':     ['Wahaala!', 'Waaahaaalaaa!', 'Waaaahaaaalaaaa!'],
  'Ehen!':       ['Eheen!', 'Eheeen!', 'Eheeeeen!'],
  'Abeg!':       ['Abeeg!', 'Abeeeg!', 'Aaabeeeeg!'],
  '🔥':          ['Fiiire!', 'Fiiiiire!', 'Fiiiiire ooo!'],
  '😂':          ['Ha ha ha haaa!', 'Haa haa haa haaa!', 'Haaa haaa haaa haaaa!'],
  '👏':          ['Well dooone!', 'Weeell dooone!', 'Weeell doooone ooo!'],
  '🙏':          ['Thank God ooo!', 'Thaank Gaad ooo!', 'Thaaank Gaaad ooooo!'],
  '😱':          ['Yeeeh!', 'Yeeeeeh!', 'Yeeeeeeeh!'],
  'Conjour!':    ['Conjoour!', 'Conjouuur!', 'Cooonjouuur!'],
  'School boi!': ['School booy!', 'Schoool boooy!', 'Schoooool booooy!'],
};
// how each version is spoken: slower each time, and from b on the pitch climbs into the long vowel and falls away
const HOW = [
  { rate: '-25%', pitch: '+4%' },
  { rate: '-40%', contour: '(0%,+5%) (40%,+20%) (100%,-15%)' },
  { rate: '-55%', contour: '(0%,+10%) (30%,+25%) (100%,-25%)' },
];
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function speak(text, how) {
  const attrs = Object.entries(how).map(([k, v]) => `${k}="${v}"`).join(' ');
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-NG"><voice name="${VOICE}"><prosody ${attrs}>${esc(text)}</prosody></voice></speak>`;
  const r = await fetch(`https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST', body: ssml,
    headers: { 'Ocp-Apim-Subscription-Key': KEY, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'tete21-shouts' },
  });
  if (!r.ok) throw new Error(`Azure answered ${r.status} ${r.statusText}. ${(await r.text()).slice(0, 300)}`);
  return Buffer.from(await r.arrayBuffer());
}
const words = s => WORDS[s] || [s, s, s];
if (MODE === 'lab') {
  const DIR = 'public/shouts/lab'; await mkdir(DIR, { recursive: true }); const list = [];
  for (let i = 0; i < REACTS.length; i++) for (let v = 0; v < 3; v++) {
    const id = `${i}${'abc'[v]}`, text = words(REACTS[i])[v];
    try { const buf = await speak(text, HOW[v]); await writeFile(`${DIR}/${id}.mp3`, buf); list.push({ id, shout: REACTS[i], text, bytes: buf.length }); console.log(`${id}. ${REACTS[i]} -> "${text}" (${buf.length} bytes)`); }
    catch (e) { console.error(`${id}. ${REACTS[i]}: ${e.message}`); list.push({ id, shout: REACTS[i], text, error: e.message }); }
  }
  await writeFile(`${DIR}/index.json`, JSON.stringify({ voice: VOICE, how: HOW, list }, null, 1) + '\n');
  if (!list.some(x => x.bytes)) process.exit(1);
} else {
  // the chosen version for each shout: {"default":"b","4":"c"} (by position in REACTS)
  let picks = { default: 'b' }; try { picks = JSON.parse(await readFile('tools/voice-picks.json', 'utf8')); } catch {}
  const DIR = 'public/shouts/abeo'; await mkdir(DIR, { recursive: true });
  for (let i = 0; i < REACTS.length; i++) {
    const v = Math.max(0, 'abc'.indexOf(picks[i] || picks[REACTS[i]] || picks.default || 'b')), text = words(REACTS[i])[v];
    const buf = await speak(text, HOW[v]); await writeFile(`${DIR}/${i}.mp3`, buf);
    console.log(`${i}. ${REACTS[i]} -> "${text}" (version ${'abc'[v]}, ${buf.length} bytes)`);
  }
  await writeFile(`${DIR}/index.json`, JSON.stringify({ voice: VOICE, n: REACTS.length, v: Date.now().toString(36) }) + '\n');
  console.log(`Done: ${REACTS.length} clips in ${DIR}`);
}

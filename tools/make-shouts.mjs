// The house voice: every shout spoken by Microsoft Azure's Nigerian English voice, Abeo (en-NG-AbeoNeural).
// Run by the "Make the shout clips" GitHub Action, which keeps the Azure key in the repository's secrets
// (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION). Writes public/shouts/abeo/<n>.mp3 (n = position in REACTS) and index.json.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { REACTS } = require('../public/engine.js');
const KEY = (process.env.AZURE_SPEECH_KEY || '').trim();
const REGION = (process.env.AZURE_SPEECH_REGION || '').trim().toLowerCase().replace(/\s+/g, '');
if (!KEY || !REGION) { console.error('Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION (add them as repository secrets)'); process.exit(1); }
const VOICE = process.env.VOICE || 'en-NG-AbeoNeural', DIR = 'public/shouts/abeo';
// what is said for each shout (the emoji ones get words), and how: [words, rate, pitch]
const SAY = {
  'Oya!': ['Oya!', '+8%', '+6%'], 'Chai!': ['Chai!', 'default', '+4%'], 'Na wa o!': ['Na wa o!', 'default', '+4%'],
  'E choke!': ['E choke!', '+5%', '+8%'], 'Wahala!': ['Wahala!', 'default', '+4%'], 'Ehen!': ['Ehen!', 'default', '+6%'],
  'Abeg!': ['Abeg!', 'default', '+4%'], '🔥': ['Fire!', '+5%', '+8%'], '😂': ['Ha ha ha ha!', '+12%', '+6%'],
  '👏': ['Well done!', 'default', '+4%'], '🙏': ['Thank God o!', 'default', '+2%'], '😱': ['Yeh!', 'default', '+10%'],
  'Conjour!': ['Conjour!', 'default', '+4%'], 'School boi!': ['School boy!', '+4%', '+6%'],
};
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
await mkdir(DIR, { recursive: true });
for (let i = 0; i < REACTS.length; i++) {
  const [text, rate, pitch] = SAY[REACTS[i]] || [REACTS[i], 'default', 'default'];
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-NG"><voice name="${VOICE}"><prosody rate="${rate}" pitch="${pitch}">${esc(text)}</prosody></voice></speak>`;
  const r = await fetch(`https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST', body: ssml,
    headers: { 'Ocp-Apim-Subscription-Key': KEY, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'tete21-shouts' },
  });
  if (!r.ok) { console.error(`Shout ${i} (${REACTS[i]}): Azure answered ${r.status} ${r.statusText}. ${(await r.text()).slice(0, 300)}`); process.exit(1); }
  const buf = Buffer.from(await r.arrayBuffer());
  await writeFile(`${DIR}/${i}.mp3`, buf);
  console.log(`${i}. ${REACTS[i]} -> "${text}" (${buf.length} bytes)`);
}
await writeFile(`${DIR}/index.json`, JSON.stringify({ voice: VOICE, n: REACTS.length, v: Date.now().toString(36) }) + '\n');
console.log(`Done: ${REACTS.length} clips in ${DIR}`);

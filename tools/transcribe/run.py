# Writes what was said in each voice note, word by word with times, so the shout clips can be checked.
import glob, json
from faster_whisper import WhisperModel
import traceback
try:
    model = WhisperModel('medium', device='cpu', compute_type='int8')
except Exception:
    traceback.print_exc()
    model = WhisperModel('small', device='cpu', compute_type='int8')
out = {}
for f in sorted(glob.glob('tools/transcribe/*.mp3')):
    segs, info = model.transcribe(f, language='en', word_timestamps=True, vad_filter=False, beam_size=5,
                                  initial_prompt='Oya! Chai! Na wa o! E choke! Wahala! Ehen! Abeg! Fire! Well done! Thank God o! Yeh! Conjour! School boi! Guy play now! Witch people! You be idiot! We go fry egg for you!')
    words = []
    for s in segs:
        for w in s.words or []:
            words.append([round(w.start, 2), round(w.end, 2), w.word.strip(), round(w.probability, 2)])
    out[f] = words
    print(f, ' '.join(f'{w[2]}@{w[0]}' for w in words))
json.dump(out, open('tools/transcribe/out.json', 'w'), indent=1)

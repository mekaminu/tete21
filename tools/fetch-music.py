#!/usr/bin/env python3
"""Fetch and prepare the songs for the table music.

Reads tools/music-sources.json (songs from Pixabay, free to use under the Pixabay Content License, no credit
required, though the game shows the title and artist anyway), downloads each one, trims the silence at both
ends, brings every song to the same loudness (-18 LUFS, peaks under -1.5 dB) so nothing jumps out between
songs, and saves a 96 kbps MP3 plus index.json into the folder given (default music-lab/).

Run by the "Fetch the table music" GitHub Action (a push to the get-music branch), because the songs are
downloaded from Pixabay's CDN. Needs ffmpeg.

  python3 tools/fetch-music.py [out-folder] [id ...]
"""
import json, os, re, subprocess, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'music-lab')
ONLY = set(sys.argv[2:])
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15'


def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True)


def duration(path):
    return float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).stdout.strip())


def main():
    songs = json.load(open(os.path.join(ROOT, 'tools', 'music-sources.json')))
    os.makedirs(OUT, exist_ok=True)
    done = []
    for s in songs:
        if ONLY and s['id'] not in ONLY:
            continue
        raw = os.path.join(OUT, s['id'] + '.src.mp3')
        try:
            req = urllib.request.Request(s['src'], headers={'User-Agent': UA, 'Referer': 'https://pixabay.com/'})
            with urllib.request.urlopen(req, timeout=60) as r, open(raw, 'wb') as f:
                f.write(r.read())
            # measure, then apply, loudness (two passes, so every song lands at the same level)
            filt = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.3,areverse'
            m = run(['ffmpeg', '-hide_banner', '-nostats', '-i', raw, '-af', filt + ',loudnorm=I=-18:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']).stderr
            j = json.loads(m[m.rindex('{'):m.rindex('}') + 1])
            ln = (f"loudnorm=I=-18:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}"
                  f":measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
            out = os.path.join(OUT, s['id'] + '.mp3')
            run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', filt + ',' + ln + ',aresample=44100',
                 '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '96k', '-map_metadata', '-1', out])
            os.remove(raw)
            d = duration(out)
            done.append({k: s[k] for k in ('id', 'title', 'artist', 'page')} | {'f': s['id'] + '.mp3', 'd': round(d, 1), 'bytes': os.path.getsize(out), 'was_lufs': float(j['input_i'])})
            print(f"ok   {s['id']:22} {d:6.1f}s  {os.path.getsize(out) / 1e6:4.1f} MB  (was {j['input_i']} LUFS)")
        except Exception as e:
            print(f"FAIL {s['id']:22} {e}")
            if os.path.exists(raw):
                os.remove(raw)
        time.sleep(1)
    with open(os.path.join(OUT, 'index.json'), 'w') as f:
        json.dump({'v': time.strftime('%Y%m%d%H%M'), 'songs': done}, f, indent=1)
    print(f'{len(done)} of {len(songs) if not ONLY else len(ONLY)} songs ready in {OUT}')


if __name__ == '__main__':
    main()

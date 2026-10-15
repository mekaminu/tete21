#!/usr/bin/env python3
"""The house voice from one voice note.

Cuts a single recording of all the shouts (said in the game's order, with a pause between each one) into
public/shouts/house/<n>.mp3 and writes public/shouts/house/index.json. The game plays these clips for every
shout, for everyone at every table.

  python3 tools/house-voice.py voice-note.m4a --name Meka
  python3 tools/house-voice.py voice-note.m4a --list          # just show the parts it heard
  python3 tools/house-voice.py voice-note.m4a --keep 2,3,4,5,6,7,8,9,10,11,12,13,14,15 --name Meka

The order is REACTS in public/engine.js: Oya, Chai, Na wa o, E choke, Wahala, Ehen, Abeg, Fire, a laugh,
Well done, Thank God o, Yeh, Conjour, School boi.

It finds the spoken parts by loudness and leaves out taps, bumps and rustles (anything with no voice in it).
If it doesn't hear exactly one part per shout it stops and lists what it heard, and --keep picks the parts
to use, in order. Each clip is trimmed to just the shout (keeping the start of an s, f or ch and the natural
tail), the rumble filtered out, gently compressed, brought to the same loudness as the others with peaks
held under -1 dB, faded at both ends and saved as a small mono MP3.

Needs ffmpeg, numpy and scipy.
"""
import argparse, json, os, re, subprocess, sys, tempfile, time

import numpy as np
from scipy import signal

SR = 44100
HOP = 0.01          # envelope step, seconds
WIN = 0.03          # envelope window, seconds
TARGET_DB = -19.0   # loudness of the voiced part of every clip (RMS, dBFS), about where the old Azure clips sat
LIMIT = 0.891       # peaks held under -1 dBFS
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def reacts():
    src = open(os.path.join(ROOT, 'public', 'engine.js'), encoding='utf-8').read()
    m = re.search(r"const REACTS = (\[.*?\]);", src)
    return json.loads(m.group(1).replace("'", '"'))


def decode(path):
    raw = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', str(SR),
                          '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype='<f4').astype(np.float64)


def envelope(x):
    hop, win = int(SR * HOP), int(SR * WIN)
    n = max(1, 1 + (len(x) - win) // hop)
    frames = np.lib.stride_tricks.sliding_window_view(x, win)[::hop][:n]
    return 20 * np.log10(np.sqrt(np.mean(frames ** 2, axis=1)) + 1e-9)


def voiced(seg):
    """Share of the loud 30 ms frames that have a clear pitch (a voice), from 0 to 1."""
    win, hop = int(SR * WIN), int(SR * HOP)
    lo, hi = int(SR / 400), int(SR / 70)
    frames = np.lib.stride_tricks.sliding_window_view(seg, win)[::hop]
    if not len(frames):
        return 0.0
    level = np.sqrt(np.mean(frames ** 2, axis=1))
    loud = frames[level > level.max() * 0.1]
    hits = 0
    for f in loud:
        f = f - f.mean()
        ac = np.correlate(f, f, 'full')[win - 1:]
        if ac[0] <= 0:
            continue
        hits += (ac[lo:hi].max() / ac[0]) > 0.5
    return hits / max(1, len(loud))


def find_parts(x):
    b, a = signal.butter(2, 80 / (SR / 2), 'high')
    y = signal.lfilter(b, a, x)
    db = envelope(y)
    floor, peak = np.percentile(db, 10), np.percentile(db, 99.5)
    thr = floor + 0.25 * (peak - floor)
    on = db > thr
    parts, i = [], 0
    while i < len(on):
        if on[i]:
            j = i
            while j < len(on) and on[j]:
                j += 1
            if parts and (i - parts[-1][1]) * HOP < 0.25:
                parts[-1][1] = j
            else:
                parts.append([i, j])
            i = j
        else:
            i += 1
    # the high band (2.5-10 kHz) catches the quiet start of an s, f, ch or th
    bh, ah = signal.butter(4, [2500 / (SR / 2), 10000 / (SR / 2)], 'band')
    hdb = envelope(signal.lfilter(bh, ah, x))
    hfloor = np.percentile(hdb, 10)
    out = []
    for k, (s, e) in enumerate(parts):
        seg = y[int(s * HOP * SR): int(e * HOP * SR) + int(WIN * SR)]
        dur = (e - s) * HOP
        out.append(dict(k=k, s=s, e=e, start=s * HOP, end=e * HOP + WIN, dur=dur, voice=voiced(seg) if dur >= 0.12 else 0.0))
    return y, db, floor, hdb, hfloor, out


def trim(part, nxt_start, prev_end, db, floor, hdb, hfloor):
    """Cut points: back to where the first sound starts, on to where the tail fades."""
    s, e = part['s'], part['e']
    lo = max(prev_end + 5, s - 25)
    while s - 1 >= lo and (db[s - 1] > floor + 12 or hdb[s - 1] > hfloor + 12):
        s -= 1
    hi = min(nxt_start - 5, e + 35, len(db) - 1)
    while e + 1 <= hi and db[e] > floor + 9:
        e += 1
    return max(0.0, s * HOP - 0.03), min(len(db) * HOP + WIN, e * HOP + WIN + 0.06)


def active_db(z):
    db = envelope(z)
    keep = db > db.max() - 25
    lin = 10 ** (db[keep] / 20)
    return 20 * np.log10(np.sqrt(np.mean(lin ** 2)) + 1e-9)


def ffmpeg_filter(z, chain, out=None, fmt=('f32le', [])):
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'in.f32')
        z.astype('<f4').tofile(src)
        cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', src, '-af', chain]
        if out:
            subprocess.run(cmd + fmt[1] + [out], check=True)
            return None
        raw = subprocess.run(cmd + ['-f', 'f32le', '-'], check=True, capture_output=True).stdout
        return np.frombuffer(raw, dtype='<f4').astype(np.float64)


def main():
    ap = argparse.ArgumentParser(description='Cut one voice note into the house voice shout clips.')
    ap.add_argument('note')
    ap.add_argument('--name', default='Meka', help='whose voice it is, shown in the profile')
    ap.add_argument('--out', default=os.path.join(ROOT, 'public', 'shouts', 'house'))
    ap.add_argument('--keep', help='comma-separated part numbers from --list, in shout order')
    ap.add_argument('--list', action='store_true', help='only list the parts it heard')
    a = ap.parse_args()

    names = reacts()
    x = decode(a.note)
    y, db, floor, hdb, hfloor, parts = find_parts(x)
    for p in parts:
        p['speech'] = p['dur'] >= 0.2 and p['voice'] >= 0.12   # a laugh is breathy (about 0.25); taps and rustles score 0
    if a.list or not a.keep:
        print(f'{len(x) / SR:.1f}s recording; parts heard:')
        for p in parts:
            print(f"  #{p['k']:<2} {p['start']:6.2f}-{p['end']:6.2f}s  {p['dur']:.2f}s  voice {p['voice']:.2f}  {'shout' if p['speech'] else 'not a voice (left out)'}")
        if a.list:
            return
    pick = [parts[int(i)] for i in a.keep.split(',')] if a.keep else [p for p in parts if p['speech']]
    if len(pick) != len(names):
        sys.exit(f'Heard {len(pick)} shouts but the game has {len(names)}. Check the list above and pass --keep.')

    os.makedirs(a.out, exist_ok=True)
    for f in os.listdir(a.out):
        if f.endswith('.mp3') or f == 'index.json':
            os.remove(os.path.join(a.out, f))
    print(f'\n{"":3}{"shout":12} {"from":>14}  {"length":>6}  {"gain":>6}')
    order = sorted(parts, key=lambda p: p['s'])
    for i, (name, p) in enumerate(zip(names, pick)):
        j = order.index(p)
        nxt = order[j + 1]['s'] if j + 1 < len(order) else len(db) + 40
        prev = order[j - 1]['e'] if j > 0 else -10
        t0, t1 = trim(p, nxt, prev, db, floor, hdb, hfloor)
        z = x[int(t0 * SR): int(t1 * SR)]
        z = ffmpeg_filter(z, 'highpass=f=80,acompressor=threshold=0.089:ratio=2.5:attack=5:release=120:makeup=1')
        gain = TARGET_DB - active_db(z)
        dur = len(z) / SR
        ffmpeg_filter(z, f'volume={gain:.2f}dB,alimiter=limit={LIMIT}:attack=2:release=40:level=disabled,'
                         f'afade=t=in:d=0.012,afade=t=out:st={max(0, dur - 0.08):.3f}:d=0.08,aresample=24000',
                      out=os.path.join(a.out, f'{i}.mp3'), fmt=(None, ['-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k']))
        print(f'{i:<3}{name:12} {t0:6.2f}-{t1:6.2f}s  {dur:5.2f}s  {gain:+5.1f}dB')
    stamp = np.base_repr(int(time.time() * 1000), 36).lower()
    with open(os.path.join(a.out, 'index.json'), 'w') as f:
        f.write(json.dumps({'voice': a.name, 'n': len(names), 'v': stamp}) + '\n')
    print(f'\n{len(names)} clips in {os.path.relpath(a.out, ROOT)} (version {stamp})')


if __name__ == '__main__':
    main()

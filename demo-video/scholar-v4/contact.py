#!/usr/bin/env python3
"""Contact sheets of the scholar-v4 renders, for eyeballing every piece.

  python3 scholar-v4/contact.py [name ...]     -> scholar-v4/out/contact-<name>.png (4x4 frames, time-stamped)
                                                  and a stale-voice check against vo-v4/<scene>.json

Also checks each render's out/<name>.json against the current voice timing file:
if the line was re-voiced after the render (fingerprint or duration changed), it
prints the re-render command.
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
VO = os.path.join(os.path.dirname(HERE), 'vo-v4')
FF = '/home/dream/bin/ffmpeg' if os.path.exists('/home/dream/bin/ffmpeg') else 'ffmpeg'
FP = '/home/dream/bin/ffprobe' if os.path.exists('/home/dream/bin/ffprobe') else 'ffprobe'
SCENE_OF = {'c0_rivals': 'c0_rivals', 'c0_meet': 'c0_meet', 'z1_trust': 'z1_trust', 'z2_end': 'z2_end'}


def frames(path):
    r = subprocess.run([FP, '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries',
                        'stream=nb_read_frames', '-of', 'csv=p=0', path], capture_output=True, text=True)
    return int(r.stdout.strip())


def sheet(name, cols=4, rows=4):
    mp4 = os.path.join(OUT, name + '.mp4')
    n = frames(mp4)
    picks = [round(i * (n - 1) / (cols * rows - 1)) for i in range(cols * rows)]
    W, H = 480, 270
    img = Image.new('RGB', (W * cols, H * rows), (0, 0, 0))
    d = ImageDraw.Draw(img)
    tmp = os.path.join(OUT, '.contact.png')
    for k, f in enumerate(picks):
        subprocess.run([FF, '-v', 'error', '-y', '-i', mp4, '-vf', f"select='eq(n\\,{f})'", '-frames:v', '1', tmp], check=True)
        im = Image.open(tmp).convert('RGB').resize((W, H))
        x, y = (k % cols) * W, (k // cols) * H
        img.paste(im, (x, y))
        d.rectangle([x, y, x + 92, y + 18], fill=(0, 0, 0))
        d.text((x + 4, y + 3), f'{f:4d} {f / 30:5.2f}s', fill=(255, 255, 0))
    os.remove(tmp)
    dest = os.path.join(OUT, f'contact-{name}.png')
    img.save(dest)
    return dest, n


def stale(name):
    sc = SCENE_OF.get(name)
    meta_p = os.path.join(OUT, name + '.json')
    if not sc or not os.path.exists(meta_p):
        return None
    meta = json.load(open(meta_p))
    vo = json.load(open(os.path.join(VO, sc + '.json')))
    fp, dur = meta.get('voFingerprint'), meta.get('voDuration')
    if fp and fp != vo.get('fingerprint'):
        return 'voice re-rendered since (fingerprint changed)'
    if dur is not None and abs(dur - vo['duration']) > 1e-3:
        return f"voice duration changed {dur} -> {vo['duration']}"
    if fp is None and os.path.getmtime(os.path.join(VO, sc + '.json')) > os.path.getmtime(meta_p):
        return 'voice timing file is newer than the render'
    return None


if __name__ == '__main__':
    names = sys.argv[1:] or sorted(f[:-4] for f in os.listdir(OUT) if f.endswith('.mp4'))
    for nm in names:
        dest, n = sheet(nm)
        s = stale(nm)
        print(f'{nm:10s} {n:4d} frames ({n / 30:.2f}s)  {dest}' + (f'   STALE: {s} -> bash scholar-v4/render-all.sh {nm}' if s else ''))

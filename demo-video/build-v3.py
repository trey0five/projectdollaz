#!/usr/bin/env python3
"""Assembles KYRO demo v3 from captures-v3/ + vo-v3/ + coldopen-v3/ + a music bed.

Per scene: duration = max(minSec, VO + VO_PAD). Screen captures are trimmed at
their logged `settledAt` (captures-v3/<id>.json) and padded with a frozen tail;
the three Act-0 scenes are pre-rendered mp4s in coldopen-v3/ built to EXACTLY
these durations (run `python3 build-v3.py --plan` to print/write them first).
Scenes crossfade XF. VO lands VO_IN after its scene opens. One looped music bed
runs under everything, sidechain-ducked by the narration.
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
FF = os.path.expanduser('~/bin/ffmpeg'); FP = os.path.expanduser('~/bin/ffprobe')
XF = 0.4
VO_PAD = 1.0      # v3: tighter breath (storyboard recommends 1.0 to land ~6:50)
VO_IN = 0.35
MUSIC = os.path.join(HERE, 'assets/track-759.mp3')
OUT = os.path.join(HERE, 'out-v3/kyro-demo-v3.mp4')
if '--preview' in sys.argv: OUT = os.path.join(HERE, 'out-v3/kyro-demo-v3-PREVIEW.mp4')
PRERENDERED = {'c0_pain', 'c0_dove', 'c0_perch'}   # coldopen-v3/<id>.mp4, exact length
MONTAGE_SPEED = {'x1_montage': 1.6}                 # sped-up montage like v2's v_breadth

def dur_of(path):
    return float(subprocess.run([FP, '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                                capture_output=True, text=True).stdout.strip())

scenes_list = json.load(open(os.path.join(HERE, 'scenes-v3.json')))['scenes']
scenes = {s['id']: s for s in scenes_list}
order = [s['id'] for s in scenes_list]
# Missing VO (ElevenLabs quota) → timed silence placeholder so a PREVIEW cut still assembles.
SEC_PER_CHAR = 0.0713   # measured on the 18 rendered v3 lines
missing_vo = []
def vo_path(sid):
    real = os.path.join(HERE, f'vo-v3/{sid}.mp3')
    if os.path.exists(real): return real
    est = round(len(scenes[sid]['vo']) * SEC_PER_CHAR, 2)
    ph = os.path.join(HERE, f'vo-v3/_placeholder_{sid}.mp3')
    if not os.path.exists(ph) or abs(dur_of(ph) - est) > 0.5:
        subprocess.run([FF, '-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', str(est), '-c:a', 'libmp3lame', '-b:a', '64k', ph], check=True)
    missing_vo.append(sid); return ph
vo_len = {sid: dur_of(vo_path(sid)) for sid in order}
if missing_vo: print('⚠ PREVIEW: silent placeholders for', ', '.join(missing_vo))

def shot_secs(sid):
    return round(max(scenes[sid]['minSec'], vo_len[sid] + VO_PAD), 2)

os.makedirs(os.path.join(HERE, 'out-v3/clips'), exist_ok=True)
plan = {sid: shot_secs(sid) for sid in order}
json.dump({'XF': XF, 'VO_IN': VO_IN, 'VO_PAD': VO_PAD, 'vo': vo_len, 'secs': plan,
           'total': round(sum(plan.values()) - XF * (len(order) - 1), 2)},
          open(os.path.join(HERE, 'out-v3/plan.json'), 'w'), indent=1)
if '--plan' in sys.argv:
    for sid in order: print(f'{sid:16s} vo {vo_len[sid]:5.1f}s → {plan[sid]:5.1f}s')
    print('total ≈', round(sum(plan.values()) - XF * (len(order) - 1), 1), 's'); sys.exit(0)

# ── 1. per-shot normalized clips (1080p30, no audio) ─────────────────────────
clips = []
for sid in order:
    want = plan[sid]
    dst = os.path.join(HERE, f'out-v3/clips/{sid}.mp4')
    clips.append((sid, dst, want))
    if sid in PRERENDERED:
        src = os.path.join(HERE, f'coldopen-v3/{sid}.mp4')
        subprocess.run([FF, '-y', '-v', 'error', '-i', src,
                        '-vf', 'scale=1920:1080:flags=lanczos,fps=30,tpad=stop_mode=clone:stop_duration=4',
                        '-t', str(want), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', dst], check=True)
        print(f'clip {sid}: {want}s (pre-rendered {dur_of(src):.1f}s)'); continue
    src = os.path.join(HERE, f'captures-v3/{sid}.webm')
    meta_p = os.path.join(HERE, f'captures-v3/{sid}.json')
    meta = json.load(open(meta_p)) if os.path.exists(meta_p) else {}
    start = float(meta.get('settledAt', 2.2))
    speed = MONTAGE_SPEED.get(sid, 1.0)
    # x2_penny: splice out a long thinking wait between the ask and the answer.
    if sid == 'x2_penny' and 'enter' in meta and 'confirm' in meta and meta['confirm'] - meta['enter'] > 6:
        a_end = meta['enter'] + 2.0; b_start = meta['confirm'] - 0.8
        fc = (f'[0:v]trim={start}:{a_end},setpts=PTS-STARTPTS[va];[0:v]trim={b_start},setpts=PTS-STARTPTS[vb];'
              f'[va][vb]concat=n=2:v=1:a=0,scale=1920:1080:flags=lanczos,fps=30,tpad=stop_mode=clone:stop_duration=4[v]')
        subprocess.run([FF, '-y', '-v', 'error', '-i', src, '-filter_complex', fc, '-map', '[v]', '-t', str(want), '-an',
                        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', dst], check=True)
        print(f'clip {sid}: {want}s (cut {meta["confirm"] - meta["enter"]:.1f}s thinking-wait)'); continue
    vf = 'scale=1920:1080:flags=lanczos,fps=30,tpad=stop_mode=clone:stop_duration=6'
    if speed != 1.0: vf = f'setpts=PTS/{speed},' + vf
    subprocess.run([FF, '-y', '-v', 'error', '-ss', str(start), '-t', str(want * speed + 0.5), '-i', src,
                    '-vf', vf, '-t', str(want), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', dst], check=True)
    avail = dur_of(src) - start
    flag = '' if avail * 1.0 / speed >= want else f'  ⚠ capture only {avail:.1f}s after trim (frozen tail {want - avail / speed:.1f}s)'
    print(f'clip {sid}: {want}s{flag}')

# ── 2. offsets ───────────────────────────────────────────────────────────────
offsets = []; t = 0.0
for i, (sid, dst, d) in enumerate(clips):
    offsets.append(round(t, 2)); t += d - (XF if i < len(clips) - 1 else 0)
total = round(t, 2); print('total runtime:', total, 's')

# ── 3. filter graph ──────────────────────────────────────────────────────────
inputs = []
for _, dst, _ in clips: inputs += ['-i', dst]
for sid in order: inputs += ['-i', vo_path(sid)]
inputs += ['-stream_loop', '-1', '-i', MUSIC]
f = []; prev = '0:v'; acc = clips[0][2]
for i in range(1, len(clips)):
    f.append(f'[{prev}][{i}:v]xfade=transition=fade:duration={XF}:offset={round(acc - XF, 2)}[vx{i}]'); prev = f'vx{i}'; acc += clips[i][2] - XF
f.append(f'[{prev}]fade=t=out:st={total - 0.9}:d=0.9[vout]')
n_v = len(clips); vo_mix_in = []
for k, sid in enumerate(order):
    at = int((offsets[k] + VO_IN) * 1000)
    f.append(f'[{n_v + k}:a]aresample=44100,aformat=channel_layouts=stereo,adelay={at}|{at}[vo{k}]'); vo_mix_in.append(f'[vo{k}]')
f.append(''.join(vo_mix_in) + f'amix=inputs={len(order)}:normalize=0[vomix]')
mi = n_v + len(order)
f.append(f'[{mi}:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:{total},afade=t=in:d=1.6,afade=t=out:st={total - 3}:d=3,volume=0.55[bed]')
f.append('[vomix]asplit=2[voduck][vomain]')
f.append('[bed][voduck]sidechaincompress=threshold=0.015:ratio=14:attack=60:release=800:makeup=1[ducked]')
f.append('[ducked][vomain]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[aout]')
subprocess.run([FF, '-y', '-v', 'error'] + inputs + ['-filter_complex', ';'.join(f), '-map', '[vout]', '-map', '[aout]',
                '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-t', str(total), OUT], check=True)
print('wrote', OUT, f'({dur_of(OUT):.1f}s)')

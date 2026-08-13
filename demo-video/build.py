#!/usr/bin/env python3
"""Assembles the KYRO sizzle from captures/ + vo/ + assets/track-471.mp3.

Per scene: trim the capture (skipping the load flash), fit duration to
max(minSec, VO + 1.3s breath). Scenes crossfade 0.4s. Each VO line lands
0.35s after its scene opens. The music bed runs the whole cut, ducked under
the narration via sidechain compression, faded in/out. One command re-renders
everything: python3 build.py
"""
import json
import subprocess
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FF = os.path.expanduser('~/bin/ffmpeg')
FP = os.path.expanduser('~/bin/ffprobe')
XF = 0.4          # crossfade seconds
VO_PAD = 1.3      # breath after each VO line
VO_IN = 0.35      # VO enters this long after its scene opens
MUSIC = os.path.join(HERE, 'assets/track-759.mp3')  # calm underscore; looped
OUT = os.path.join(HERE, 'out/kyro-sizzle.mp4')

# (sceneId, captureFile, trimStart, speed). Trim starts land AFTER the load
# flash + banner strip; v_breadth is a sped-up montage.
SHOTS = [
    ('v_intro',           'v_intro.webm',           1.3, 1.0),
    ('v_briefing',        'v_briefing.webm',        2.2, 1.0),
    ('v_org',             'v_org.webm',             2.2, 1.0),
    ('v_enroll_overview', 'v_enroll_overview.webm', 2.2, 1.0),
    ('v_enroll_roster',   'v_enroll_roster.webm',   2.4, 1.0),
    ('v_statements',      'v_statements.webm',      2.2, 1.0),
    ('v_budget',          'v_budget.webm',          2.2, 1.0),
    ('v_consolidated',    'v_consolidated.webm',    2.2, 1.0),
    ('v_report',          'v_report.webm',          2.0, 1.0),
    ('v_analytics',       'v_analytics.webm',       2.2, 1.0),
    ('v_cashflow',        'v_cashflow.webm',        2.0, 1.0),
    ('v_cash',            'v_cash.webm',            2.2, 1.0),
    ('v_accred',          'v_accred.webm',          2.2, 1.0),
    ('v_penny',           'v_penny.webm',           2.2, 1.0),
    ('v_breadth',         'v_breadth.webm',         0.5, 2.2),
    ('v_trust',           'v_trust.webm',           0.4, 1.0),
    ('v_endcard',         'v_endcard.webm',         0.3, 1.0),
]

def dur_of(path):
    return float(subprocess.run([FP, '-v', 'quiet', '-show_entries', 'format=duration',
                                 '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.strip())

scenes = {s['id']: s for s in json.load(open(os.path.join(HERE, 'scenes.json')))['scenes']}
vo_len = {sid: dur_of(os.path.join(HERE, f'vo/{sid}.mp3')) for sid in scenes}

# Scene durations: VO-fitted.
def shot_secs(shot_id):
    sc = scenes[shot_id]
    return round(max(sc['minSec'], vo_len[shot_id] + VO_PAD), 2)

os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
os.makedirs(os.path.join(HERE, 'out/clips'), exist_ok=True)

# ── 1. per-shot normalized clips (1080p30, no audio) ─────────────────────────
clips = []
for sid, cap, start, speed in SHOTS:
    want = shot_secs(sid)
    src = os.path.join(HERE, 'captures', cap)
    dst = os.path.join(HERE, f'out/clips/{sid}.mp4')
    clips.append((sid, dst, want))
    # v_penny: the capture logs when the ask was sent and when Penny's card
    # appeared — if the model thought for long, splice the dead wait out.
    meta_p = os.path.join(HERE, 'captures/v_penny.json')
    if sid == 'v_penny' and os.path.exists(meta_p):
        m = json.load(open(meta_p))
        gap = m['confirm'] - m['enter']
        if gap > 6:
            a_end = m['enter'] + 2.0
            b_start = m['confirm'] - 0.8
            fc = (f'[0:v]trim={start}:{a_end},setpts=PTS-STARTPTS[va];'
                  f'[0:v]trim={b_start},setpts=PTS-STARTPTS[vb];'
                  f'[va][vb]concat=n=2:v=1:a=0,scale=1920:1080:flags=lanczos,fps=30,tpad=stop_mode=clone:stop_duration=4[v]')
            subprocess.run([FF, '-y', '-v', 'error', '-i', src, '-filter_complex', fc,
                            '-map', '[v]', '-t', str(want), '-an',
                            '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', dst], check=True)
            print(f'clip {sid}: {want}s (cut {gap:.1f}s thinking-wait)')
            continue
    take = want * speed  # source seconds consumed after retiming
    vf = 'scale=1920:1080:flags=lanczos,fps=30,tpad=stop_mode=clone:stop_duration=4'
    if speed != 1.0:
        vf = f'setpts=PTS/{speed},' + vf
    subprocess.run([FF, '-y', '-v', 'error', '-ss', str(start), '-t', str(take + 0.5), '-i', src,
                    '-vf', vf, '-t', str(want), '-an',
                    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', dst], check=True)
    print(f'clip {sid}: {want}s')

# ── 2. shot offsets on the master timeline (xfade overlaps) ──────────────────
offsets = []
t = 0.0
for i, (sid, dst, d) in enumerate(clips):
    offsets.append(round(t, 2))
    t += d - (XF if i < len(clips) - 1 else 0)
total = round(t, 2)
print('total runtime:', total, 's')

# ── 3. one filter graph: xfade chain + VO placement + ducked music ───────────
inputs = []
for _, dst, _ in clips:
    inputs += ['-i', dst]
vo_ids = [sid for sid, _, _ in clips]
for sid in vo_ids:
    inputs += ['-i', os.path.join(HERE, f'vo/{sid}.mp3')]
inputs += ['-stream_loop', '-1', '-i', MUSIC]

f = []
# video chain
prev = '0:v'
acc = clips[0][2]
for i in range(1, len(clips)):
    out = f'vx{i}'
    f.append(f'[{prev}][{i}:v]xfade=transition=fade:duration={XF}:offset={round(acc - XF, 2)}[{out}]')
    prev = out
    acc += clips[i][2] - XF
f.append(f'[{prev}]fade=t=out:st={total - 0.9}:d=0.9[vout]')

# VO: delay each line to its scene start (+VO_IN), then mix
n_v = len(clips)
vo_mix_in = []
for k, sid in enumerate(vo_ids):
    shot_idx = next(i for i, (s, _, _) in enumerate(clips) if s == sid)
    at = int((offsets[shot_idx] + VO_IN) * 1000)
    f.append(f'[{n_v + k}:a]aresample=44100,aformat=channel_layouts=stereo,adelay={at}|{at}[vo{k}]')
    vo_mix_in.append(f'[vo{k}]')
f.append(''.join(vo_mix_in) + f'amix=inputs={len(vo_ids)}:normalize=0[vomix]')

# music bed: trim, fade, duck under the narration, then master mix
mi = n_v + len(vo_ids)
f.append(f'[{mi}:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:{total},afade=t=in:d=1.6,afade=t=out:st={total - 3}:d=3,volume=0.55[bed]')
f.append('[vomix]asplit=2[voduck][vomain]')
f.append('[bed][voduck]sidechaincompress=threshold=0.015:ratio=14:attack=60:release=800:makeup=1[ducked]')
f.append('[ducked][vomain]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[aout]')

cmd = [FF, '-y', '-v', 'error'] + inputs + [
    '-filter_complex', ';'.join(f),
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart',
    '-t', str(total), OUT,
]
subprocess.run(cmd, check=True)
print('wrote', OUT, f'({dur_of(OUT):.1f}s)')

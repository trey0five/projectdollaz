#!/usr/bin/env python3
"""Assembles KYRO demo v4 (storyboard ~/.cache/kyro-demo-v4/rev/STORYBOARD.md).

Built from build-v3.py. Inputs:
  vo-v4/<id>.mp3 + .json      narration (word timings) — text says "Cairo", captions say "KYRO"
  captures-v4/<id>.webm/.json app scenes (settledAt, named splice marks)
  scholar-v4/out/             rig renders (c0_rivals, c0_meet, card1-6 + alpha .mov, z1_trust, z2_end)
  assets/hero-v3-1080.mp4     the homescreen video (+ hero-v3-audio.wav, its own sound)
  assets/track-759.mp3, assets/music/cue-*.mp3

Rules (same as v3, plus):
  • each scene = max(minSec, VO + 1 s); 0.4 s crossfades; frozen tails when a shot runs short;
  • a capture is trimmed at settledAt, its named splices are cut out, and it may be sped up
    to at most 1.25× to fit; past that the tail is trimmed (reported);
  • the film is joined with FILTERS only (xfade + the concat filter) — never the concat demuxer;
  • music: the cold-open rise (its hit on "Until now"), the calm bed under the chapters,
    a swell on each card, the end lift into the end card — all ducked under the voice;
  • the hero video's own sound under the cold open; loudness −16 LUFS (two-pass loudnorm).

Outputs (out-v4/): kyro-demo-v4.mp4, -720p.mp4, -sizzle-90s.mp4, four module cuts,
kyro-demo-v4.srt ("KYRO", never "Cairo"), chapters.txt, poster.jpg, plan.json.

  python3 build-v4.py --plan     print the timing plan only
  python3 build-v4.py            build everything
  python3 build-v4.py --master   master only (skip derived cuts)
"""
import json, os, re, subprocess, sys, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
FF = os.path.expanduser('~/bin/ffmpeg') if os.path.exists(os.path.expanduser('~/bin/ffmpeg')) else 'ffmpeg'
FP = os.path.expanduser('~/bin/ffprobe') if os.path.exists(os.path.expanduser('~/bin/ffprobe')) else 'ffprobe'
OUT = os.environ.get('KYRO_OUT_DIR') or os.path.join(HERE, 'out-v4')
CLIPS = os.path.join(OUT, 'clips')
XF = 0.4
VO_PAD = 1.0
VO_IN = 0.35
END_HOLD = 3.5
MAX_SPEED = 1.25
FPS = 30
ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', str(FPS)]
HERO = os.path.join(HERE, 'assets/hero-v3-1080.mp4')
HERO_WAV = os.path.join(HERE, 'assets/hero-v3-audio.wav')
BED = os.path.join(HERE, 'assets/track-759.mp3')
CUE_OPEN = os.path.join(HERE, 'assets/music/cue-coldopen-rise-hit.mp3')
CUE_CARD = os.path.join(HERE, 'assets/music/cue-card-swell.mp3')
CUE_END = os.path.join(HERE, 'assets/music/cue-end-lift.mp3')
RIG = os.path.join(HERE, 'scholar-v4/out')
CAP = os.environ.get('KYRO_CAP_DIR') or os.path.join(HERE, 'captures-v4')  # KYRO_CAP_DIR=captures-v4/dry for a rough cut
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

RIG_SCENES = {'c0_rivals', 'c0_meet', 'z1_trust', 'z2_end'}
CHAPTER_TITLES = {'cold': 'Cold open', 'ch1': 'Monday morning', 'ch2': 'Finance', 'ch3': 'Enrollment',
                  'ch4': 'Academics', 'ch5': 'Accreditation', 'ch6': 'One school or many', 'close': 'Close'}
MODULE_CUTS = {'finance': 'ch2', 'enrollment': 'ch3', 'academics': 'ch4', 'accreditation': 'ch5'}
SIZZLE = ['c0_meet', 's3_showme', 'f3_review', 'f4_verdict', 'e4_grades', 'r7_board', 'o2_studio']
MODULE_WORDS = ['Finance', 'Enrollment', 'Academics', 'Accreditation', 'Governance', 'Facilities', 'Advancement', 'HR', 'Strategy']


def run(args, **kw):
    r = subprocess.run(args, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-3000:])
        raise SystemExit(f'ffmpeg failed: {" ".join(args[:6])} …')
    return r


def dur_of(path):
    return float(subprocess.run([FP, '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                                capture_output=True, text=True).stdout.strip())


# ── The script ────────────────────────────────────────────────────────────────
LINES = json.load(open(os.path.join(HERE, 'vo-v4-lines.json')))['lines']
LINES = [l for l in LINES if l.get('mainCut', True)]
ORDER = [l['id'] for l in LINES]
BY = {l['id']: l for l in LINES}


VO_OVERRIDE = {}   # sid → a trimmed/muted variant of its line (derived cuts only)
VO_SHIFT = {}      # sid → seconds the line's first kept word moved (keeps the c0_meet hit on it)


def vo_path(sid):
    if sid in VO_OVERRIDE: return VO_OVERRIDE[sid]
    p = os.path.join(HERE, f'vo-v4/{sid}.mp3')
    return p if os.path.exists(p) else None


VO_LEN = {sid: (dur_of(vo_path(sid)) if vo_path(sid) else 0.0) for sid in ORDER}


def kind(sid):
    if sid == 'c0_open': return 'hero'
    if sid in RIG_SCENES: return 'rig'
    if sid.startswith('card'): return 'card'
    return 'capture'


def shot_secs(sid):
    if kind(sid) == 'card': return 2.5
    want = max(BY[sid].get('minSec', 0), VO_LEN[sid] + VO_PAD if VO_LEN[sid] else 0)
    if kind(sid) == 'rig':  # rig renders are timed to their voice; never cut them short
        want = max(want, dur_of(os.path.join(RIG, f'{sid}.mp4')))
    if sid == 'z2_end':  # the end card holds ≈3.5 s after "…our Cairo dot com" (fine cut)
        want = max(want, VO_LEN[sid] + VO_IN + END_HOLD)
    return round(want, 2)


# Editor's splices, added at assembly (the capture JSONs stay as filmed). Each removes a dwell so
# the scene's last beat survives the 1.25× cap instead of being trimmed off the tail.
EDIT_SPLICES = {
    'f4_verdict':    [{'name': 'edit:verdict-dwell', 'from': 5.6, 'to': 7.8}],     # cursor drifting over the 4 cards; keeps the money columns
    'f5_statements': [{'name': 'edit:history-read', 'from': 18.2, 'to': 19.5}],   # static history drawer; keeps the zoom
    'a6_cohorts':    [{'name': 'edit:stale-chat', 'from': 5.65, 'to': 7.15}],     # chat opened on e4's enrollment conversation, then New chat
    # a7 (fine cut): the body starts once the ACT chip has been pressed and the band has
    # re-rendered (≈ actAt + 0.3) — no "Not yet ranked" TerraNova frames, not even under the crossfade.
    'a7_network':    [{'name': 'edit:pre-act', 'from': 3.3, 'to': 6.1}],
}
# Splices placed relative to a take's own marks (the f9 take was re-filmed for the
# fictional bank names, so absolute times from the first take no longer apply).
REL_SPLICES = {
    'f9_board': [('edit:draft-read', 'draftedAt', 0.97, 2.17),   # AI draft already filled
                 ('edit:branding', 'step5At', -0.79, -0.09)],     # step 4 (branding) in passing; keeps the print scroll
}


def cap_meta(sid):
    p = os.path.join(CAP, f'{sid}.json')
    if not os.path.exists(p): return None
    m = json.load(open(p))
    if not os.environ.get('KYRO_NO_EDIT_SPLICES'):
        extra = list(EDIT_SPLICES.get(sid, []))
        # a6's stale-chat cut applies only to a take that actually opened on an earlier chat
        # (the re-film clears the chat off camera, so its 5.65–7.15 s is real footage).
        if not any('earlier conversation' in n for n in m.get('notes', [])):
            extra = [x for x in extra if x['name'] != 'edit:stale-chat']
        for name, mark, a, b in REL_SPLICES.get(sid, []):
            if mark in m.get('marks', {}):
                extra.append({'name': name, 'from': round(m['marks'][mark] + a, 3), 'to': round(m['marks'][mark] + b, 3)})
        m['splices'] = m.get('splices', []) + extra
    return m


# ── Fine-cut timelines (rough-cut review 2026-10-17) ─────────────────────────────
# A scene listed here is cut from explicit pieces of one or more takes, each placed
# at a scene-local time chosen from the VOICE's word timings (local = VO_IN + word
# start), so the action lands on the words that describe it. Each piece plays at its
# own speed (≤ 1.25×; a few slow to ~0.8×); 'hold' freezes one frame. Pieces are
# contiguous from 0 to the scene's length.
def _marks(src):
    p = os.path.join(CAP, f'{src}.json')
    if not os.path.exists(p): return None
    m = json.load(open(p))
    d = dict(m.get('marks', {}))
    d['settledAt'] = float(m.get('settledAt') or 0)
    return d


def _P(src, a, b, at, to): return {'src': src, 'a': round(a, 3), 'b': round(b, 3), 'at': at, 'to': to}
def _H(src, a, at, to): return {'src': src, 'a': round(a, 3), 'b': round(a, 3), 'at': at, 'to': to, 'hold': True}


def timeline(sid, want):
    """Scene → pieces, or None for the default fit (settledAt → actionEnd minus splices)."""
    try:
        if sid == 'f7_cash':
            A, B = _marks('f7_cash'), _marks('f7_gift')
            if not A or not B or 'formDoneAt' not in B: return None
            t0 = A['typedAt'] - 0.64     # the click into "Available operating cash"
            return [
                _H('f7_cash', 2.0, 0.0, 1.4),                                   # "When does cash run low?" — the empty forecast
                _P('f7_cash', 2.0, t0, 1.4, 5.6),                               # scroll to "Build your forecast"
                _P('f7_cash', t0, A['buildAt'], 5.6, 8.4),                      # "Enter the cash you can spend today" → Build on "builds"
                _P('f7_cash', A['buildAt'], A['buildAt'] + 5.36, 8.4, 13.8),    # the verdict writes itself: "a sentence and a date"
                _P('f7_gift', B['addAt'] - 0.5, B['labelDoneAt'] + 0.25, 13.8, 15.5),   # "Add an expected gift" → the form
                _P('f7_gift', B['formDoneAt'] - 0.54, B['recountAt'], 15.5, 17.4),       # Dec 1 · $150,000 → Add to forecast
                _P('f7_gift', B['recountAt'], B['recountAt'] + (want - 17.4), 17.4, want),  # "every figure recounts"
            ]
        if sid == 'e7_budget':
            m = _marks('e7_budget')
            if not m or 'forecastAt' not in m: return None
            return [
                _P(sid, m['settledAt'] + 0.45, m['cutPlanning'] - 0.43, 0.0, 6.3),     # the brief, held past "…tuition and cash"
                _P(sid, m['planningAt'] - 0.02, m['planningAt'] + 1.03, 6.3, 7.15),    # Planning, on the year-end forecast
                _P(sid, m['rollAt'] - 0.75, m['rollAt'] + 0.85, 7.15, 8.6),            # "roll the roster up…"
                _P(sid, m['gradAt'] - 0.71, m['gradAt'] + 0.29, 8.6, 9.4),             # "…a grade": graduating grade → Grade 8
                _P(sid, m['feederAt'] - 1.2, m['feederAt'] + 0.3, 9.4, 10.6),          # "add the families you expect": PK-3 feeder 6
                _P(sid, m['feederAt'] + 0.3, m['forecastAt'] + 0.04, 10.6, 11.8),      # back up to the forecast
                _P(sid, m['forecastAt'] + 0.04, m['forecastAt'] + 0.04 + (want - 11.8), 11.8, want),  # "…against the budget"
            ]
        if sid == 'a5_time':
            m = _marks('a5_time')
            if not m or 'fallingAt' not in m: return None
            sc = m['quadrantAt'] - 1.39   # the scroll to "Growth against achievement" begins
            return [
                _P(sid, m['settledAt'], sc, 0.0, 3.4),                         # "are we moving?" — the trend
                _P(sid, sc, m['dotAt'], 3.4, 5.3),                             # "Growth against achievement" fully in view
                _P(sid, m['dotAt'], m['cornersAt'] + 0.4, 5.3, 7.6),           # St. Aurelia's dot
                _P(sid, m['cornersAt'] + 0.62, m['aheadAt'] + 0.3, 7.6, 9.5),  # "four corners … from ahead and rising"
                _P(sid, m['aheadAt'] + 0.52, m['fallingAt'] + 0.42, 9.5, 10.85),  # "to behind and falling"
                _P(sid, m['fallingAt'] + 0.42, m['fallingAt'] + 0.42 + (want - 10.85) * 1.2, 10.85, want),
            ]
        if sid == 'x1_sweep':
            m = _marks('x1_sweep')
            if not m or 'strategyAt' not in m: return None
            return [
                _P(sid, m['governanceAt'], m['governanceAt'] + 3.3, 0.0, 3.3),     # "…reads the same way: governance,"
                _P(sid, m['facilitiesAt'], m['facilitiesAt'] + 0.8, 3.3, 4.1),     # "facilities,"
                _P(sid, m['advancementAt'], m['advancementAt'] + 0.9, 4.1, 5.0),   # "advancement,"
                _P(sid, m['hrAt'], m['hrAt'] + 1.25, 5.0, 6.25),                   # "H R,"
                _P(sid, m['strategyAt'], m['strategyAt'] + (want - 6.25), 6.25, want),  # "and a strategic plan…"
            ]
        if sid == 'o1_org':
            m = _marks('o1_org')
            if not m or 'cedarHomeAt' not in m: return None
            return [
                _P(sid, m['settledAt'], m['orgAt'], 0.0, 2.95),                     # the switcher → "Whole organization"
                _P(sid, m['orgAt'], m['orgAt'] + 2.05, 2.95, 4.6),                  # "One login, every school."
                _P(sid, m['registerAt'] - 0.9, m['registerAt'] + 0.4, 4.6, 5.65),   # the schools register…
                _P(sid, m['kpisAt'], m['drillAt'] + 0.15, 5.65, 7.6),               # …"the numbers roll up" (KPIs) → drill on "every figure"
                _P(sid, m['drillAt'] + 0.15, m['drillAt'] + 0.15 + (want - 7.6) * 1.24, 7.6, want),  # Cedar Ridge's own home, rendered
            ]
        if sid == 's3_showme':
            m = _marks('s3_showme')
            if not m or 'landedAt' not in m: return None
            return [
                _P(sid, m['settledAt'], m['chatOpenAt'], 0.0, 1.9),                 # click the owl; the chat says hello
                _P(sid, m['askAt'] - 1.55, m['askAt'] + 0.3, 1.9, 3.4),             # "Just ask." — typed
                _P(sid, m['askAt'] + 0.3, m['askAt'] + 1.0, 3.4, 4.0),              # thinking
                _P(sid, m['flightAt'] - 0.6, m['landedAt'] + 0.25, 4.0, 5.25),      # "Cairo flies you to it — the exact button"
                _P(sid, m['landedAt'] + 0.25, m['actionEnd'], 5.25, 5.25 + (m['actionEnd'] - m['landedAt'] - 0.25) / 0.8),
                _H(sid, m['actionEnd'] - 0.05, 5.25 + (m['actionEnd'] - m['landedAt'] - 0.25) / 0.8, want),
            ]
        if sid == 'r4_standard':
            m = _marks('r4_standard')
            if not m or 'minutesAt' not in m: return None
            return [
                _P(sid, m['settledAt'], m['panelAt'], 0.0, 2.05),                  # "Open any standard…"
                _P(sid, m['panelAt'], m['scoredAt'], 2.05, 4.2),                   # "Score it against the rubric."
                _P(sid, m['scoredAt'], m['operationsAt'], 4.2, 6.7),               # "Attach the proof — straight from…"
                _P(sid, m['operationsAt'], m['minutesAt'], 6.7, 8.4),              # "…the policies, minutes and board reports"
                _P(sid, m['minutesAt'], m['attachedAt'], 8.4, 10.65),              # attach the board minutes
                _P(sid, m['attachedAt'], m['improvementAt'], 10.65, 12.75),        # "an owner and a date"
                _P(sid, m['improvementAt'], m['improvementAt'] + (want - 12.75) * 1.23, 12.75, want),
            ]
        if sid == 'r7_board':
            m = _marks('r7_board')
            if not m or 'improvementAt' not in m: return None
            return [
                _P(sid, m['settledAt'], m['cutImprovement'] - 1.42, 0.0, 3.05),    # the one-page readiness summary
                _P(sid, m['improvementAt'] + 0.49, m['improvementAt'] + 0.49 + (want - 3.05) * 0.97, 3.05, want),  # owned, dated work
            ]
    except KeyError:
        return None
    return None


def timeline_clip(sid, pieces, want, dst, report):
    srcs = sorted({p['src'] for p in pieces})
    for x in srcs:
        if not os.path.exists(os.path.join(CAP, f'{x}.webm')):
            report['missing'].append(x)
            return None
    assert abs(pieces[0]['at']) < 1e-6 and abs(pieces[-1]['to'] - want) < 0.05, f'{sid}: pieces must span 0 → {want}'
    for p, q in zip(pieces, pieces[1:]):
        assert abs(p['to'] - q['at']) < 1e-6, f'{sid}: pieces not contiguous at {p["to"]}'
    inputs = []
    for x in srcs: inputs += ['-i', os.path.join(CAP, f'{x}.webm')]
    parts, speeds = [], []
    for i, p in enumerate(pieces):
        k = srcs.index(p['src'])
        out = p['to'] - p['at']
        if p.get('hold'):
            parts.append(f"[{k}:v]trim={p['a']:.3f}:{p['a'] + 0.1:.3f},setpts=PTS-STARTPTS,fps={FPS},format=yuv420p,"
                         f"tpad=stop_mode=clone:stop_duration={out + 0.3:.3f},trim=0:{out:.3f},setpts=PTS-STARTPTS[s{i}]")
            speeds.append(0)
            continue
        sp = (p['b'] - p['a']) / out
        if sp > MAX_SPEED + 0.03: report['trimmed'].append(f'{sid}: piece {i} at {sp:.2f}× (cap {MAX_SPEED}×)')
        if sp < 0.75: report['frozen'].append(f'{sid}: piece {i} slowed to {sp:.2f}×')
        parts.append(f"[{k}:v]trim={p['a']:.3f}:{p['b']:.3f},setpts=(PTS-STARTPTS)/{sp:.4f},fps={FPS},format=yuv420p,"
                     f"tpad=stop_mode=clone:stop_duration=0.3,trim=0:{out:.3f},setpts=PTS-STARTPTS[s{i}]")
        speeds.append(round(sp, 3))
    chain = ''.join(f'[s{i}]' for i in range(len(pieces)))
    fc = ';'.join(parts) + (f';{chain}concat=n={len(pieces)}:v=1:a=0,scale=1920:1080:flags=lanczos,'
                            f'tpad=stop_mode=clone:stop_duration=1,trim=0:{want:.3f},setpts=PTS-STARTPTS[v]')
    run([FF, '-y', '-v', 'error'] + inputs + ['-filter_complex', fc, '-map', '[v]', '-t', str(want), '-an'] + ENC + [dst])
    return {'timeline': [[p['src'], p['a'], p['b'], round(p['at'], 2), round(p['to'], 2)] for p in pieces], 'speeds': speeds,
            'take': ','.join(srcs)}


# ── 1. clips ──────────────────────────────────────────────────────────────────
def keep_segments(meta, start, end):
    """[start,end] minus the named splices → list of (a,b)."""
    segs = [(start, end)]
    for sp in sorted(meta.get('splices', []), key=lambda x: x['from']):
        nxt = []
        for a, b in segs:
            if sp['to'] <= a or sp['from'] >= b:
                nxt.append((a, b)); continue
            if sp['from'] > a: nxt.append((a, sp['from']))
            if sp['to'] < b: nxt.append((sp['to'], b))
        segs = nxt
    return [(round(a, 3), round(b, 3)) for a, b in segs if b - a > 0.05]


def composite_segments(sid):
    """Scenes filmed in more than one take → [(source webm, start, end), …].
    f7_cash: the one-take forecast build (f7_cash) + the gift beat re-filmed on the
    already-built forecast (f7_gift) — the first take's gift ask got a question back."""
    if sid != 'f7_cash': return None
    a, b = cap_meta('f7_cash'), cap_meta('f7_gift')
    if not a or not b or 'giftConfirmAt' not in b.get('marks', {}): return None
    ma, mb = a['marks'], b['marks']
    sa = os.path.join(CAP, 'f7_cash.webm'); sb = os.path.join(CAP, 'f7_gift.webm')
    th = next((x for x in b.get('splices', []) if x['name'] == 'giftThinking'), {'from': mb['giftProposalAt'] - 0.8, 'to': mb['giftProposalAt'] - 0.8})
    return [
        (sa, a['settledAt'], ma['builtAt'] + 0.8),        # type the cash, Build forecast → the verdict writes itself
        (sa, ma['h6At'] - 0.6, ma['h13At'] + 0.7),         # horizon 6M → 13W
        (sb, mb['askAt'] - 0.8, th['from']),               # ask KYRO to add the April gift
        (sb, th['to'], mb['giftConfirmAt'] + 1.6),          # proposal → Confirm (Applied · Undo)
        (sb, mb['notInAt'] - 0.4, mb['actionEnd']),         # "What is not in this forecast" → the confidence pill
    ]


def capture_clip(sid, want, dst, report, extra=None):
    """extra = (sid2, secs): append the first `secs` of another capture (f4's P&L-only insert)."""
    src = os.path.join(CAP, f'{sid}.webm')
    meta = cap_meta(sid)
    if not meta or not os.path.exists(src):
        report['missing'].append(sid)
        run([FF, '-y', '-v', 'error', '-f', 'lavfi', '-i', f'color=c=0x0b1530:s=1920x1080:r={FPS}:d={want}', '-t', str(want)] + ENC + [dst])
        return {'missing': True}
    body = want - (extra[1] if extra else 0)
    comp = composite_segments(sid)
    if comp:
        srcs = sorted({c[0] for c in comp})
        segs3 = [(srcs.index(c[0]), round(c[1], 3), round(c[2], 3)) for c in comp]
    else:
        srcs = [src]
        start = float(meta.get('settledAt') or 0)
        end = float(meta.get('marks', {}).get('actionEnd') or dur_of(src))
        segs3 = [(0, a, b) for a, b in keep_segments(meta, start, end)]
    segs = [(a, b) for _, a, b in segs3]
    usable = sum(b - a for a, b in segs)
    speed = 1.0
    if usable > body:
        speed = min(MAX_SPEED, usable / body)
    trimmed = max(0.0, usable / speed - body)
    frozen = max(0.0, body - usable / speed)
    parts = []
    for i, (k, a, b) in enumerate(segs3):
        parts.append(f'[{k}:v]trim={a}:{b},setpts=PTS-STARTPTS,fps={FPS},format=yuv420p[s{i}]')
    chain = ''.join(f'[s{i}]' for i in range(len(segs)))
    fc = ';'.join(parts) + f';{chain}concat=n={len(segs)}:v=1:a=0,setpts=PTS/{speed:.4f},fps={FPS},scale=1920:1080:flags=lanczos,tpad=stop_mode=clone:stop_duration={frozen + 1:.2f},trim=0:{body:.3f},setpts=PTS-STARTPTS[body]'
    inputs = []
    for x in srcs: inputs += ['-i', x]
    if extra:
        m2 = cap_meta(extra[0])
        src2 = os.path.join(CAP, f'{extra[0]}.webm')
        if m2 and os.path.exists(src2):
            s2 = float(m2.get('marks', {}).get('needsAt', m2.get('settledAt', 0)))
            inputs += ['-i', src2]
            fc += f';[{len(srcs)}:v]trim={max(0, s2 - 0.3)}:{max(0, s2 - 0.3) + extra[1] + 0.5},setpts=PTS-STARTPTS,fps={FPS},format=yuv420p,scale=1920:1080,tpad=stop_mode=clone:stop_duration=2,trim=0:{extra[1]},setpts=PTS-STARTPTS[ins];[body][ins]concat=n=2:v=1:a=0[v]'
        else:
            report['missing'].append(extra[0])
            fc += f';[body]tpad=stop_mode=clone:stop_duration={extra[1]}[v]'
    else:
        fc += ';[body]copy[v]'
    run([FF, '-y', '-v', 'error'] + inputs + ['-filter_complex', fc, '-map', '[v]', '-t', str(want), '-an'] + ENC + [dst])
    info = {'usable': round(usable, 2), 'speed': round(speed, 3), 'trimmedTail': round(trimmed, 2), 'frozenTail': round(frozen, 2),
            'splicedOut': [s['name'] for s in meta.get('splices', [])], 'take': meta.get('chosenFrom')}
    if trimmed > 0.3: report['trimmed'].append(f'{sid}: {trimmed:.1f}s of tail trimmed (would need {usable / body:.2f}×)')
    if frozen > 1.5: report['frozen'].append(f'{sid}: {frozen:.1f}s frozen tail')
    return info


def brand_font():
    """Montserrat (the site's body face) from the rig's woff2, as a TTF PIL can read."""
    dst = os.path.join(CLIPS, '_Montserrat.ttf')
    if not os.path.exists(dst):
        try:
            from fontTools.ttLib import TTFont
            f = TTFont(os.path.join(HERE, 'scholar-v4/fonts/Montserrat-latin.woff2')); f.flavor = None; f.save(dst)
        except Exception:
            return FONT
    return dst


def module_word_pngs():
    """The nine module words for c0_open's bottom row (PIL: the static ffmpeg has no drawtext)."""
    d = os.path.join(CLIPS, '_words'); os.makedirs(d, exist_ok=True)
    py = r'''
import sys, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter
d, words, font = sys.argv[1], json.loads(sys.argv[2]), sys.argv[3]
f = ImageFont.truetype(font, 30)
try: f.set_variation_by_axes([600])
except Exception: pass
gap = 46
widths = [f.getbbox(w)[2] for w in words]
total = sum(widths) + gap * (len(words) - 1)
x = (1920 - total) // 2
for i, w in enumerate(words):
    im = Image.new('RGBA', (1920, 1080), (0, 0, 0, 0))
    sh = Image.new('RGBA', (1920, 1080), (0, 0, 0, 0))
    ImageDraw.Draw(sh).text((x + 2, 982 + 2), w, font=f, fill=(0, 0, 0, 200))
    sh = sh.filter(ImageFilter.GaussianBlur(4))
    im = Image.alpha_composite(im, sh)
    ImageDraw.Draw(im).text((x, 982), w, font=f, fill=(255, 255, 255, 235))
    im.save(f"{d}/w{i}.png")
    x += widths[i] + gap
'''
    subprocess.run(['python3', '-I', '-c', py, d, json.dumps(MODULE_WORDS), brand_font()], check=True)
    # A soft dark band behind the row (fine cut): the video's spreadsheet and its sheet
    # tabs pass behind the words during the push-in and made them read as overlapping.
    band = r'''
import sys
from PIL import Image
im = Image.new('RGBA', (1920, 1080), (0, 0, 0, 0))
px = im.load()
for y in range(820, 1080):
    a = int(170 * min(1.0, (y - 820) / 150.0) ** 1.4)
    for x in range(1920):
        px[x, y] = (6, 12, 28, a)
im.save(sys.argv[1])
'''
    subprocess.run(['python3', '-I', '-c', band, os.path.join(d, 'band.png')], check=True)
    return [os.path.join(d, f'w{i}.png') for i in range(len(MODULE_WORDS))]


def hero_clip(want, dst):
    # Hero 0 → 7.0 s (the office at night, the push-in on the monitor), slowed ≤1.25× to the
    # line's length; the nine module words fade in one by one along the bottom.
    src_len = 7.0
    speed = max(1 / MAX_SPEED, src_len / want)  # <1 = slow-down
    words = module_word_pngs()
    inputs = ['-i', HERO]
    for w in words: inputs += ['-loop', '1', '-t', str(want), '-i', w]
    fc = f'[0:v]trim=0:{src_len},setpts=(PTS-STARTPTS)/{speed:.4f},fps={FPS},tpad=stop_mode=clone:stop_duration=3,trim=0:{want},setpts=PTS-STARTPTS[b0]'
    t0 = 1.2
    step = (want - 2.6 - t0) / len(words)
    nb = len(words) + 1
    inputs += ['-loop', '1', '-t', str(want), '-i', os.path.join(CLIPS, '_words', 'band.png')]
    fc += f';[{nb}:v]format=rgba,fade=t=in:st={max(0, t0 - 0.5):.2f}:d=0.9:alpha=1[band];[b0][band]overlay=0:0:shortest=1[bb]'
    for i in range(len(words)):
        st = t0 + i * step
        src = 'bb' if i == 0 else f'b{i}'
        fc += f';[{i + 1}:v]format=rgba,fade=t=in:st={st:.2f}:d=0.6:alpha=1[w{i}];[{src}][w{i}]overlay=0:0:shortest=1[b{i + 1}]'
    fc += f';[b{len(words)}]format=yuv420p[v]'
    run([FF, '-y', '-v', 'error'] + inputs + ['-filter_complex', fc, '-map', '[v]', '-t', str(want), '-an'] + ENC + [dst])
    return {'speed': round(1 / speed, 3)}


def rig_clip(sid, want, dst):
    src = os.path.join(RIG, f'{sid}.mp4')
    run([FF, '-y', '-v', 'error', '-i', src, '-vf', f'fps={FPS},scale=1920:1080,tpad=stop_mode=clone:stop_duration=8', '-t', str(want), '-an'] + ENC + [dst])
    return {}


def card_clip(sid, prev_clip, dst):
    # The card's alpha render wipes in over the previous shot's last frame.
    alpha = os.path.join(RIG, f'{sid}-alpha.mov')
    last = max(0, dur_of(prev_clip) - 0.05)
    fc = (f'[0:v]trim=start={last - 0.04:.3f},setpts=PTS-STARTPTS,fps={FPS},tpad=stop_mode=clone:stop_duration=3,trim=0:2.5[bg];'
          f'[1:v]fps={FPS},format=yuva420p[fg];[bg][fg]overlay=0:0:format=auto,format=yuv420p[v]')
    run([FF, '-y', '-v', 'error', '-i', prev_clip, '-i', alpha, '-filter_complex', fc, '-map', '[v]', '-t', '2.5', '-an'] + ENC + [dst])
    return {}


def build_clips(ids, report):
    os.makedirs(CLIPS, exist_ok=True)
    plan = {}
    prev = None
    for sid in ids:
        want = shot_secs(sid)
        dst = os.path.join(CLIPS, f'{sid}.mp4')
        k = kind(sid)
        if '--reuse-clips' in sys.argv and os.path.exists(dst) and k != 'card':
            srcs = [os.path.join(CAP, f'{x}.{e}') for x in ([sid, 'f7_gift'] if sid == 'f7_cash' else [sid]) for e in ('json', 'webm')] + [os.path.join(RIG, f'{sid}.mp4')]
            newest = max([os.path.getmtime(x) for x in srcs if os.path.exists(x)] or [0])
            ip = dst.replace('.mp4', '.info.json')
            if os.path.getmtime(dst) > newest and abs(dur_of(dst) - want) < 0.1 and os.path.exists(ip):
                info = json.load(open(ip))
                plan[sid] = {'secs': want, 'vo': round(VO_LEN.get(sid, 0), 2), 'kind': k, 'reused': True, **info}
                if k == 'capture':  # carry the reused clip's fit into the report
                    if info.get('trimmedTail', 0) > 0.3: report['trimmed'].append(f"{sid}: {info['trimmedTail']:.1f}s of tail trimmed")
                    if info.get('frozenTail', 0) > 1.5: report['frozen'].append(f"{sid}: {info['frozenTail']:.1f}s frozen tail")
                prev = dst
                continue
        if k == 'hero': info = hero_clip(want, dst)
        elif k == 'rig': info = rig_clip(sid, want, dst)
        elif k == 'card': info = card_clip(sid, prev, dst)
        else:
            tl = timeline(sid, want)
            info = timeline_clip(sid, tl, want, dst, report) if tl else None
            if info is None:
                info = capture_clip(sid, want, dst, report, extra=('f4_insert', 2.2) if sid == 'f4_verdict' else None)
        plan[sid] = {'secs': want, 'vo': round(VO_LEN.get(sid, 0), 2), 'kind': k, **info}
        json.dump(info, open(dst.replace('.mp4', '.info.json'), 'w'))
        print(f'  clip {sid:16s} {want:6.2f}s  {k:8s} {json.dumps(info) if info else ""}')
        prev = dst
    return plan


# ── 2. join (filters only) ────────────────────────────────────────────────────
def xfade_join(clips, durs, dst, xf=XF):
    """Join clips with xfade crossfades (filter graph). Long lists are joined in groups,
    then the groups are joined — every step is a filter, never the concat demuxer."""
    if len(clips) <= 12:
        inputs = []
        for c in clips: inputs += ['-i', c]
        if len(clips) == 1:
            run([FF, '-y', '-v', 'error', '-i', clips[0], '-an'] + ENC + [dst]); return durs[0]
        f = []; prev = '0:v'; acc = durs[0]
        for i in range(1, len(clips)):
            f.append(f'[{prev}][{i}:v]xfade=transition=fade:duration={xf}:offset={acc - xf:.3f}[x{i}]')
            prev = f'x{i}'; acc += durs[i] - xf
        run([FF, '-y', '-v', 'error'] + inputs + ['-filter_complex', ';'.join(f), '-map', f'[{prev}]', '-an'] + ENC + [dst])
        return round(acc, 3)
    groups = [(clips[i:i + 10], durs[i:i + 10]) for i in range(0, len(clips), 10)]
    parts, pd = [], []
    for gi, (gc, gd) in enumerate(groups):
        p = dst.replace('.mp4', f'.g{gi}.mp4')
        pd.append(xfade_join(gc, gd, p, xf)); parts.append(p)
    total = xfade_join(parts, pd, dst, xf)
    for p in parts: os.remove(p)
    return total


def offsets_for(ids, durs):
    offs, t = [], 0.0
    for i, d in enumerate(durs):
        offs.append(round(t, 3)); t += d - (XF if i < len(durs) - 1 else 0)
    return offs, round(t, 3)


# ── 3. audio ──────────────────────────────────────────────────────────────────
BED_SEG = (0.0, 106.5)   # track-759: 32 bars (beat 0.83 s, first hit 0.04 s → bar 33 at ≈106.28 s), then decays;
BED_XF = 0.25            # so the restart (106.5 − 0.25 + 0.04) lands its first hit on that downbeat


def bed_loop():
    """track-759 looped seamlessly: its steady section repeated, joined with 3 s crossfades
    (a raw -stream_loop would dip into the track's own fade-out and restart every 112 s)."""
    dst = os.path.join(CLIPS, '_bed_loop.wav')
    stamp = f'{BED_SEG}{BED_XF}'
    if os.path.exists(dst) and os.path.exists(dst + '.stamp') and open(dst + '.stamp').read() == stamp:
        return dst
    n = 7  # ≈ 7 × 106.4 ≈ 744 s — longer than any render
    inputs, f = [], []
    for i in range(n):
        inputs += ['-i', BED]
        f.append(f'[{i}:a]aresample=48000,aformat=channel_layouts=stereo,atrim={BED_SEG[0]}:{BED_SEG[1]},asetpts=PTS-STARTPTS[b{i}]')
    prev = 'b0'
    for i in range(1, n):
        f.append(f'[{prev}][b{i}]acrossfade=d={BED_XF}:c1=tri:c2=tri[j{i}]'); prev = f'j{i}'
    run([FF, '-y', '-v', 'error'] + inputs + ['-filter_complex', ';'.join(f), '-map', f'[{prev}]', '-ar', '48000', '-ac', '2', dst])
    open(dst + '.stamp', 'w').write(stamp)
    return dst


# Ducking (fine cut): the bed follows the VOICE, not a compressor. Voiced spans are read
# from the voice mix itself (20 ms RMS), gaps shorter than DUCK_BRIDGE are bridged, the
# bed ramps down over DUCK_ATTACK from each span's onset and back up over DUCK_RELEASE
# after it — so it no longer swells between sentences (the old sidechain released in
# 0.7 s and pumped 12–19 dB inside every line). Only the hero video's ambience under
# c0_open is a separate, un-ducked bus; the c0_meet hit and the cold-open rise ARE ducked
# (un-ducked, they masked "Meet Cairo" — Whisper heard "Meet Kylie"); the hit lands
# 0.15 s before the first word, ahead of the 0.25 s attack, so it still hits.
DUCK_DB = -13.0
DUCK_BRIDGE = 1.5
DUCK_ATTACK = 0.25
DUCK_RELEASE = 1.2
HERO_GAIN = 2.6        # the homescreen video's ambience under c0_open (+8.3 dB on the old 0.9)
SR = 48000


def duck_gain(voice, sr=SR):
    import numpy as np
    hop = sr // 50
    nfr = len(voice) // hop
    if nfr == 0: return np.ones(len(voice), dtype=np.float32), []
    pw = (voice[:nfr * hop].astype(np.float64) ** 2).mean(axis=1).reshape(nfr, hop).mean(axis=1)
    db = 10 * np.log10(pw + 1e-12)
    live = db[db > -90]
    thr = max(-55.0, (np.percentile(live, 90) - 32.0) if live.size else -45.0)
    on = db > thr
    spans, i = [], 0
    while i < nfr:
        if on[i]:
            j = i
            while j < nfr and on[j]: j += 1
            spans.append([i / 50, j / 50]); i = j
        else: i += 1
    merged = []
    for a, b in spans:
        if merged and a - merged[-1][1] < DUCK_BRIDGE: merged[-1][1] = b
        else: merged.append([a, b])
    merged = [(a, b) for a, b in merged if b - a > 0.12]
    t = np.arange(nfr) / 50
    u = np.zeros(nfr)
    for a, b in merged:
        lo, hi = int(a * 50), min(nfr, int((b + DUCK_RELEASE) * 50) + 1)
        tt = t[lo:hi]
        tr = np.minimum(1.0, np.minimum((tt - a) / DUCK_ATTACK + 1e-9, 1.0 + (b - tt) / DUCK_RELEASE))
        u[lo:hi] = np.maximum(u[lo:hi], np.clip(tr, 0, 1))
    g = 10 ** (DUCK_DB * u / 20)
    gs = np.interp(np.arange(len(voice)) / sr, t, g).astype(np.float32)
    return gs, merged


def build_audio(ids, offs, total, dst, music=True, stems=None):
    import numpy as np
    # Each bus is rendered by its OWN ffmpeg run (one graph, one output): a single graph
    # with three outputs livelocked on the sizzle's short timeline.
    class Bus:
        def __init__(self): self.inputs, self.f, self.labels, self.n = [], [], [], 0
        def add(self, path, chain):
            self.inputs += ['-i', path]
            lab = f'[x{self.n}]'
            self.f.append(f'[{self.n}:a]{chain}{lab}'); self.labels.append(lab); self.n += 1
    vb, mb, sb = Bus(), Bus(), Bus()
    for sid, off in zip(ids, offs):
        p = vo_path(sid)
        if not p or kind(sid) == 'card': continue
        at = int((off + VO_IN) * 1000)
        vb.add(p, f'aresample=48000,aformat=channel_layouts=stereo,adelay={at}|{at}')
    if music:
        idx = {sid: off for sid, off in zip(ids, offs)}
        shift = VO_SHIFT.get('c0_meet', 0.0)
        # Hero video's own sound under ALL of c0_open, slowed with its picture (atempo), so
        # its whooshes land on their frames and the open never drops to silence.
        if 'c0_open' in idx:
            d_open = dur_of(os.path.join(CLIPS, 'c0_open.mp4'))
            sp = max(1 / MAX_SPEED, 7.0 / d_open)
            a = int(idx['c0_open'] * 1000)
            sb.add(HERO_WAV, f'aresample=48000,aformat=channel_layouts=stereo,atrim=0:7.0,asetpts=PTS-STARTPTS,atempo={sp:.4f},'
                     f'afade=t=out:st={max(0, d_open - 1.3):.2f}:d=1.3,volume={HERO_GAIN},adelay={a}|{a}')
        if 'c0_meet' in idx:
            st = idx['c0_meet'] + VO_IN - 0.15 - 1.1 + shift  # hero t=5.8 → its hit (6.90) lands 0.15 s before the first word
            cut = max(0.0, -st); a = int(max(0.0, st) * 1000)
            mb.add(HERO_WAV, f'aresample=48000,aformat=channel_layouts=stereo,atrim={5.8 + cut:.3f}:10.0,asetpts=PTS-STARTPTS,volume=0.9,adelay={a}|{a}')
            st = idx['c0_meet'] + VO_IN - 4.1 + shift  # the cue's hit (4.1 s) on "Until now" ("Meet" in the bumper)
            cut = max(0.0, -st); a = int(max(0.0, st) * 1000)
            mb.add(CUE_OPEN, f'aresample=48000,aformat=channel_layouts=stereo,atrim={cut:.3f},asetpts=PTS-STARTPTS,volume=0.45,adelay={a}|{a}')
        bed = bed_loop()
        # Under the competitor line: the bed, low. It now fades in 1.5 s BEFORE the rivals
        # tiles (under the end of c0_open), so the hero ambience hands over without a gap.
        if 'c0_rivals' in idx and 'c0_meet' in idx:
            r0 = max(0.0, idx['c0_rivals'] - 1.5)
            r1 = idx['c0_meet'] + VO_IN - 4.1 + 0.8 + shift   # 0.8 s into the rise
            a = int(r0 * 1000)
            mb.add(bed, f'atrim=60:{60 + r1 - r0:.2f},asetpts=PTS-STARTPTS,afade=t=in:d=2.0,afade=t=out:st={max(0, r1 - r0 - 1.6):.2f}:d=1.6,volume=0.30,adelay={a}|{a}')
        # The calm bed: from c0_promise to the trust card, faded in and out.
        b0 = idx.get('c0_promise', idx.get(ids[0], 0))
        b1 = idx.get('z2_end', total)
        a = int(b0 * 1000)
        mb.add(bed, f'atrim=0:{b1 - b0 + 1:.2f},asetpts=PTS-STARTPTS,afade=t=in:d=2.5,afade=t=out:st={max(0, b1 - b0 - 3):.2f}:d=3,volume=0.42,adelay={a}|{a}')
        for sid in ids:
            if kind(sid) == 'card':
                a = int(max(0, idx[sid] + 0.35) * 1000)
                mb.add(CUE_CARD, f'aresample=48000,aformat=channel_layouts=stereo,volume=0.55,adelay={a}|{a}')
        if 'z2_end' in idx:
            st = max(0, idx['z2_end'] - 11.6)   # the lift (11.1–12.1 s) lands on the end card
            a = int(st * 1000)
            # rings out under the end-card hold, fading over the last 2 s
            mb.add(CUE_END, f'aresample=48000,aformat=channel_layouts=stereo,atrim=0:{total - st + 0.5:.2f},afade=t=in:d=3,afade=t=out:st={max(0, total - st - 2.0):.2f}:d=2.0,volume=0.3,adelay={a}|{a}')
    tmp = dst.replace('.wav', '')
    raws = {k: f'{tmp}.{k}.f32' for k in ('voice', 'music', 'sfx')}
    for bus, k in ((vb, 'voice'), (mb, 'music'), (sb, 'sfx')):
        if not bus.labels:
            run([FF, '-y', '-v', 'error', '-f', 'lavfi', '-i', f'anullsrc=r={SR}:cl=stereo', '-t', f'{total:.3f}', '-f', 'f32le', raws[k]])
            continue
        mixf = ''.join(bus.labels) + (f'amix=inputs={len(bus.labels)}:normalize=0' if len(bus.labels) > 1 else 'anull') + f',apad=whole_dur={total:.3f},atrim=0:{total:.3f}[out]'
        run([FF, '-y', '-v', 'error'] + bus.inputs + ['-filter_complex', ';'.join(bus.f + [mixf]), '-map', '[out]', '-t', f'{total:.3f}', '-ar', str(SR), '-ac', '2', '-f', 'f32le', raws[k]])
    N = int(round(total * SR))
    def load(k):
        x = np.fromfile(raws[k], dtype='<f4')
        x = x[: (len(x) // 2) * 2].reshape(-1, 2)
        if len(x) < N: x = np.vstack([x, np.zeros((N - len(x), 2), dtype=np.float32)])
        return x[:N]
    v, m, fx = load('voice'), load('music'), load('sfx')
    for p in raws.values(): os.remove(p)
    g, spans = duck_gain(v)
    md = m * g[:, None]
    out = (v + md + fx).astype('<f4')
    raw = dst.replace('.wav', '.raw.wav')
    def to_wav(arr, path):
        tmpf = path + '.f32'
        arr.astype('<f4').tofile(tmpf)
        run([FF, '-y', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', tmpf, '-c:a', 'pcm_s24le', path])
        os.remove(tmpf)
    to_wav(out, raw)
    if stems:
        to_wav(v, os.path.join(stems, 'voice.wav'))
        to_wav(m + fx, os.path.join(stems, 'music-raw.wav'))
        to_wav(md + fx, os.path.join(stems, 'music-ducked.wav'))
        json.dump({'spans': spans, 'duckDb': DUCK_DB, 'bridge': DUCK_BRIDGE, 'attack': DUCK_ATTACK, 'release': DUCK_RELEASE},
                  open(os.path.join(stems, 'duck.json'), 'w'))
    loudnorm(raw, dst)
    os.remove(raw)


def loudnorm(src, dst, I=-16, TP=-1.5, LRA=11):
    r = subprocess.run([FF, '-hide_banner', '-i', src, '-af', f'loudnorm=I={I}:TP={TP}:LRA={LRA}:print_format=json', '-f', 'null', '-'], capture_output=True, text=True)
    m = json.loads(r.stderr[r.stderr.rindex('{'):r.stderr.rindex('}') + 1])
    af = (f"loudnorm=I={I}:TP={TP}:LRA={LRA}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
          f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    run([FF, '-y', '-v', 'error', '-i', src, '-af', af, '-ar', '48000', '-ac', '2', dst])


def lufs(path):
    r = subprocess.run([FF, '-hide_banner', '-i', path, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], capture_output=True, text=True)
    m = re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)
    return float(m[-1]) if m else None


def mux(video, audio, dst, total, scale=None):
    vf = ['-vf', f'scale={scale}:flags=lanczos'] if scale else []
    vcodec = ENC if scale else ['-c:v', 'copy']
    run([FF, '-y', '-v', 'error', '-i', video, '-i', audio] + vf + ['-map', '0:v', '-map', '1:a'] + vcodec +
        ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-t', str(total), dst])


def fade_out(video, total, dst):
    run([FF, '-y', '-v', 'error', '-i', video, '-vf', f'fade=t=in:st=0:d=0.5,fade=t=out:st={total - 0.9:.2f}:d=0.9', '-an'] + ENC + [dst])


# ── 4. captions (KYRO, never Cairo) ───────────────────────────────────────────
ACRONYM = re.compile(r'\b((?:[A-Z] ){1,4}[A-Z])\b')


def display(text):
    t = text.replace('our Cairo dot com', 'ourkyro.com').replace('Cairo dot com', 'kyro.com')
    t = re.sub(r'\bCairo\b', 'KYRO', t)
    t = ACRONYM.sub(lambda m: m.group(1).replace(' ', ''), t)
    return t



def script_words(vo):
    """The SCRIPT's words (what captions show: "FACTS", "BoardEffect", "CASI") timed by
    the SPOKEN words' timings (the voice read "Facts", "Board Effect", "Casey")."""
    import difflib
    spoken = vo['words']
    text = vo['text'].split()
    norm = lambda x: re.sub(r'[^a-z0-9]', '', x.lower())
    a = [norm(w['word']) for w in spoken]
    b = [norm(t) for t in text]
    times = [None] * len(text)
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1): times[j1 + k] = (spoken[i1 + k]['start'], spoken[i1 + k]['end'])
        elif i2 > i1:  # replace: spread the spoken span over the script words
            st, en = spoken[i1]['start'], spoken[i2 - 1]['end']
            n = j2 - j1
            for k in range(n): times[j1 + k] = (st + (en - st) * k / n, st + (en - st) * (k + 1) / n)
    for j in range(len(times)):  # inserted script words with no audio: borrow a neighbour
        if times[j] is None:
            prev = next((times[x] for x in range(j - 1, -1, -1) if times[x]), (0, 0))
            times[j] = (prev[1], prev[1])
    return [{'word': t, 'start': a_, 'end': b_} for t, (a_, b_) in zip(text, times)]

def caption_cues(ids, offs):
    cues = []
    for sid, off in zip(ids, offs):
        p = os.path.join(HERE, f'vo-v4/{sid}.json')
        if kind(sid) == 'card' or not os.path.exists(p): continue
        vo = json.load(open(p))
        words = script_words(vo)
        # Merge spaced acronym letters into one display word before chunking.
        merged = []
        for w in words:
            tok = w['word']
            if merged and re.fullmatch(r'[A-Z][.,:;!?]?', tok) and merged[-1].get('acr') and len(merged[-1]['word']) < 5:
                merged[-1] = {'word': merged[-1]['word'] + tok, 'start': merged[-1]['start'], 'end': w['end'], 'acr': not re.search(r'[.,:;!?]$', tok)}
            else:
                merged.append({**w, 'acr': bool(re.fullmatch(r'[A-Z]', tok))})
        chunk, start = [], None
        def flush(end):
            if chunk:
                txt = display(' '.join(chunk))
                cues.append((off + VO_IN + start, off + VO_IN + end + 0.15, txt, sid))
        for i, w in enumerate(merged):
            if not chunk: start = w['start']
            chunk.append(w['word'])
            line = ' '.join(chunk)
            brk = re.search(r'[.?!]$', w['word']) or (re.search(r'[,;:—]$', w['word']) and len(line) > 34) or len(line) > 64
            if brk or i == len(merged) - 1:
                flush(w['end']); chunk = []
    # fold an orphan word ("alongside.", "all.") back into the cue before it — same scene only
    folded = []
    for a, b, t, sid in cues:
        if folded and folded[-1][3] == sid and len(t.split()) == 1 and len(folded[-1][2]) + len(t) < 84 and a - folded[-1][1] < 0.6:
            pa, pb, pt, _ = folded[-1]; folded[-1] = (pa, b, pt + ' ' + t, sid)
        else:
            folded.append((a, b, t, sid))
    cues = folded
    # wrap to two lines ≤ 42 chars, never splitting a product or body name
    KEEP = ['Sage Intacct', 'Florida Catholic Conference', 'United States', 'Profit and Loss', 'Balance Sheet']
    out = []
    for a, b, t, _ in cues:
        if len(t) > 42:
            for k in KEEP: t = t.replace(k, k.replace(' ', '\u00a0'))
            words = t.split(' '); l1 = ''
            while words and len(l1 + ' ' + words[0]) <= max(len(t) // 2 + 6, 20): l1 = (l1 + ' ' + words.pop(0)).strip()
            t = (l1 + '\n' + ' '.join(words)).replace('\u00a0', ' ')
        out.append((a, b, t))
    for i in range(len(out) - 1):  # never overlap
        if out[i][1] > out[i + 1][0]: out[i] = (out[i][0], out[i + 1][0] - 0.02, out[i][2])
    return out


def srt_time(t):
    ms = int(round(t * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'


def write_srt(cues, dst):
    with open(dst, 'w') as fh:
        for i, (a, b, t) in enumerate(cues, 1):
            fh.write(f'{i}\n{srt_time(a)} --> {srt_time(b)}\n{t}\n\n')


# ── 5. a full render of an id list ────────────────────────────────────────────
def render(ids, dst, music=True, video_note='', stems=None):
    durs = [dur_of(os.path.join(CLIPS, f'{sid}.mp4')) for sid in ids]
    offs, total = offsets_for(ids, durs)
    tmpv = dst.replace('.mp4', '.v.mp4'); tmpv2 = dst.replace('.mp4', '.vf.mp4'); wav = dst.replace('.mp4', '.wav')
    jt = xfade_join([os.path.join(CLIPS, f'{sid}.mp4') for sid in ids], durs, tmpv)
    total = min(total, dur_of(tmpv))
    fade_out(tmpv, total, tmpv2)
    if stems: os.makedirs(stems, exist_ok=True)
    build_audio(ids, offs, total, wav, music, stems)
    mux(tmpv2, wav, dst, total)
    for p in (tmpv, tmpv2, wav): os.remove(p)
    print(f'  wrote {os.path.relpath(dst, HERE)} ({total:.1f}s, {lufs(dst)} LUFS){video_note}')
    return offs, total


def end_card_clip(dst):
    """A 6 s end card: the last ~5.2 s of z2_end (KYRO lockup, tagline, ourkyro.com) + a hold."""
    src = os.path.join(RIG, 'z2_end.mp4')
    st = max(0, dur_of(src) - 5.2)
    run([FF, '-y', '-v', 'error', '-ss', f'{st:.2f}', '-i', src, '-vf', f'fps={FPS},tpad=stop_mode=clone:stop_duration=2', '-t', '6', '-an'] + ENC + [dst])
    # its voice: z2_end's last sentence ("Cairo. See it on your own books, at our Cairo dot com.")
    words = json.load(open(os.path.join(HERE, 'vo-v4/z2_end.json')))['words']
    idx = max(i for i, w in enumerate(words) if w['word'].startswith('Cairo') and i < len(words) - 3)
    return st, words[idx]['start']


def mute_head(sid, first_kept):
    """A copy of sid's line, silent until the word `first_kept` (timing unchanged).
    Returns (path, seconds the kept speech moved relative to the line's first word)."""
    words = json.load(open(os.path.join(HERE, f'vo-v4/{sid}.json')))['words']
    norm = lambda x: re.sub(r'[^a-z]', '', x.lower())
    k = next(i for i, w in enumerate(words) if norm(w['word']) == norm(first_kept))
    at = max(0.0, words[k]['start'] - 0.05)
    dst = os.path.join(CLIPS, f'_vo_{sid}_from_{norm(first_kept)}.wav')
    run([FF, '-y', '-v', 'error', '-i', os.path.join(HERE, f'vo-v4/{sid}.mp3'), '-af', f'afade=t=in:st={at:.3f}:d=0.05', '-ar', '48000', dst])
    return dst, round(words[k]['start'] - words[0]['start'], 3)


def main():
    os.makedirs(OUT, exist_ok=True)
    plan_only = '--plan' in sys.argv
    plan = {sid: {'secs': shot_secs(sid), 'vo': round(VO_LEN[sid], 2), 'kind': kind(sid), 'chapter': BY[sid]['chapter']} for sid in ORDER}
    durs = [plan[s]['secs'] for s in ORDER]
    offs, total = offsets_for(ORDER, durs)
    if plan_only:
        for sid, off in zip(ORDER, offs): print(f'{off:7.1f}  {sid:16s} vo {plan[sid]["vo"]:5.1f}s → {plan[sid]["secs"]:5.1f}s  {plan[sid]["kind"]}')
        print('total ≈', total, 's'); return
    report = {'missing': [], 'trimmed': [], 'frozen': []}
    if '--derived' in sys.argv:   # derived cuts only, from the clips already in out-v4/clips
        derived(report); return
    print('▸ clips')
    plan = build_clips(ORDER, report)
    for sid in ORDER: plan[sid]['chapter'] = BY[sid]['chapter']
    print('▸ master')
    offs, total = render(ORDER, os.path.join(OUT, 'kyro-demo-v4.mp4'), stems=os.environ.get('KYRO_STEMS_DIR'))
    # chapters + captions
    chap, seen = [], set()
    for sid, off in zip(ORDER, offs):
        c = BY[sid]['chapter']
        if c not in seen:
            seen.add(c); t = int(round(off)); chap.append(f'{t // 60}:{t % 60:02d} {CHAPTER_TITLES.get(c, c)}')
    open(os.path.join(OUT, 'chapters.txt'), 'w').write('\n'.join(chap) + '\n')
    cues = caption_cues(ORDER, offs)
    write_srt(cues, os.path.join(OUT, 'kyro-demo-v4.srt'))
    assert not any('Cairo' in t for _, _, t in cues), 'caption says Cairo'
    # poster: the Scholar landed on the book in c0_meet
    po = offs[ORDER.index('c0_meet')] + 4.6 if 'c0_meet' in ORDER else 1
    run([FF, '-y', '-v', 'error', '-ss', f'{po:.2f}', '-i', os.path.join(OUT, 'kyro-demo-v4.mp4'), '-frames:v', '1', '-q:v', '2', os.path.join(OUT, 'poster.jpg')])
    json.dump({'XF': XF, 'VO_IN': VO_IN, 'VO_PAD': VO_PAD, 'maxSpeed': MAX_SPEED, 'total': total,
               'scenes': [{'id': s, 'offset': o, **plan[s]} for s, o in zip(ORDER, offs)], 'report': report},
              open(os.path.join(OUT, 'plan.json'), 'w'), indent=1)
    if '--master' not in sys.argv:
        print('▸ 720p')
        mux(os.path.join(OUT, 'kyro-demo-v4.mp4'), os.path.join(OUT, 'kyro-demo-v4.mp4'), os.path.join(OUT, 'kyro-demo-v4-720p.mp4'), total, scale='1280:720')
        derived(report)
    print('report:', json.dumps(report, indent=1))


def derived(report):
    if True:
        print('▸ end card + derived cuts', flush=True)
        st, cairo_at = end_card_clip(os.path.join(CLIPS, '_endcard.mp4'))
        # end card voice: cut z2_end's VO from "Cairo." to the end
        run([FF, '-y', '-v', 'error', '-ss', f'{max(0, cairo_at - 0.05):.3f}', '-i', vo_path('z2_end'), '-c:a', 'libmp3lame', '-b:a', '192k', os.path.join(CLIPS, '_endcard_vo.mp3')])
        global VO_LEN
        def render_with_end(ids, dst):
            # the end card's VO lands 0.35 s in; its own clip has no line in vo-v4/, so patch the lookup.
            shutil.copy(os.path.join(CLIPS, '_endcard_vo.mp3'), os.path.join(HERE, 'vo-v4', '_endcard.mp3'))
            try:
                ORDER_K = ids + ['_endcard']
                BY['_endcard'] = {'chapter': 'close'}
                return render(ORDER_K, dst)
            finally:
                os.remove(os.path.join(HERE, 'vo-v4', '_endcard.mp3'))
        # Derived cuts open cold on c0_meet, so its "Until now." would point at nothing:
        # the bumper keeps the picture and timing but starts the voice at "Meet Cairo."
        # The sizzle also drops a leading "Then" where the line borrowed from the master
        # has no setup before it (e4_grades, r7_board). Existing audio only — no new voice.
        bump = mute_head('c0_meet', 'Meet')
        then_e4 = mute_head('e4_grades', 'where')
        then_r7 = mute_head('r7_board', 'hand')
        VO_OVERRIDE.clear(); VO_SHIFT.clear()
        VO_OVERRIDE.update({'c0_meet': bump[0], 'e4_grades': then_e4[0], 'r7_board': then_r7[0]})
        VO_SHIFT['c0_meet'] = bump[1]
        # sizzle (existing lines only)
        render_with_end(SIZZLE, os.path.join(OUT, 'kyro-demo-v4-sizzle-90s.mp4'))
        del VO_OVERRIDE['e4_grades'], VO_OVERRIDE['r7_board']
        for mod, ch in MODULE_CUTS.items():
            ids = ['c0_meet'] + [s for s in ORDER if BY[s]['chapter'] == ch]
            # the chapter card wipes in over c0_meet's lockup here, not over the master's previous scene
            ids = [f'{s}_cut' if kind(s) == 'card' else s for s in ids]
            for s in ids:
                if s.endswith('_cut'):
                    card_clip(s[:-4], os.path.join(CLIPS, 'c0_meet.mp4'), os.path.join(CLIPS, f'{s}.mp4'))
            render_with_end(ids, os.path.join(OUT, f'kyro-demo-v4-{mod}.mp4'))
        VO_OVERRIDE.clear(); VO_SHIFT.clear()


if __name__ == '__main__':
    main()

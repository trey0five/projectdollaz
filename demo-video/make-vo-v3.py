#!/usr/bin/env python3
"""KYRO demo v3 voiceover renderer (ElevenLabs, urllib only).

Renders one mp3 per scene in scenes-v3.json into vo-v3/<id>.mp3, skipping any
file that already exists (quota-friendly).  Same voice as v2 (Bella,
eleven_multilingual_v2, mp3_44100_128) but slower / more deliberate:
stability 0.5, style 0.35, speed 0.93.

For the timed scenes (c0_dove, c0_pain) the /with-timestamps endpoint is used
and a <id>.alignment.json (raw alignment + derived words) is written; from
c0_dove's words a c0_dove.beats.json is derived with the start time of each
competitor name.  If with-timestamps is unavailable the script falls back to
the plain endpoint and ESTIMATES beats by proportional character offset, and
says so in the beats file and on stdout.

The API key is read BY NAME from village-finder's .env and never printed.
"""
import base64
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ENV = '/home/dream/village-finder/.env'
API = 'https://api.elevenlabs.io'
OUT = os.path.join(HERE, 'vo-v3')
FFPROBE = os.path.expanduser('~/bin/ffprobe')
FFMPEG = os.path.expanduser('~/bin/ffmpeg')
MODEL = 'eleven_multilingual_v2'
OUTPUT_FORMAT = 'mp3_44100_128'
SETTINGS = {'stability': 0.5, 'similarity_boost': 0.75, 'style': 0.35, 'speed': 0.93}
TIMED = ('c0_dove', 'c0_pain')
BEAT_TERMS = ['Blackbaud', 'FACTS', 'Veracross', 'PowerSchool', 'Sage', 'BoardEffect', 'Six']
BEAT_LABELS = {'Sage': 'Sage Intacct', 'Six': 'Six tools'}


def read_key():
    with open(ENV) as f:
        for line in f:
            if line.startswith('ELEVENLABS_API_KEY='):
                return line.split('=', 1)[1].strip().strip('"\'')
    sys.exit('ELEVENLABS_API_KEY not found in ' + ENV)


KEY = read_key()


def call(path, body=None, method=None):
    """Return (status, headers, bytes). Never raises on HTTP errors."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={'xi-api-key': KEY, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def quota(label):
    st, _, b = call('/v1/user/subscription')
    if st == 200:
        s = json.loads(b)
        used, lim = s['character_count'], s['character_limit']
        print(f'[quota {label}] tier={s.get("tier")} used={used} limit={lim} remaining={lim - used}')
        return lim - used
    try:
        msg = json.loads(b)['detail'].get('message')
    except Exception:
        msg = b[:200]
    print(f'[quota {label}] UNAVAILABLE: HTTP {st} — {msg}')
    return None


def resolve_voice(name='Bella'):
    st, _, b = call('/v1/voices')
    assert st == 200, f'/v1/voices HTTP {st}: {b[:200]}'
    for v in json.loads(b)['voices']:
        if v['name'].startswith(name):
            return v['voice_id'], v['name']
    sys.exit(f'voice {name} not found')


def tts(voice, text, with_ts):
    """Render; returns (mp3_bytes, alignment_or_None, headers, notes[])."""
    notes = []
    settings = dict(SETTINGS)
    path = f'/v1/text-to-speech/{voice}' + ('/with-timestamps' if with_ts else '') \
        + f'?output_format={OUTPUT_FORMAT}'
    for attempt in range(2):
        body = {'text': text, 'model_id': MODEL, 'voice_settings': settings}
        st, hdrs, b = call(path, body)
        if st == 200:
            if with_ts:
                j = json.loads(b)
                return base64.b64decode(j['audio_base64']), j.get('alignment') or j.get('normalized_alignment'), hdrs, notes
            return b, None, hdrs, notes
        err = b.decode(errors='replace')[:400]
        if attempt == 0 and 'speed' in settings and 'speed' in err.lower():
            notes.append(f'speed rejected (HTTP {st}); retrying without it')
            settings.pop('speed')
            continue
        raise RuntimeError(f'HTTP {st}: {err}')
    raise RuntimeError('unreachable')


def words_from_alignment(al):
    chars = al['characters']
    starts = al['character_start_times_seconds']
    ends = al['character_end_times_seconds']
    words, cur = [], None
    for c, s, e in zip(chars, starts, ends):
        if c.isspace():
            if cur:
                words.append(cur)
                cur = None
            continue
        if cur is None:
            cur = {'word': c, 'start': s, 'end': e}
        else:
            cur['word'] += c
            cur['end'] = e
    if cur:
        words.append(cur)
    return words


def estimate_words(text, duration):
    """Proportional-character-offset fallback when no alignment is available."""
    n = max(len(text), 1)
    words = []
    for m in re.finditer(r'\S+', text):
        words.append({'word': m.group(), 'start': duration * m.start() / n, 'end': duration * m.end() / n})
    return words


def norm(w):
    return re.sub(r'[^A-Za-z0-9]', '', w).lower()


def probe_duration(path):
    r = subprocess.run([FFPROBE, '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                       capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def mean_volume(path):
    r = subprocess.run([FFMPEG, '-v', 'info', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'],
                       capture_output=True, text=True)
    m = re.search(r'mean_volume:\s*(-?[\d.]+) dB', r.stderr)
    return float(m.group(1)) if m else None


def main():
    scenes = json.load(open(os.path.join(HERE, 'scenes-v3.json')))['scenes']
    os.makedirs(OUT, exist_ok=True)
    need = sum(len(s['vo']) for s in scenes if not os.path.exists(os.path.join(OUT, s['id'] + '.mp3')))
    print(f'{len(scenes)} scenes; {need} characters still to render')
    remaining_before = quota('before')
    if remaining_before is not None and remaining_before < need:
        print(f'WARNING: quota {remaining_before} < needed {need}; rendering in scene order until it stops')
    voice, vname = resolve_voice()
    print(f'voice: {vname} ({voice}); model {MODEL}; settings {SETTINGS}')

    failed, rendered, last_quota_hdr = [], [], {}
    speed_note = None
    for s in scenes:
        sid, text = s['id'], s['vo']
        mp3 = os.path.join(OUT, sid + '.mp3')
        if os.path.exists(mp3):
            print(f'  skip {sid} (exists)')
            continue
        with_ts = sid in TIMED
        alignment, estimated = None, False
        try:
            try:
                audio, alignment, hdrs, notes = tts(voice, text, with_ts)
            except RuntimeError as e:
                if not with_ts:
                    raise
                print(f'  {sid}: with-timestamps FAILED ({e}); falling back to plain endpoint + ESTIMATED beats')
                audio, alignment, hdrs, notes = tts(voice, text, False)
                estimated = True
        except Exception as e:
            print(f'  FAIL {sid}: {e}')
            failed.append((sid, str(e)))
            if 'quota' in str(e).lower() or 'character' in str(e).lower():
                print('  quota-type error; stopping here')
                break
            continue
        for n in notes:
            speed_note = n
            print(f'  note {sid}: {n}')
        with open(mp3, 'wb') as fh:
            fh.write(audio)
        last_quota_hdr = {k: v for k, v in hdrs.items() if 'character' in k.lower() or 'quota' in k.lower()}
        dur = probe_duration(mp3)
        rendered.append(sid)
        print(f'  {sid}: {dur:.1f}s  {last_quota_hdr or ""}')
        if with_ts:
            words = words_from_alignment(alignment) if alignment else estimate_words(text, dur)
            with open(os.path.join(OUT, sid + '.alignment.json'), 'w') as fh:
                json.dump({'id': sid, 'text': text, 'estimated': estimated or alignment is None,
                           'alignment': alignment, 'words': words}, fh, indent=1)

    # Beats for c0_dove (from alignment file, whether rendered now or earlier).
    al_path = os.path.join(OUT, 'c0_dove.alignment.json')
    if os.path.exists(al_path):
        al = json.load(open(al_path))
        words = al['words']
        beats = {}
        for term in BEAT_TERMS:
            hit = next((w for w in words if norm(w['word']) == norm(term)), None)
            beats[BEAT_LABELS.get(term, term)] = round(hit['start'], 3) if hit else None
        perch = os.path.join(OUT, 'c0_perch.mp3')
        out = {
            'source': 'ESTIMATED by proportional character offset (with-timestamps unavailable)'
                      if al.get('estimated') else 'ElevenLabs with-timestamps alignment (word-level)',
            'c0_dove_duration': round(probe_duration(os.path.join(OUT, 'c0_dove.mp3')), 3),
            'beats': beats,
            'until_now': {
                'note': '"Until now" is the opening of c0_perch (t=0 of that clip); its total duration is recorded here',
                'c0_perch_duration': round(probe_duration(perch), 3) if os.path.exists(perch) else None,
            },
        }
        with open(os.path.join(OUT, 'c0_dove.beats.json'), 'w') as fh:
            json.dump(out, fh, indent=1)
        print('\nc0_dove.beats.json:')
        print(json.dumps(out, indent=1))

    # Table + checks.
    print(f'\n{"scene":<18}{"dur s":>8}{"mean dB":>10}  check')
    total, bad = 0.0, []
    for s in scenes:
        mp3 = os.path.join(OUT, s['id'] + '.mp3')
        if not os.path.exists(mp3):
            print(f'{s["id"]:<18}{"-":>8}{"-":>10}  MISSING')
            bad.append(s['id'])
            continue
        dur, mv = probe_duration(mp3), mean_volume(mp3)
        total += dur
        ok = dur > 1.0 and mv is not None and mv > -40
        if not ok:
            bad.append(s['id'])
        print(f'{s["id"]:<18}{dur:>8.1f}{(mv if mv is not None else float("nan")):>10.1f}  {"ok" if ok else "BAD"}')
    print(f'{"TOTAL":<18}{total:>8.1f}s   ({total / 60:.1f} min)')
    print(f'\nrendered now: {len(rendered)}; failed: {failed or "none"}; check-failures: {bad or "none"}')
    if speed_note:
        print('SPEED:', speed_note)
    else:
        print('SPEED: speed=0.93 accepted by the API')
    quota('after')
    if last_quota_hdr:
        print('last TTS response quota headers:', last_quota_hdr)


if __name__ == '__main__':
    main()

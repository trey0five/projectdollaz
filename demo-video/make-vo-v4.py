#!/usr/bin/env python3
"""KYRO demo v4 voiceover renderer + checker (ElevenLabs TTS, OpenAI Whisper; urllib only).

Lines come from vo-v4-lines.json (display text, as approved).  Before voicing,
RESPELL turns display text into the SPOKEN text (pronunciation fixes found by the
probe).  Every mp3 is stamped with a fingerprint of its spoken text + voice +
settings (ID3 comment AND the <id>.json sidecar), so a changed line is always
re-voiced and an unchanged one never is (resumable, quota-friendly).

  python3 make-vo-v4.py lint                 # VO-rule lint of every line (no API)
  python3 make-vo-v4.py probe <round>        # pronunciation batch -> vo-v4/_probe/, Whisper transcript
  python3 make-vo-v4.py render [ids...]      # voice lines whose fingerprint changed (with-timestamps)
  python3 make-vo-v4.py check [ids...]       # Whisper-transcribe + diff against the script
  python3 make-vo-v4.py retake <id> [...]    # force a fresh take of these lines (old take kept as .take<N>.mp3)
  python3 make-vo-v4.py report               # durations vs storyboard, runtime estimate

Outputs: vo-v4/<id>.mp3 + vo-v4/<id>.json {id, text, spoken, fingerprint, duration,
alignment, words, whisper:{transcript, diff}}.  Character spend is ledgered in
vo-v4/_ledger.json and hard-capped at BUDGET.  API keys are read BY NAME from
village-finder's .env and never printed.
"""
import base64
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
ENV = '/home/dream/village-finder/.env'
LINES = os.path.join(HERE, 'vo-v4-lines.json')
OUT = os.path.join(HERE, 'vo-v4')
LEDGER = os.path.join(OUT, '_ledger.json')
FFPROBE = shutil.which('ffprobe') or os.path.expanduser('~/bin/ffprobe')
FFMPEG = shutil.which('ffmpeg') or os.path.expanduser('~/bin/ffmpeg')
EL_API = 'https://api.elevenlabs.io'
OA_API = 'https://api.openai.com/v1/audio/transcriptions'
VOICE_NAME = 'Bella'
MODEL = 'eleven_multilingual_v2'
OUTPUT_FORMAT = 'mp3_44100_128'
SETTINGS = {'stability': 0.5, 'similarity_boost': 0.75, 'style': 0.35, 'speed': 0.93}
WHISPER_MODEL = 'whisper-1'
BUDGET = 12000          # characters, all ElevenLabs calls in this production
XFADE = 0.4             # storyboard crossfade between scenes
PAD = 1.0               # storyboard: scene = max(minSec, narration + 1 s)

# Display -> spoken respellings (pronunciation fixes; filled from the probe rounds).
RESPELL = [
    # (regex, replacement, why) — from probe rounds 1-2 (vo-v4/_probe/), 2026-10-17
    (r'\bCASI\b', 'Casey', 'round 1: Whisper heard "COSI"; round 2 "N C A Casey" heard as "NCA Casey" by both models'),
    (r'\bBoardEffect\b', 'Board Effect', 'round 1: Whisper heard "Bordifact"; round 2 "Board Effect" clean in both models'),
    (r'\bFACTS\b', 'Facts', 'line pass: all-caps FACTS heard as "Fax" (whisper) / "FACS" (4o), also in isolation'),
    # NIPSA kept as written: Whisper writes "NPSA" for any spelling (incl. "Nip-suh"), gpt-4o-transcribe
    # hears "NIPSA" for both the plain and respelled takes -> transcriber spelling, not pronunciation.
]
# Transcriber disagreements reviewed by snippet re-transcription and accepted (not mispronunciations).
ACCEPTED = {
    'r2_frameworks': (['accreditrac', 'nipsa'], 'Accreditrac heard as homophone "Accreditrack"; NIPSA cut out alone '
                      'transcribes "nipsa" (whisper) and "nipsa" x2/3 (4o) — in-line misses are vocabulary bias (NPSA/NEASC)'),
    'z2_end': (['our', 'cairo'], 'whisper writes the domain "ourcairo.com" = the script; 4o "archairo" is its own miss'),
}
SECOND_OPINION = 'gpt-4o-transcribe'   # a word is suspect only if BOTH transcribers miss it

PROBE_TEXT = {
    1: ("Meet Cairo. Your key numbers, or K P Eyes, in one place. Cognia, with your N C A CASI division. "
        "NIPSA. The Florida Catholic Conference and its Accreditrac portal. TerraNova, A C T and S A T scores. "
        "Veracross, Blackbaud and BoardEffect. FERPA and COPPA. Cairo reads it all."),
    # round 1 heard: CASI->"COSI", NIPSA->"NPSA", BoardEffect->"Bordifact"; retest respellings only
    2: ("Cognia, with your N C A Casey division. Nip-suh, M S A and A C S I. "
        "Sage Intacct or Board Effect alongside. Hold Nipsa too? Adopt both."),
    # line pass: r2's in-line NIPSA heard "NPSA" (whisper) / "NEASC", "nepsa" (4o); three spellings, same context
    3: ("Its Accreditrac portal, NIPSA, M S A and more. Its Accreditrac portal, Nipsa, M S A and more. "
        "Its Accreditrac portal, Nip-sah, M S A and more."),
}


# ---------------------------------------------------------------- keys / http
def read_key(name):
    with open(ENV) as f:
        for line in f:
            if line.startswith(name + '='):
                v = line.split('=', 1)[1].strip()
                v = v.split()[0] if v else v          # drop a trailing ' # comment'
                return v.strip('"\'')
    sys.exit(f'{name} not found in {ENV}')


def el_call(path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(EL_API + path, data=data,
                                 headers={'xi-api-key': read_key('ELEVENLABS_API_KEY'),
                                          'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def quota(label):
    st, b = el_call('/v1/user/subscription')
    if st == 200:
        s = json.loads(b)
        rem = s['character_limit'] - s['character_count']
        print(f'[quota {label}] used={s["character_count"]} limit={s["character_limit"]} remaining={rem}')
        return rem
    print(f'[quota {label}] unavailable (HTTP {st})')
    return None


_VOICE = None


def voice_id():
    global _VOICE
    if _VOICE:
        return _VOICE
    st, b = el_call('/v1/voices')
    assert st == 200, f'/v1/voices HTTP {st}'
    for v in json.loads(b)['voices']:
        if v['name'].startswith(VOICE_NAME):
            _VOICE = v['voice_id']
            return _VOICE
    sys.exit(f'voice {VOICE_NAME} not found')


# ---------------------------------------------------------------- ledger
def ledger():
    if os.path.exists(LEDGER):
        return json.load(open(LEDGER))
    return {'budget': BUDGET, 'spent': 0, 'calls': []}


def spend(chars, what):
    lg = ledger()
    lg['spent'] += chars
    lg['calls'].append({'t': time.strftime('%Y-%m-%dT%H:%M:%S'), 'chars': chars, 'what': what})
    json.dump(lg, open(LEDGER, 'w'), indent=1)


def guard(chars):
    lg = ledger()
    if lg['spent'] + chars > BUDGET:
        sys.exit(f'BUDGET STOP: spent {lg["spent"]} + {chars} would exceed {BUDGET} characters. Report to the owner.')


# ---------------------------------------------------------------- tts / stt
def tts(text, what):
    """with-timestamps render. Returns (mp3_bytes, alignment)."""
    guard(len(text))
    path = f'/v1/text-to-speech/{voice_id()}/with-timestamps?output_format={OUTPUT_FORMAT}'
    body = {'text': text, 'model_id': MODEL, 'voice_settings': SETTINGS}
    for attempt in range(3):
        st, b = el_call(path, body)
        if st == 200:
            spend(len(text), what)
            j = json.loads(b)
            return base64.b64decode(j['audio_base64']), j.get('alignment') or j.get('normalized_alignment')
        err = b.decode(errors='replace')[:300]
        if st in (429, 500, 502, 503) and attempt < 2:
            time.sleep(5 * (attempt + 1))
            continue
        raise RuntimeError(f'TTS HTTP {st}: {err}')


def whisper(path, model=WHISPER_MODEL, prompt=None):
    """Transcribe; no prompt by default (a vocabulary prompt would hide mispronunciations)."""
    boundary = uuid.uuid4().hex
    parts = []
    fields = [('model', model), ('language', 'en'), ('response_format', 'json'), ('temperature', '0')]
    if prompt:
        fields.append(('prompt', prompt))
    for k, v in fields:
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{os.path.basename(path)}"\r\n'
                 f'Content-Type: audio/mpeg\r\n\r\n'.encode() + open(path, 'rb').read() + b'\r\n')
    parts.append(f'--{boundary}--\r\n'.encode())
    req = urllib.request.Request(OA_API, data=b''.join(parts), headers={
        'Authorization': 'Bearer ' + read_key('OPENAI_API_KEY'),
        'Content-Type': f'multipart/form-data; boundary={boundary}'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read())['text']
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 2:
                time.sleep(5 * (attempt + 1))
                continue
            raise RuntimeError(f'Whisper HTTP {e.code}: {e.read()[:200]}')


# ---------------------------------------------------------------- text helpers
# Per-line respellings, for a fix one take needs without re-voicing every other line that shares the word.
RESPELL_LINE = {
    # id: [(regex, replacement, why)]
}


def spoken(text, sid=None):
    for pat, rep, _ in RESPELL + RESPELL_LINE.get(sid, []):
        text = re.sub(pat, rep, text)
    return text


def fingerprint(sp):
    blob = json.dumps({'spoken': sp, 'voice': VOICE_NAME, 'model': MODEL, 'settings': SETTINGS,
                       'format': OUTPUT_FORMAT}, sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


NUM = {str(i): w for i, w in enumerate('zero one two three four five six seven eight nine ten eleven twelve'.split())}
SAME = {'kyro': 'cairo', 'kairo': 'cairo', 'kiro': 'cairo', 'okay': 'ok', 'kpis': 'kpeyes'}
JOIN = [('terra nova', 'terranova'), ('board effect', 'boardeffect'), ('power school', 'powerschool'),
        ('vera cross', 'veracross'), ('quick books', 'quickbooks'),
        ('kp eyes', 'kpeyes'), ('k p eyes', 'kpeyes'), ('sage intact', 'sage intacct')]


def norm_tokens(s, respelled=False):
    s = re.sub(r'\b(?:[A-Z] ){1,}[A-Z]\b', lambda m: m.group().replace(' ', ''), s)  # "S I S" -> "SIS"
    s = s.replace('.com', ' dot com').replace('—', ' ').replace('–', ' ').replace('-', ' ')
    s = s.replace('’', "'").lower()
    s = re.sub(r"[^a-z0-9' ]", ' ', s).replace("'", '')
    s = ' '.join(s.split())
    for a, b in JOIN:
        s = re.sub(r'\b' + a + r'\b', b, s)
    toks = [NUM.get(t, t) for t in s.split()]
    return [SAME.get(t, t) for t in toks]


def missed(a, b):
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    return {i for op, i1, i2, _, _ in sm.get_opcodes() if op != 'equal' for i in range(i1, i2)}


def suspects(script, h1, h2):
    a = norm_tokens(script)
    both = missed(a, norm_tokens(h1)) & missed(a, norm_tokens(h2))
    return [a[i] for i in sorted(both)]


def diff(script, heard):
    a, b = norm_tokens(script), norm_tokens(heard)
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    ops = [{'op': op, 'script': ' '.join(a[i1:i2]), 'heard': ' '.join(b[j1:j2])}
           for op, i1, i2, j1, j2 in sm.get_opcodes() if op != 'equal']
    return round(sm.ratio(), 3), ops


# ---------------------------------------------------------------- audio helpers
def probe_duration(path):
    r = subprocess.run([FFPROBE, '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                       capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def audio_sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()[:16]


def mp3_tag(path):
    r = subprocess.run([FFPROBE, '-v', 'quiet', '-show_entries', 'format_tags=comment', '-of', 'csv=p=0', path],
                       capture_output=True, text=True)
    return r.stdout.strip()


def stamp(raw, dest, fp):
    tmp = dest + '.raw.mp3'
    with open(tmp, 'wb') as fh:
        fh.write(raw)
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-i', tmp, '-c', 'copy', '-metadata', f'comment=kyro-vo-v4:{fp}',
                    '-id3v2_version', '3', dest], check=True)
    os.remove(tmp)


def words_from_alignment(al):
    words, cur = [], None
    for c, s, e in zip(al['characters'], al['character_start_times_seconds'], al['character_end_times_seconds']):
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


# ---------------------------------------------------------------- lint
LINT = [
    (r'\bKYRO\b', 'KYRO must be voiced as "Cairo"'),
    (r'\bK ?P ?Is?\b|\bKPIs?\b', 'KPI must be "key numbers" or "K P Eyes"'),
    (r'\d', 'digit in VO (no spoken figures; spell product facts in words)'),
    (r'\$|%|percent|dollars?\b|million|thousand', 'spoken figure / money'),
    (r'\b(?!FACTS\b|FERPA\b|COPPA\b|CASI\b|NIPSA\b)[A-Z]{2,}\b', 'unspaced acronym (letter-space it, or add to the word-acronym list)'),
    (r'\bcompliant\b|\bcompliance\b', 'privacy: never "compliant" (approved wording only)'),
    (r'\b(he|she|him|her|his|hers)\b', 'gendered pronoun'),
]
COMPETITORS = ['Blackbaud', 'FACTS', 'Veracross', 'PowerSchool', 'Sage', 'BoardEffect']
HEDGES = re.compile(r'\b(may|maybe|might|possibly|perhaps|can)\b', re.I)
PRIVACY_OK = ['Built to FERPA standards', 'FERPA-aligned by contract',
              'No student-facing surfaces, so COPPA does not apply']


def lint(lines):
    issues = 0
    for ln in lines:
        t = ln['text']
        if not t:
            continue
        for pat, why in LINT:
            for m in re.finditer(pat, t):
                print(f'  LINT {ln["id"]}: "{m.group()}" — {why}')
                issues += 1
        for sent in re.split(r'(?<=[.?!])\s+', t):
            if any(c in sent for c in COMPETITORS) and not HEDGES.search(sent):
                print(f'  LINT {ln["id"]}: competitor named without a hedge: "{sent}"')
                issues += 1
        if re.search(r'FERPA|COPPA', t):
            for p in PRIVACY_OK:
                if p not in t:
                    print(f'  LINT {ln["id"]}: privacy line missing approved phrase "{p}"')
                    issues += 1
    return issues


# ---------------------------------------------------------------- commands
def load_lines():
    return json.load(open(LINES))['lines']


def sidecar(sid):
    p = os.path.join(OUT, sid + '.json')
    return json.load(open(p)) if os.path.exists(p) else None


def is_current(ln):
    mp3 = os.path.join(OUT, ln['id'] + '.mp3')
    fp = fingerprint(spoken(ln['text'], ln['id']))
    sc = sidecar(ln['id'])
    return os.path.exists(mp3) and sc and sc.get('fingerprint') == fp and mp3_tag(mp3).endswith(fp)


def render_one(ln, force=False):
    sid, text = ln['id'], ln['text']
    sp = spoken(text, sid)
    fp = fingerprint(sp)
    mp3 = os.path.join(OUT, sid + '.mp3')
    if not force and is_current(ln):
        print(f'  skip {sid} (fingerprint {fp} current)')
        return False
    if os.path.exists(mp3):           # keep the previous take for comparison
        n = 1
        while os.path.exists(os.path.join(OUT, f'{sid}.take{n}.mp3')):
            n += 1
        os.rename(mp3, os.path.join(OUT, f'{sid}.take{n}.mp3'))
    audio, al = tts(sp, sid)
    stamp(audio, mp3, fp)
    dur = probe_duration(mp3)
    json.dump({'id': sid, 'text': text, 'spoken': sp, 'fingerprint': fp, 'audio_sha': audio_sha(mp3),
               'voice': VOICE_NAME, 'model': MODEL,
               'settings': SETTINGS, 'duration': round(dur, 3), 'alignment': al,
               'words': words_from_alignment(al) if al else None},
              open(os.path.join(OUT, sid + '.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'  {sid}: {dur:.1f}s  ({len(sp)} chars, fp {fp})')
    return True


def cmd_render(ids, force=False):
    lines = [l for l in load_lines() if l['text'] and (not ids or l['id'] in ids)]
    todo = [l for l in lines if force or not is_current(l)]
    need = sum(len(spoken(l['text'], l['id'])) for l in todo)
    lg = ledger()
    print(f'{len(todo)} lines to voice, {need} chars; ledger spent {lg["spent"]}/{BUDGET}')
    guard(need)
    rem = quota('before')
    if rem is not None and rem < need:
        sys.exit(f'account quota {rem} < needed {need}; stopping')
    for l in todo:
        render_one(l, force=force)
    quota('after')


def cmd_check(ids):
    flagged = []
    for l in load_lines():
        if not l['text'] or (ids and l['id'] not in ids):
            continue
        mp3 = os.path.join(OUT, l['id'] + '.mp3')
        sc = sidecar(l['id'])
        if not sc or not os.path.exists(mp3):
            print(f'  {l["id"]}: not rendered')
            continue
        if not (sc.get('whisper') and sc['whisper'].get('audio_sha') == audio_sha(mp3)):
            sp = sc['spoken']
            heard = whisper(mp3)
            ratio, ops = diff(sp, heard)
            w = {'model': WHISPER_MODEL, 'fingerprint': sc['fingerprint'], 'audio_sha': audio_sha(mp3), 'transcript': heard,
                 'ratio': ratio, 'diff': ops, 'suspect': []}
            if ops:
                heard2 = whisper(mp3, model=SECOND_OPINION)
                r2, ops2 = diff(sp, heard2)
                w['second'] = {'model': SECOND_OPINION, 'transcript': heard2, 'ratio': r2, 'diff': ops2}
                w['suspect'] = suspects(sp, heard, heard2)
            sc['whisper'] = w
            json.dump(sc, open(os.path.join(OUT, l['id'] + '.json'), 'w'), indent=1, ensure_ascii=False)
        w = sc['whisper']
        mark = 'ok  ' if not w['diff'] else ('SUSP' if w['suspect'] else 'diff')
        print(f'  {mark} {l["id"]:<15} ratio {w["ratio"]:.3f}')
        for o in w['diff']:
            print(f'        whisper {o["op"]:<8} script="{o["script"]}"  heard="{o["heard"]}"')
        for o in (w.get('second') or {}).get('diff', []):
            print(f'        4o      {o["op"]:<8} script="{o["script"]}"  heard="{o["heard"]}"')
        if w['suspect']:
            acc = ACCEPTED.get(l['id'], ([], ''))
            left = [t for t in w['suspect'] if t not in acc[0]]
            print(f'        SUSPECT (both missed): {w["suspect"]}' + (f'  ACCEPTED: {acc[1]}' if not left else ''))
            if left:
                flagged.append(l['id'])
    print('flagged:', flagged or 'none')


def cmd_probe(rnd):
    d = os.path.join(OUT, '_probe')
    os.makedirs(d, exist_ok=True)
    text = PROBE_TEXT[rnd]
    mp3 = os.path.join(d, f'round{rnd}.mp3')
    if not os.path.exists(mp3):
        print(f'probe round {rnd}: {len(text)} chars')
        audio, al = tts(text, f'probe{rnd}')
        stamp(audio, mp3, fingerprint(text))
        json.dump({'text': text, 'words': words_from_alignment(al) if al else None},
                  open(mp3[:-4] + '.json', 'w'), indent=1)
    heard = whisper(mp3)
    ratio, ops = diff(text, heard)
    print('SECOND:', whisper(mp3, model=SECOND_OPINION))
    print('SCRIPT:', text)
    print('HEARD: ', heard)
    print('ratio', ratio)
    for o in ops:
        print(f'  {o["op"]:<8} script="{o["script"]}"  heard="{o["heard"]}"')


def cmd_report():
    lines = load_lines()
    total_vo, total_film, total_sb = 0.0, 0.0, 0.0
    print(f'{"scene":<16}{"chars":>6}{"vo s":>7}{"scene s":>9}{"storyb s":>10}{"delta":>7}')
    for l in lines:
        sb = l['storyboardSec']
        if not l['text']:
            film = sb
            vo = 0.0
            chars = 0
        else:
            sc = sidecar(l['id'])
            vo = sc['duration'] if sc else float('nan')
            chars = len(spoken(l['text'], l['id']))
            film = max(l['minSec'], vo + PAD)   # storyboard rule, with the MEASURED narration
        total_vo += vo
        total_film += film
        total_sb += sb
        print(f'{l["id"]:<16}{chars:>6}{vo:>7.1f}{film:>9.1f}{sb:>10.1f}{film - sb:>+7.1f}')
    n = len(lines)
    xf = XFADE * (n - 1)
    print(f'narration total {total_vo:.1f}s; film (all {n} scenes incl. f10) {total_film - xf:.1f}s = '
          f'{(total_film - xf) / 60:.2f} min (storyboard rule, same scenes: {total_sb - xf:.1f}s)')
    f10 = next((l for l in lines if l['id'] == 'f10_readiness'), None)
    if f10 and sidecar('f10_readiness'):
        cut = max(f10['minSec'], sidecar('f10_readiness')['duration'] + PAD) + XFADE
        print(f'without f10: {total_film - xf - cut:.1f}s')
    print('ledger:', ledger()['spent'], '/', BUDGET)


def main():
    os.makedirs(OUT, exist_ok=True)
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'render'
    args = sys.argv[2:]
    if cmd == 'lint':
        n = lint(load_lines())
        print(f'{n} lint issue(s)')
        if RESPELL:
            print('respellings:', [(p, r) for p, r, _ in RESPELL], 'per-line:', {k: [(p, r) for p, r, _ in v] for k, v in RESPELL_LINE.items()})
    elif cmd == 'probe':
        cmd_probe(int(args[0]) if args else 1)
    elif cmd == 'render':
        cmd_render(args)
    elif cmd == 'retake':
        cmd_render(args, force=True)
    elif cmd == 'check':
        cmd_check(args)
    elif cmd == 'report':
        cmd_report()
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main()

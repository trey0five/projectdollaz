#!/bin/bash
# Renders one mp3 per scene from scenes.json via ElevenLabs. Key is read from
# village-finder's .env and never echoed.
set -e
KEY=$(grep '^ELEVENLABS_API_KEY=' /home/dream/village-finder/.env | cut -d= -f2- | tr -d '"' | tr -d "'")
VOICE="nPczCjzIvOs9aTzGdKmn"   # placeholder; overridden below by full id lookup
cd "$(dirname "$0")"
python3 - <<'PY'
import json, os, subprocess, urllib.request
key = None
with open('/home/dream/village-finder/.env') as f:
    for line in f:
        if line.startswith('ELEVENLABS_API_KEY='):
            key = line.split('=',1)[1].strip().strip('"\'')
assert key
# resolve Brian's full voice id
req = urllib.request.Request('https://api.elevenlabs.io/v1/voices', headers={'xi-api-key': key})
voices = json.load(urllib.request.urlopen(req))['voices']
voice = next(v['voice_id'] for v in voices if v['name'].startswith('Bella'))
scenes = json.load(open('scenes.json'))['scenes']
os.makedirs('vo', exist_ok=True)
for s in scenes:
    out = f"vo/{s['id']}.mp3"
    if os.path.exists(out):
        continue  # only render missing lines (quota-friendly)
    body = json.dumps({
        'text': s['vo'],
        'model_id': 'eleven_multilingual_v2',
        'voice_settings': {'stability': 0.45, 'similarity_boost': 0.75, 'style': 0.45},
    }).encode()
    r = urllib.request.Request(
        f'https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128',
        data=body, headers={'xi-api-key': key, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(r) as resp, open(out, 'wb') as fh:
        fh.write(resp.read())
    dur = subprocess.run([os.path.expanduser('~/bin/ffprobe'),'-v','quiet','-show_entries','format=duration','-of','csv=p=0',out],capture_output=True,text=True).stdout.strip()
    print(s['id'], f'{float(dur):.1f}s')
PY

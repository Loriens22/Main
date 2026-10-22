"""Offline Bulgarian announcement clips for the single-file build.

The game speaks with the device's Bulgarian voice when it has one. For a
consistent female voice on every device (and fully offline), generate the
clips once with a licensed neural TTS voice, or record them with a human
speaker, and embed them into src/data/voice-clips.json. The next
`node build.mjs` then inlines them into the single HTML file.

The message texts must match AnnouncementManager.js exactly:
    "Следваща спирка <speech>."
    "Спирка <speech>."                      (+ " Последна спирка." at terminals)

usage:
  python3 tools/generate_announcements.py list
      print every message the game can play (one per line)
  python3 tools/generate_announcements.py azure  [--voice bg-BG-KalinaNeural]
      needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION
  python3 tools/generate_announcements.py google [--voice bg-BG-Standard-A]
      needs GOOGLE_TTS_API_KEY (Cloud Text-to-Speech API key)
  python3 tools/generate_announcements.py pack <dir>
      embed existing recordings: <dir>/manifest.csv with lines
      "<file.mp3>;<exact message text>" (e.g. human voice recordings)

Generated audio goes to assets/voice/ (mp3, 24 kHz mono) and is embedded as
base64 data URLs. Check the TTS provider's licence terms before
redistributing the generated audio.
"""
import base64, csv, hashlib, json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTE = os.path.join(ROOT, 'src', 'data', 'route280.json')
OUT_JSON = os.path.join(ROOT, 'src', 'data', 'voice-clips.json')
OUT_DIR = os.path.join(ROOT, 'assets', 'voice')
TERMINAL_SUFFIX = 'Последна спирка.'


def messages():
    route = json.load(open(ROUTE, encoding='utf-8'))
    out = []
    for d in route['directions'].values():
        stops = d['stops']
        for i, st in enumerate(stops):
            speech = st.get('speech') or st['name']
            if i > 0:
                out.append(f'Следваща спирка {speech}.')
                t = f'Спирка {speech}.'
                if i == len(stops) - 1:
                    t += ' ' + TERMINAL_SUFFIX
                out.append(t)
    return list(dict.fromkeys(out))


def ssml(text, voice, rate='-4%'):
    return ('<speak version="1.0" xml:lang="bg-BG" xmlns="http://www.w3.org/2001/10/synthesis">'
            f'<voice name="{voice}"><prosody rate="{rate}">{text}</prosody></voice></speak>')


def tts_azure(text, voice):
    key, region = os.environ['AZURE_SPEECH_KEY'], os.environ['AZURE_SPEECH_REGION']
    req = urllib.request.Request(
        f'https://{region}.tts.speech.microsoft.com/cognitiveservices/v1',
        data=ssml(text, voice).encode('utf-8'),
        headers={'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml',
                 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'sofia-bus-280'})
    return urllib.request.urlopen(req, timeout=60).read()


def tts_google(text, voice):
    key = os.environ['GOOGLE_TTS_API_KEY']
    body = {'input': {'text': text}, 'voice': {'languageCode': 'bg-BG', 'name': voice, 'ssmlGender': 'FEMALE'},
            'audioConfig': {'audioEncoding': 'MP3', 'sampleRateHertz': 24000, 'speakingRate': 0.96}}
    req = urllib.request.Request(f'https://texttospeech.googleapis.com/v1/text:synthesize?key={key}',
                                 data=json.dumps(body).encode('utf-8'), headers={'Content-Type': 'application/json'})
    return base64.b64decode(json.load(urllib.request.urlopen(req, timeout=60))['audioContent'])


def write_json(clips):
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(clips, f, ensure_ascii=False, indent=0)
    size = os.path.getsize(OUT_JSON) / 1024
    print(f'wrote {OUT_JSON}: {len(clips)} clips, {size:.0f} KiB', file=sys.stderr)


def data_url(mp3):
    return 'data:audio/mpeg;base64,' + base64.b64encode(mp3).decode('ascii')


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ('list', 'azure', 'google', 'pack'):
        print(__doc__)
        sys.exit(1)
    cmd = sys.argv[1]
    msgs = messages()
    if cmd == 'list':
        print('\n'.join(msgs))
        return
    if cmd == 'pack':
        folder = sys.argv[2]
        clips = {}
        with open(os.path.join(folder, 'manifest.csv'), encoding='utf-8') as f:
            for row in csv.reader(f, delimiter=';'):
                if len(row) < 2 or row[0].startswith('#'):
                    continue
                if row[1] not in msgs:
                    print(f'warning: "{row[1]}" is not a message the game plays', file=sys.stderr)
                clips[row[1]] = data_url(open(os.path.join(folder, row[0]), 'rb').read())
        missing = [m for m in msgs if m not in clips]
        if missing:
            print(f'{len(missing)} messages have no recording and will use the device voice', file=sys.stderr)
        write_json(clips)
        return
    voice = sys.argv[sys.argv.index('--voice') + 1] if '--voice' in sys.argv else \
        ('bg-BG-KalinaNeural' if cmd == 'azure' else 'bg-BG-Standard-A')
    synth = tts_azure if cmd == 'azure' else tts_google
    os.makedirs(OUT_DIR, exist_ok=True)
    clips = {}
    for m in msgs:
        name = hashlib.sha1(f'{voice}|{m}'.encode('utf-8')).hexdigest()[:12] + '.mp3'
        path = os.path.join(OUT_DIR, name)
        if not os.path.exists(path):
            print('TTS:', m, file=sys.stderr)
            open(path, 'wb').write(synth(m, voice))
        clips[m] = data_url(open(path, 'rb').read())
    write_json(clips)


if __name__ == '__main__':
    main()

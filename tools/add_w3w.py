#!/usr/bin/env python3
"""Store a what3words address for every access point, aid station and base in data/course.js.

Usage: python3 tools/add_w3w.py [--all]

Only points without a w3w address are looked up, unless --all is given (use that after moving points).
The API key comes from data/config.js. That key is locked to the live site, so requests send the
site's address as the Referer. If you use a different key, set W3W_KEY and W3W_REFERER as needed.
Stored addresses mean the app can show them offline.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
COURSE = os.path.join(HERE, '..', 'data', 'course.js')
CONFIG = os.path.join(HERE, '..', 'data', 'config.js')
REFERER = os.environ.get('W3W_REFERER', 'https://singletrackevents.github.io/GPT100Safety/')


def key():
    k = os.environ.get('W3W_KEY')
    if k:
        return k
    m = re.search(r"what3wordsKey:\s*'([^']*)'", open(CONFIG, encoding='utf-8').read())
    if not m or not m.group(1):
        sys.exit('No what3words key in data/config.js; set W3W_KEY')
    return m.group(1)


def to_3wa(lat, lon, k):
    url = 'https://api.what3words.com/v3/convert-to-3wa?' + urllib.parse.urlencode(
        {'coordinates': f'{lat},{lon}', 'key': k})
    req = urllib.request.Request(url, headers={'Referer': REFERER, 'User-Agent': 'GPT100Safety'})
    for attempt in range(3):
        try:
            j = json.load(urllib.request.urlopen(req, timeout=30))
            if 'words' in j:
                return j['words']
            sys.exit(f'what3words error: {j}')
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')
            if e.code in (400, 401, 402, 403):
                sys.exit(f'what3words error {e.code}: {body[:200]}')
        except Exception:
            pass
        time.sleep(2 * (attempt + 1))
    sys.exit(f'what3words lookup failed for {lat},{lon}')


def main():
    redo = '--all' in sys.argv
    k = key()
    src = open(COURSE, encoding='utf-8').read()
    m = re.search(r'window\.GPT100_DATA = (\{.*\});', src, re.S)
    data = json.loads(m.group(1))
    n = 0
    for a in data['access']:
        if a.get('w3w') and not redo:
            continue
        a['w3w'] = to_3wa(a['lat'], a['lon'], k); n += 1
        print(f"{a['name'][:40]:<41} ///{a['w3w']}")
        time.sleep(0.3)
    bw = data.setdefault('bases_w3w', {})
    for b, (lon, lat) in data['bases'].items():
        if bw.get(b) and not redo:
            continue
        bw[b] = to_3wa(lat, lon, k); n += 1
        print(f'base {b:<36} ///{bw[b]}')
    open(COURSE, 'w', encoding='utf-8').write(src[:m.start(1)] + json.dumps(data, separators=(',', ':')) + src[m.end(1):])
    print(f'{n} addresses looked up')


if __name__ == '__main__':
    main()

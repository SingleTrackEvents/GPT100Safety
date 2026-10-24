#!/usr/bin/env python3
"""Store a what3words address for every point along the course, so the runner app can show
your three words with no signal (the words of the course point nearest you).

Usage: python3 tools/add_course_w3w.py [--course gpt100|14k ...] [--delay 0.8] [--all]

Writes data/course-w3w.js: one list of words per course, in the same order as that course's
route points. The run can be stopped and restarted; points already looked up are kept and
skipped unless --all is given (use that after the course changes). Progress is saved every 50
points. One request is sent per --delay seconds (default 0.8) so the API is never hurried.
The API key comes from data/config.js and is locked to the live site, so requests send the
site's address as the Referer; set W3W_KEY and W3W_REFERER to use another key.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')
OUT = os.path.join(DATA, 'course-w3w.js')
CONFIG = os.path.join(DATA, 'config.js')
REFERER = os.environ.get('W3W_REFERER', 'https://singletrackevents.github.io/GPT100Safety/')
HEAD = ('// what3words address of every course point, in route order, made by tools/add_course_w3w.py.\n'
        '// The runner app shows the words of the point nearest you when there is no signal.\n'
        'window.GPT100_COURSE_W3W = ')


def key():
    k = os.environ.get('W3W_KEY')
    if k:
        return k
    m = re.search(r"what3wordsKey:\s*'([^']*)'", open(CONFIG, encoding='utf-8').read())
    if not m or not m.group(1):
        sys.exit('No what3words key in data/config.js; set W3W_KEY')
    return m.group(1)


def routes():
    src = open(os.path.join(DATA, 'course.js'), encoding='utf-8').read()
    main = json.loads(re.search(r'window\.GPT100_DATA = (\{.*\});', src, re.S).group(1))
    out = {'gpt100': main['route']}
    src = open(os.path.join(DATA, 'courses.js'), encoding='utf-8').read()
    for c in json.loads(re.search(r'window\.GPT100_COURSES = (\[.*\]);', src, re.S).group(1)):
        out[c['id']] = c['route']
    return out


def to_3wa(lat, lon, k):
    url = 'https://api.what3words.com/v3/convert-to-3wa?' + urllib.parse.urlencode(
        {'coordinates': f'{lat},{lon}', 'key': k})
    req = urllib.request.Request(url, headers={'Referer': REFERER, 'User-Agent': 'GPT100Safety'})
    for attempt in range(4):
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
        time.sleep(5 * (attempt + 1))
    return None


def load():
    if not os.path.exists(OUT):
        return {}
    src = open(OUT, encoding='utf-8').read()
    return json.loads(re.search(r'window\.GPT100_COURSE_W3W = (\{.*\});', src, re.S).group(1))


def save(store):
    tmp = OUT + '.tmp'
    open(tmp, 'w', encoding='utf-8').write(HEAD + json.dumps(store, separators=(',', ':')) + ';\n')
    os.replace(tmp, OUT)


def main():
    args = sys.argv[1:]
    redo = '--all' in args
    delay = float(args[args.index('--delay') + 1]) if '--delay' in args else 0.8
    want = [args[i + 1] for i, a in enumerate(args) if a == '--course'] or None
    k = key()
    store = load()
    for cid, route in routes().items():
        if want and cid not in want:
            continue
        words = store.get(cid) or []
        if redo or len(words) != len(route):
            words = [None] * len(route) if redo else (words + [None] * len(route))[:len(route)]
        store[cid] = words
        todo = [i for i, w in enumerate(words) if not w]
        print(f'{cid}: {len(route)} points, {len(todo)} to look up', flush=True)
        failed = 0
        for n, i in enumerate(todo, 1):
            t0 = time.time()
            lat, lon = route[i][0], route[i][1]
            w = to_3wa(lat, lon, k)
            if w:
                words[i] = w
            else:
                failed += 1
                print(f'  point {i} ({lat},{lon}) failed; run again later', flush=True)
            if n % 50 == 0 or n == len(todo):
                save(store)
                print(f'  {n}/{len(todo)} done ({route[i][2]} km)', flush=True)
            time.sleep(max(0.0, delay - (time.time() - t0)))
        if failed:
            print(f'{cid}: {failed} points still missing', flush=True)
    save(store)
    total = sum(len([w for w in v if w]) for v in store.values())
    print(f'{total} course points have a what3words address in data/course-w3w.js')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Apply checked drive routes to data/course.js.

Usage: python3 tools/apply_drive_routes.py ROUTES.json DECISIONS.json

ROUTES.json is the output of drive_routes.py. DECISIONS.json says what to use for each access point and base:

  {"Longpoint West (GATED ACCESS)": {"hg": "valhalla", "jc": "valhalla", "dk": "keep"},
   "Mt Zero (Start)": {"*": "valhalla"},
   "Some point": {"hg": {"minutes": 45}}}

- "valhalla": use Valhalla's drive time and route line
- "route": use Valhalla's route line but keep the existing drive time
- "keep": leave the existing drive time and line alone
- {"minutes": N}: set the drive time by hand and keep Valhalla's route line
"*" applies to every base not listed. Access points not listed are left alone.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
COURSE = os.path.join(HERE, '..', 'data', 'course.js')


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    routes = json.load(open(sys.argv[1]))
    decisions = json.load(open(sys.argv[2]))
    src = open(COURSE, encoding='utf-8').read()
    m = re.search(r'window\.GPT100_DATA = (\{.*\});', src, re.S)
    data = json.loads(m.group(1))
    by_name = {}
    for key, r in routes.items():
        by_name.setdefault(r['name'], []).append(r)
    changed = 0
    for a in data['access']:
        dec = decisions.get(a['name'])
        if not dec:
            continue
        r = next((x for x in by_name.get(a['name'], []) if abs(x['lat'] - a['lat']) < 1e-6 and abs(x['lon'] - a['lon']) < 1e-6), None)
        if not r:
            print('  no route data for', a['name']); continue
        for k in data['bases']:
            d = dec.get(k, dec.get('*', 'keep'))
            v = r['bases'].get(k, {}).get('valhalla', {})
            if d == 'keep' or 'error' in v:
                continue
            if isinstance(d, dict) and 'minutes' in d:
                a[f'drive_{k}_s'] = int(round(d['minutes'] * 60))
            elif d == 'valhalla':
                a[f'drive_{k}_s'] = v['time_s']
            elif d != 'route':
                print('  unknown decision', d, 'for', a['name'], k); continue
            if v.get('geom') and len(v['geom']) > 1:
                a.setdefault('drive_geoms', {})[k] = v['geom']
            a.setdefault('drive_src', {})[k] = d if isinstance(d, str) else 'manual'
            changed += 1
    open(COURSE, 'w', encoding='utf-8').write(src[:m.start(1)] + json.dumps(data, separators=(',', ':')) + src[m.end(1):])
    print(f'applied {changed} base routes')


if __name__ == '__main__':
    main()

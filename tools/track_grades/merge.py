#!/usr/bin/env python3
"""Merge the per-map extractions into data/track-grades.js for the app, and print a summary.
Usage: merge.py <out dir> <data/course.js> <data/track-grades.js or x for a dry run>"""
import json, sys, os, glob, math
import numpy as np
from pyproj import Transformer

OUT = sys.argv[1]; COURSE_JS = sys.argv[2]; DEST = sys.argv[3]
to_utm = Transformer.from_crs('EPSG:4326', 'EPSG:28354', always_xy=True)
s = open(COURSE_JS).read(); s = s[s.index('{'):s.rindex('}') + 1]
D = json.loads(s); route = D['route']; N = len(route)
rE, rN = to_utm.transform([p[1] for p in route], [p[0] for p in route]); rEN = np.stack([rE, rN], 1)
kms = np.array([p[2] for p in route])

MAPS = {}
for f in sorted(glob.glob(os.path.join(OUT, '*.json'))):
    if os.path.basename(f) != 'merged.json': MAPS[os.path.basename(f)[:-5]] = json.load(open(f))

# Per route point: best track grade (nearest within 30 m across maps), else road grade within 30 m
best_t = [None] * N; best_r = [None] * N; src = [None] * N
kidx = {round(p[2], 3): i for i, p in enumerate(route)}
for name, o in MAPS.items():
    for q in o['points']:
        i = kidx[round(q['km'], 3)]
        if 'track' in q and q['track_m'] <= 30 and (best_t[i] is None or q['track_m'] < best_t[i][1]): best_t[i] = (q['track'], q['track_m'], name)
        if 'road' in q and q['road_m'] <= 30 and (best_r[i] is None or q['road_m'] < best_r[i][1]): best_r[i] = (q['road'], q['road_m'], name)
grade = []
for i in range(N):
    if best_t[i]: grade.append(best_t[i][0])
    elif best_r[i]: grade.append('road:' + best_r[i][0])
    else: grade.append(None)

# Fill gaps shorter than 150 m with the neighbour grade, and merge runs shorter than 60 m into the previous run
def runs(g):
    out = []
    for i, v in enumerate(g):
        if out and out[-1][2] == v: out[-1][1] = i
        else: out.append([i, i, v])
    return out
R = runs(grade)
for k, (a, b, v) in enumerate(R):
    if v is None and 0 < k < len(R) - 1 and kms[b] - kms[a] < 0.15 and R[k - 1][2] == R[k + 1][2]:
        for i in range(a, b + 1): grade[i] = R[k - 1][2]
R = runs(grade)
changed = True
while changed:
    changed = False
    for k, (a, b, v) in enumerate(R):
        if 0 < k and kms[b] - kms[a] < 0.06 and v is not None and b < N - 1:
            for i in range(a, b + 1): grade[i] = R[k - 1][2]
            R = runs(grade); changed = True; break
R = runs(grade)
segs = [[round(float(kms[a]), 2), round(float(kms[min(b + 1, N - 1)]), 2), v] for a, b, v in R]

# Access points: road grade
acc = {}
for name, o in MAPS.items():
    for a in o['access']:
        key = f"{a['name']}|{a['trail_km']}"
        if 'road' in a and (key not in acc or a['road_m'] < acc[key][1]): acc[key] = (a['road'], a['road_m'])

# Points of interest, de-duplicated across overlapping maps (same kind within 60 m)
pts = []
for name, o in MAPS.items():
    for m in o['markers']:
        E, Nn = to_utm.transform(m['lon'], m['lat'])
        d = np.hypot(rEN[:, 0] - E, rEN[:, 1] - Nn); i = int(d.argmin())
        rec = {'kind': m['kind'], 'lat': m['lat'], 'lon': m['lon'], 'km': round(float(kms[i]), 2), 'off_m': int(round(d[i])), 'map': name}
        if m.get('code'): rec['code'] = m['code']
        if m.get('name'): rec['name'] = m['name']
        dup = next((p for p in pts if p['kind'] == rec['kind'] and math.hypot(*(np.array(to_utm.transform(p['lon'], p['lat'])) - [E, Nn])) < 60), None)
        if dup:
            if rec.get('code') and not dup.get('code'): dup['code'] = rec['code']
            continue
        pts.append(rec)
pts.sort(key=lambda p: p['km'])

json.dump({'segments': segs, 'access': {k: v[0] for k, v in acc.items()}, 'points': pts}, open(os.path.join(OUT, 'merged.json'), 'w'), indent=1)
# Summary
tot = {}
for a, b, v in segs: tot[v] = tot.get(v, 0) + (b - a)
print('km by grade:', {k: round(v, 1) for k, v in tot.items()})
print('segments:', len(segs))
for a, b, v in segs: print(f'  {a:7.2f} to {b:7.2f}  {v}')
print('access road grades:'); [print('  ', k, v) for k, v in acc.items()]
print('points:'); [print('  ', p) for p in pts]

# ---- Hand fixes (from the visual check) and the app data file ----
FIX = json.load(open(os.path.join(os.path.dirname(__file__), 'fixes.json'))) if os.path.exists(os.path.join(os.path.dirname(__file__), 'fixes.json')) else {}
for p in pts:
    k = f"{p['kind']}@{p['km']}"
    if k in FIX.get('points', {}):
        f = FIX['points'][k]
        if f is None: p['drop'] = True
        else: p.update(f)
pts = [p for p in pts if not p.get('drop')]
for p in FIX.get('add_points', []): pts.append(p)
pts.sort(key=lambda p: p['km'])
for a, b, v in FIX.get('segments', []):  # override a km range
    segs = [s for s in segs if not (s[0] >= a and s[1] <= b)]
    segs = [[s0, min(s1, a), g] for s0, s1, g in segs if s0 < a] + [[a, b, v]] + [[max(s0, b), s1, g] for s0, s1, g in segs if s1 > b]
    segs.sort()
acc_out = {k: v[0] for k, v in acc.items() if v[1] <= 60}
acc_out.update(FIX.get('access', {}))
acc_out = {k: v for k, v in acc_out.items() if v}
pts_out = []
for p in pts:
    q = {'kind': p['kind'], 'lat': p['lat'], 'lon': p['lon'], 'km': p['km'], 'off_m': p['off_m']}
    for k in ('code', 'name'):
        if p.get(k): q[k] = p[k]
    pts_out.append(q)
js = ('// Track grades and emergency features along the GPT100 course, read from the Parks Victoria\n'
      '// "Walking track and road grades" maps (Grampians National Park, 1 December 2020) and aligned to the course GPX.\n'
      '// segments: [from km, to km, grade] along the GPT100. Grades: easy (mule stretcher), medium (paraguard stretcher),\n'
      '// hard (slow, hand to hand carrying), unassessed, road:sealed, road:unsealed, road:4wd, null (no graded track mapped).\n'
      '// access: road grade at each vehicle access point ("name|trail_km"). points: emergency markers (code to give 000),\n'
      '// helipads, assembly areas, GPT campsites and track hazards, with the nearest course km and how far off the course.\n'
      '// Made by the extraction scripts from the PDFs; do not edit by hand.\n'
      'window.GPT100_TRACK = ' + json.dumps({'source': 'Parks Victoria walking track and road grades maps, 1 Dec 2020', 'segments': segs, 'access': acc_out, 'points': pts_out}, separators=(',', ':')) + ';\n')
if DEST != 'x':
    open(DEST, 'w').write(js); print('wrote', DEST, len(js), 'bytes')

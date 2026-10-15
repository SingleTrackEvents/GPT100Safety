#!/usr/bin/env python3
"""Read the Parks Victoria track grade maps (vector PDFs) and align them with the GPT100 course.

For each PDF: pull the coloured track and road lines, fit the page to the course (UTM 54S) by
cross-correlation then least squares, and record for every course point the nearest graded
track and road. Also georeference the labels and markers (helipads, campsites, access points).
Writes one JSON per map plus a merged file.
"""
import json, re, sys, os, math
import numpy as np
import pdfplumber
from pyproj import Transformer
from scipy.signal import fftconvolve
from scipy.spatial import cKDTree

# Usage: extract_maps.py <pdf dir> <out dir> <data/course.js> [map name ...]
PDF_DIR, OUT_DIR, COURSE_JS = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT_DIR, exist_ok=True)

TRACK = {  # dashed walking tracks
    (1.0, 0.66667, 0.0): 'medium',
    (0.65882, 0.0, 0.0): 'hard',
    (0.81961, 1.0, 0.45098): 'easy',
    (0.69804, 0.69804, 0.69804): 'unassessed',
}
ROAD = {
    (0.9098, 0.7451, 1.0): 'sealed',
    (0.43922, 0.65882, 0.0): 'unsealed',
    (0.0, 0.43922, 1.0): '4wd',
}
def classify(col):
    if not col or len(col) != 3: return None, None
    c = tuple(round(float(x), 5) for x in col)
    for k, v in TRACK.items():
        if all(abs(a - b) < 0.02 for a, b in zip(c, k)): return 'track', v
    for k, v in ROAD.items():
        if all(abs(a - b) < 0.02 for a, b in zip(c, k)): return 'road', v
    return None, None

to_utm = Transformer.from_crs('EPSG:4326', 'EPSG:28354', always_xy=True)
to_ll = Transformer.from_crs('EPSG:28354', 'EPSG:4326', always_xy=True)

# Course
s = open(COURSE_JS).read(); s = s[s.index('{'):s.rindex('}') + 1]
D = json.loads(s)
route = np.array([[p[0], p[1], p[2]] for p in D['route']])
rE, rN = to_utm.transform(route[:, 1], route[:, 0])
rEN = np.stack([rE, rN], 1)
access = D['access']

CELL = 20.0  # m

def densify(pts, step):
    out = []
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / step))
        for i in range(n):
            t = i / n; out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    out.append(tuple(pts[-1]))
    return out

EXPECT = {'mt_zero_barigar': 3, 'halls_gap': 49, 'gar': 15, 'barbican': None, 'werdug_wartook': 38, 'mt_christabel': None,
          'mt_william': 86, 'yarram_gap': 118, 'cassidy_gap': 141, 'mt_abrupt': 150}

def process(path):
    name = os.path.basename(path)[:-4]
    pdf = pdfplumber.open(path); p = pdf.pages[0]
    W, H = p.width, p.height
    # Map frame: the big black rect
    frame = max(p.rects, key=lambda r: (r['x1'] - r['x0']) * (r['bottom'] - r['top']))
    fx0, fy0, fx1, fy1 = frame['x0'], frame['top'], frame['x1'], frame['bottom']
    inframe = lambda x, y: fx0 <= x <= fx1 and fy0 <= y <= fy1

    # Scale bar: short dashed black ticks below the frame at bottom left
    ticks = [c for c in p.lines if c['top'] > fy1 and c['x0'] < 200 and abs(c['x1'] - c['x0']) < 1 and c.get('stroking_color') in [(0, 0, 0), (0.0, 0.0, 0.0), [0, 0, 0]]]
    xs = sorted(round(t['x0'], 2) for t in ticks)
    ptPerKm = (xs[-1] - xs[0]) if len(xs) >= 2 else 89.0
    s0 = 1000.0 / ptPerKm  # m per pt

    # Lines
    segs = []  # (kind, grade, [(x,top)...])
    for cv in p.curves + p.lines:
        kind, grade = classify(cv.get('stroking_color'))
        if not kind: continue
        pts = cv['pts']
        pts = [(float(x), float(y)) for x, y in pts]
        if not any(inframe(x, y) for x, y in pts): continue
        segs.append((kind, grade, pts))
    # Dense page points per segment
    dense = []  # x, y, segidx
    for i, (kind, grade, pts) in enumerate(segs):
        for x, y in densify(pts, 1.0):  # 1pt ~ 11 m
            if inframe(x, y): dense.append((x, y, i))
    dense = np.array(dense)
    kinds = np.array([k for k, g, _ in segs]); grades = np.array([g for k, g, _ in segs])

    # Page -> metres (before translation): xm = x*s, ym = (H-y)*s
    def page_m(x, y, s): return x * s, (H - y) * s

    # Coarse: brute force translation search. Score = course points (near the expected km) that land on a
    # graded track, less a penalty for points inside the frame that land on nothing.
    from scipy.ndimage import distance_transform_edt
    s = s0; C2 = 10.0
    tk = kinds[dense[:, 2].astype(int)] == 'track'
    pm = np.stack(page_m(dense[tk, 0], dense[tk, 1], s), 1)
    gh, gw = int(H * s / C2) + 2, int(W * s / C2) + 2
    pg = np.ones((gh, gw), bool)
    ij = (pm / C2).astype(int); pg[ij[:, 1], ij[:, 0]] = False
    dist = distance_transform_edt(pg) * C2
    near = np.abs(route[:, 2] - EXPECT[name]) < 25 if EXPECT.get(name) is not None else np.ones(len(route), bool)
    rd = np.array(densify([tuple(q) for q in rEN[near]], 15.0))
    fr = np.array([page_m(fx0, fy1, s), page_m(fx1, fy0, s)])  # (E0,N0),(E1,N1) relative
    best = None
    E_lo, E_hi = rd[:, 0].min() - fr[1, 0], rd[:, 0].max() - fr[0, 0]
    N_lo, N_hi = rd[:, 1].min() - fr[1, 1], rd[:, 1].max() - fr[0, 1]
    for step in (100.0, 20.0):
        if best is None:
            cand = [(e, n) for e in np.arange(E_lo, E_hi, step) for n in np.arange(N_lo, N_hi, step)]
        else:
            cand = [(best[1] + de, best[2] + dn) for de in np.arange(-150, 151, step) for dn in np.arange(-150, 151, step)]
        for e, n in cand:
            q = rd - [e, n]
            inside = (q[:, 0] > fr[0, 0] + 50) & (q[:, 0] < fr[1, 0] - 50) & (q[:, 1] > fr[0, 1] + 50) & (q[:, 1] < fr[1, 1] - 50)
            if inside.sum() < 20: continue
            cells = (q[inside] / C2).astype(int)
            dd = dist[cells[:, 1], cells[:, 0]]
            m = (dd < 35).sum()
            score = m - 0.5 * (inside.sum() - m)
            if best is None or score > best[0]: best = (score, e, n, int(m), int(inside.sum()))
    _, tx, ty, m, ins = best
    print(name, 'coarse', m, 'of', ins)
    dense_all = dense; dense = dense[tk]  # refine on tracks only
    # Refine: least squares on nearest neighbours, scale + translation
    for it in range(12):
        P = np.stack(page_m(dense[:, 0], dense[:, 1], s), 1) + [tx, ty]
        tree = cKDTree(P)
        d, j = tree.query(rEN, distance_upper_bound=60 if it < 4 else 35)
        ok = np.isfinite(d)
        if ok.sum() < 50: break
        # rEN[ok] = s*[x, H-y] + [tx, ty]
        xk = dense[ok, 0] if False else dense[j[ok], 0]; yk = H - dense[j[ok], 1]
        A = np.zeros((2 * ok.sum(), 3)); b = np.zeros(2 * ok.sum())
        A[0::2, 0] = xk; A[0::2, 1] = 1; b[0::2] = rEN[ok, 0]
        A[1::2, 0] = yk; A[1::2, 2] = 1; b[1::2] = rEN[ok, 1]
        sol, *_ = np.linalg.lstsq(A, b, rcond=None)
        s, tx, ty = sol
    dense = dense_all
    P = np.stack(page_m(dense[:, 0], dense[:, 1], s), 1) + [tx, ty]
    tree = cKDTree(P[tk])
    d, j = tree.query(rEN, distance_upper_bound=40)
    fit = {'name': name, 'scale_m_per_pt': s, 'tx': tx, 'ty': ty, 'matched_pts': int(np.isfinite(d).sum()), 'median_m': float(np.median(d[np.isfinite(d)])) if np.isfinite(d).any() else None, 'scalebar_m_per_pt': s0}

    def to_latlon(x, y):
        xm, ym = page_m(x, y, s); lon, lat = to_ll.transform(xm + tx, ym + ty); return round(lat, 6), round(lon, 6)
    def frameEN():
        a = page_m(fx0, fy1, s); b = page_m(fx1, fy0, s)
        return (a[0] + tx, a[1] + ty, b[0] + tx, b[1] + ty)
    fE0, fN0, fE1, fN1 = frameEN()
    inmap = (rEN[:, 0] > fE0 + 100) & (rEN[:, 0] < fE1 - 100) & (rEN[:, 1] > fN0 + 100) & (rEN[:, 1] < fN1 - 100)

    # Per route point: nearest track and nearest road
    tmask = kinds[dense[:, 2].astype(int)] == 'track'; rmask = ~tmask
    pts_out = []
    ttree = cKDTree(P[tmask]); rtree = cKDTree(P[rmask]) if rmask.any() else None
    tidx = np.where(tmask)[0]; ridx = np.where(rmask)[0]
    td, tj = ttree.query(rEN, distance_upper_bound=60)
    if rtree: rdd, rj = rtree.query(rEN, distance_upper_bound=60)
    for i in range(len(route)):
        if not inmap[i]: continue
        rec = {'km': float(route[i, 2])}
        if np.isfinite(td[i]): rec['track'] = grades[int(dense[tidx[tj[i]], 2])]; rec['track_m'] = round(float(td[i]), 1)
        if rtree and np.isfinite(rdd[i]): rec['road'] = grades[int(dense[ridx[rj[i]], 2])]; rec['road_m'] = round(float(rdd[i]), 1)
        pts_out.append(rec)

    # Access points: nearest road grade within 150 m, nearest track grade within 60 m
    ap_out = []
    aE, aN = to_utm.transform([a['lon'] for a in access], [a['lat'] for a in access])
    for a, e, n in zip(access, aE, aN):
        if not (fE0 < e < fE1 and fN0 < n < fN1): continue
        rec = {'name': a['name'], 'trail_km': a['trail_km']}
        if rtree:
            dd, jj = rtree.query([e, n], distance_upper_bound=150)
            if np.isfinite(dd): rec['road'] = grades[int(dense[ridx[jj], 2])]; rec['road_m'] = round(float(dd))
        dd, jj = ttree.query([e, n], distance_upper_bound=80)
        if np.isfinite(dd): rec['track'] = grades[int(dense[tidx[jj], 2])]; rec['track_m'] = round(float(dd))
        ap_out.append(rec)

    # Labels
    labels = []
    for w in p.extract_words(extra_attrs=['fontname']):
        if 'ESRI' in w.get('fontname', '') or not inframe(w['x0'], w['top']): continue
        cx, cy = (w['x0'] + w['x1']) / 2, (w['top'] + w['bottom']) / 2
        lat, lon = to_latlon(cx, cy)
        labels.append({'text': w['text'], 'lat': lat, 'lon': lon, 'x': round(cx, 1), 'y': round(cy, 1)})
    # Point markers drawn with ESRI symbol fonts. Legend copies sit below the frame.
    markers = []
    def mcol(ch):
        c = ch.get('non_stroking_color'); return tuple(round(float(x), 2) for x in c) if isinstance(c, (list, tuple)) and len(c) == 3 else None
    for ch in p.chars:
        if 'ESRIDefaultMarker' not in ch['fontname'] or not inframe(ch['x0'], ch['top']): continue
        cx, cy = (ch['x0'] + ch['x1']) / 2, (ch['top'] + ch['bottom']) / 2
        t, c = ch['text'], mcol(ch)
        kind = None
        if t == '#' and c == (0.0, 0.77, 1.0): kind = 'emergency'
        elif t == 'R' and c == (1.0, 1.0, 0.45): kind = 'assembly'
        elif t == '!' and c == (0.64, 1.0, 0.45): kind = 'camp'
        elif t == 'u': kind = 'helipad'
        if not kind: continue
        lat, lon = to_latlon(cx, cy)
        m = {'kind': kind, 'lat': lat, 'lon': lon, 'x': round(cx, 1), 'y': round(cy, 1)}
        markers.append(m)
    # Emergency marker codes: labels one to one with the nearest marker, closest pairs first
    ems = [m for m in markers if m['kind'] == 'emergency']
    ids = [l for l in labels if re.match(r'^R?GNP\d+$', l['text'])]
    pairs = sorted((math.hypot(l['x'] - m['x'], l['y'] - m['y']), i, j) for i, m in enumerate(ems) for j, l in enumerate(ids))
    um, ul = set(), set()
    for d, i, j in pairs:
        if d > 40 or i in um or j in ul: continue
        ems[i]['code'] = ids[j]['text']; um.add(i); ul.add(j)
    # Campsite names: the words around the marker (road names are letter spaced, so skip single letters)
    for m in markers:
        if m['kind'] != 'camp': continue
        ws = [l for l in labels if math.hypot(l['x'] - m['x'], l['y'] - m['y']) < 50 and len(l['text']) > 1 and not re.match(r'^R?GNP', l['text'])]
        ws.sort(key=lambda l: (round(l['y'] / 6), l['x']))
        m['name'] = ' '.join(l['text'] for l in ws)
    # Hazard dots: small filled shapes in red (warning), yellow (one hazard) or green (several), clustered by position
    HZ = {(1.0, 0.0, 0.0): 'warning', (1.0, 1.0, 0.0): 'hazard', (0.0, 1.0, 0.0): 'hazards'}
    dots = []
    for cv in p.curves:
        if not cv.get('fill') or not inframe(cv['x0'], cv['top']) or cv['x1'] - cv['x0'] > 20: continue
        c = cv.get('non_stroking_color'); c = tuple(round(float(x), 2) for x in c) if isinstance(c, (list, tuple)) and len(c) == 3 else None
        if c in HZ: dots.append((HZ[c], (cv['x0'] + cv['x1']) / 2, (cv['top'] + cv['bottom']) / 2))
    used = [False] * len(dots)
    for i, (k, x, y) in enumerate(dots):
        if used[i]: continue
        grp = [j for j, (k2, x2, y2) in enumerate(dots) if not used[j] and k2 == k and math.hypot(x2 - x, y2 - y) < 8]
        for j in grp: used[j] = True
        gx = sum(dots[j][1] for j in grp) / len(grp); gy = sum(dots[j][2] for j in grp) / len(grp)
        lat, lon = to_latlon(gx, gy)
        markers.append({'kind': k, 'lat': lat, 'lon': lon, 'x': round(gx, 1), 'y': round(gy, 1)})
    fills = []
    # Georeferenced track segments (for drawing / QA)
    seg_out = []
    for kind, grade, pts in segs:
        seg_out.append({'kind': kind, 'grade': grade, 'll': [to_latlon(x, y) for x, y in pts[::max(1, len(pts) // 60)]]})
    out = {'fit': fit, 'frame': {'E0': fE0, 'N0': fN0, 'E1': fE1, 'N1': fN1}, 'points': pts_out, 'access': ap_out, 'labels': labels, 'markers': markers, 'segments': seg_out}
    json.dump(out, open(os.path.join(OUT_DIR, name + '.json'), 'w'))
    kmr = [q['km'] for q in pts_out]
    print(f"{name}: scale {s:.2f} m/pt (bar {s0:.2f}), matched {fit['matched_pts']} route pts, median {fit['median_m']} m, course km {min(kmr) if kmr else '-'} to {max(kmr) if kmr else '-'}, in-map pts {len(pts_out)}")
    return out

only = sys.argv[4:]
for f in sorted(os.listdir(PDF_DIR)):
    if f.endswith('.pdf') and (not only or f[:-4] in only): process(os.path.join(PDF_DIR, f))

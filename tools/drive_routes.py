#!/usr/bin/env python3
"""Look up drive routes from each response base to each access point, using open-source routing.

Usage: python3 tools/drive_routes.py OUT.json [--only NAME_SUBSTRING]

For every access point in data/course.js and every base, it asks:
- Valhalla (valhalla1.openstreetmap.de): the route, its time, and the road details along it
  (which roads, gravel or sealed, 4WD tracks, and any gates mapped in OpenStreetMap)
- OSRM (router.project-osrm.org): a second opinion on the drive time

Nothing in data/ is changed. The output JSON is reviewed first, then applied with apply_drive_routes.py.
Results are cached next to OUT.json, so a rerun only fetches what's missing.
"""
import json, math, os, re, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
COURSE = os.path.join(HERE, '..', 'data', 'course.js')
VALHALLA = 'https://valhalla1.openstreetmap.de'
OSRM = 'https://router.project-osrm.org/route/v1/driving/'
PAUSE = 1.1  # seconds between requests, to be polite to the free public servers


def metres(a, b):
    r = math.pi / 180
    x = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(x))


def decode(s, precision=6):
    idx, lat, lng, out, f = 0, 0, 0, [], 10 ** precision
    while idx < len(s):
        for which in (0, 1):
            shift = res = 0
            while True:
                b = ord(s[idx]) - 63; idx += 1
                res |= (b & 0x1f) << shift; shift += 5
                if b < 0x20:
                    break
            d = ~(res >> 1) if res & 1 else res >> 1
            if which == 0: lat += d
            else: lng += d
        out.append([lat / f, lng / f])
    return out


def simplify(pts, tol_m=12):
    """Douglas-Peucker in metres, keeps the shape while cutting points."""
    if len(pts) < 3:
        return pts
    k = math.cos(pts[0][0] * math.pi / 180)
    P = [(p[0] * 111320, p[1] * 111320 * k) for p in pts]
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = P[a]; bx, by = P[b]; dx, dy = bx - ax, by - ay; L = dx * dx + dy * dy
        best, bi = -1, -1
        for i in range(a + 1, b):
            px, py = P[i]
            t = ((px - ax) * dx + (py - ay) * dy) / L if L else 0
            t = max(0, min(1, t))
            d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > best: best, bi = d, i
        if best > tol_m:
            keep[bi] = True; stack += [(a, bi), (bi, b)]
    return [[round(p[0], 5), round(p[1], 5)] for p, k_ in zip(pts, keep) if k_]


def post(url, body):
    req = urllib.request.Request(url, json.dumps(body).encode(), {'Content-Type': 'application/json', 'User-Agent': 'GPT100Safety route check'})
    return json.load(urllib.request.urlopen(req, timeout=90))


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'GPT100Safety route check'})
    return json.load(urllib.request.urlopen(req, timeout=60))


def retry(fn, tries=4):
    for t in range(tries):
        try:
            return fn()
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')[:300]
            if e.code == 400:
                return {'error': body}
            err = f'HTTP {e.code} {body}'
        except Exception as e:  # network hiccup
            err = str(e)
        time.sleep(3 * (t + 1))
    return {'error': err}


def valhalla(base, dest):
    r = retry(lambda: post(VALHALLA + '/route', {
        'locations': [{'lat': base[0], 'lon': base[1]}, {'lat': dest[0], 'lon': dest[1]}],
        'costing': 'auto', 'directions_options': {'units': 'km'}}))
    if 'error' in r or 'trip' not in r:
        return {'error': r.get('error') or str(r)[:300]}
    leg = r['trip']['legs'][0]
    shape = decode(leg['shape'])
    time.sleep(PAUSE)
    ta = retry(lambda: post(VALHALLA + '/trace_attributes', {
        'encoded_polyline': leg['shape'], 'costing': 'auto', 'shape_match': 'edge_walk',
        'filters': {'attributes': ['edge.names', 'edge.use', 'edge.surface', 'edge.unpaved', 'edge.road_class',
                                   'edge.length', 'edge.begin_shape_index', 'edge.end_shape_index', 'node.type'],
                    'action': 'include'}}))
    edges = ta.get('edges', []) if isinstance(ta, dict) else []
    roads, unpaved_km, track_km, gates = [], 0.0, 0.0, []
    for e in edges:
        name = ', '.join(e.get('names') or []) or (e.get('use') == 'track' and 'unnamed track') or 'unnamed road'
        if not roads or roads[-1][0] != name:
            roads.append([name, 0.0, e.get('surface'), e.get('use')])
        roads[-1][1] += e.get('length', 0)
        if e.get('unpaved'): unpaved_km += e.get('length', 0)
        if e.get('use') == 'track': track_km += e.get('length', 0)
        if (e.get('end_node') or {}).get('type') in ('gate', 'bollard', 'sump_buster', 'border_control', 'toll_booth'):
            i = e.get('end_shape_index')
            gates.append({'type': e['end_node']['type'], 'at': shape[i] if i is not None and i < len(shape) else None,
                          'after_road': name})
    return {
        'time_s': round(r['trip']['summary']['time']), 'km': round(r['trip']['summary']['length'], 2),
        'end_gap_m': round(metres(shape[-1], dest)), 'roads': [[n, round(k, 2), s, u] for n, k, s, u in roads],
        'unpaved_km': round(unpaved_km, 2), 'track_km': round(track_km, 2), 'gates': gates,
        'geom': simplify(shape), 'trace_ok': bool(edges)}


def osrm(base, dest):
    r = retry(lambda: get(f'{OSRM}{base[1]},{base[0]};{dest[1]},{dest[0]}?overview=false'))
    if r.get('code') != 'Ok':
        return {'error': str(r)[:200]}
    return {'time_s': round(r['routes'][0]['duration']), 'km': round(r['routes'][0]['distance'] / 1000, 2),
            'snap_m': round(r['waypoints'][1]['distance'])}


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out_path = sys.argv[1]
    only = sys.argv[3] if len(sys.argv) > 3 and sys.argv[2] == '--only' else None
    src = open(COURSE, encoding='utf-8').read()
    data = json.loads(re.search(r'window\.GPT100_DATA = (\{.*\});', src, re.S).group(1))
    bases = {k: (v[1], v[0]) for k, v in data['bases'].items()}
    cache = json.load(open(out_path)) if os.path.exists(out_path) else {}
    for a in data['access']:
        if only and only.lower() not in a['name'].lower():
            continue
        key = f"{a['name']}|{a['lat']}|{a['lon']}"
        rec = cache.setdefault(key, {'name': a['name'], 'lat': a['lat'], 'lon': a['lon'], 'trail_km': a['trail_km'],
                                     'gated': bool(a.get('gated')) or 'GATED' in a['name'].upper(), 'aid': a.get('aid', False),
                                     'existing_s': {k: a.get(f'drive_{k}_s') for k in bases}, 'bases': {}})
        rec['trail_km'] = a['trail_km']
        for k, b in bases.items():
            if k in rec['bases'] and 'error' not in rec['bases'][k].get('valhalla', {'error': 1}):
                continue
            if metres(b, (a['lat'], a['lon'])) < 150:
                rec['bases'][k] = {'valhalla': {'time_s': 0, 'km': 0, 'end_gap_m': 0, 'roads': [], 'unpaved_km': 0,
                                                'track_km': 0, 'gates': [], 'geom': [], 'trace_ok': True},
                                   'osrm': {'time_s': 0, 'km': 0, 'snap_m': 0}}
                continue
            v = valhalla(b, (a['lat'], a['lon'])); time.sleep(PAUSE)
            o = osrm(b, (a['lat'], a['lon'])); time.sleep(PAUSE)
            rec['bases'][k] = {'valhalla': v, 'osrm': o}
            print(f"{a['name'][:34]:<35} {k}: valhalla {v.get('time_s', 'ERR')}s osrm {o.get('time_s', 'ERR')}s "
                  f"gates {len(v.get('gates', []))} track {v.get('track_km', '-')} km gap {v.get('end_gap_m', '-')} m", flush=True)
            json.dump(cache, open(out_path, 'w'))
    json.dump(cache, open(out_path, 'w'))
    print('done', len(cache), 'access points')


if __name__ == '__main__':
    main()

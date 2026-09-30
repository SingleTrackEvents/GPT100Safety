#!/usr/bin/env python3
"""Add or update an extra course (e.g. the 14k) from a GPX.

Usage: python3 tools/add_course.py path/to/course.gpx ID "Name" "Label for the course picker" ["Note"]
Example: python3 tools/add_course.py GPT14k.gpx 14k GPT14k "14k and 6k" "The 6k runs on part of this course."

Writes data/courses.js. The route, km and elevation come from the GPX track. Every GPX waypoint
(aid station, water point, checkpoint) becomes a stop that splits the run sheet, plus the start and
finish. Stops get a what3words address. Access points and drive routes are shared with the main
course. For each access point near the course, the real walk to the course is worked out along
OpenStreetMap paths, tracks and streets (one join per pass of the course).
"""
import heapq, json, math, os, re, sys, urllib.request
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from update_course import load_gpx, metres  # noqa: E402
from add_w3w import key as w3w_key, to_3wa  # noqa: E402

OUT = os.path.join(HERE, '..', 'data', 'courses.js')
COURSE = os.path.join(HERE, '..', 'data', 'course.js')


def add_access_heights():
    """Store each access point's ground height (Valhalla elevation service), so walks from a car park
    to a course with no mapped track can still count the climb."""
    src = open(COURSE, encoding='utf-8').read()
    m = re.search(r'window\.GPT100_DATA = (\{.*\});', src, re.S)
    data = json.loads(m.group(1))
    need = [a for a in data['access'] if a.get('ele') is None]
    if not need:
        return
    body = json.dumps({'shape': [{'lat': a['lat'], 'lon': a['lon']} for a in need], 'range': False}).encode()
    req = urllib.request.Request('https://valhalla1.openstreetmap.de/height', body, {'Content-Type': 'application/json', 'User-Agent': 'GPT100Safety'})
    heights = json.load(urllib.request.urlopen(req, timeout=60))['height']
    for a, h in zip(need, heights):
        if h is not None:
            a['ele'] = h
    open(COURSE, 'w', encoding='utf-8').write(src[:m.start(1)] + json.dumps(data, separators=(',', ':')) + src[m.end(1):])
    print(f'Stored ground height for {len(need)} access points')


WALKABLE_SKIP = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'construction', 'proposed', 'raceway'}
JOIN_MAX_WALK = 2500  # metres of walking from a car park to the course
NEAR_COURSE = 30      # a path node this close to the course counts as joining it


def simplify(pts, tol=5):
    sys.path.insert(0, HERE)
    from drive_routes import simplify as s  # noqa: E402
    return s(pts, tol)


def walking_joins(route, access):
    """Real walks from each access point to the course along OpenStreetMap paths, tracks and streets.
    Returns {"name|lat|lon": [{idx, conn_m, conn_ascent, geom}]}, one join per pass of the course."""
    la = [p[0] for p in route]; lo = [p[1] for p in route]; pad = 0.015
    bbox = (min(lo) - pad, min(la) - pad, max(lo) + pad, max(la) + pad)
    url = 'https://api.openstreetmap.org/api/0.6/map?bbox=%.5f,%.5f,%.5f,%.5f' % bbox
    root = ET.fromstring(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'GPT100Safety'}), timeout=120).read())
    nodes = {n.get('id'): (float(n.get('lat')), float(n.get('lon'))) for n in root.iter('node')}
    graph = {}
    for w in root.iter('way'):
        tags = {t.get('k'): t.get('v') for t in w.iter('tag')}
        if 'highway' not in tags or tags['highway'] in WALKABLE_SKIP or tags.get('foot') == 'no' or tags.get('access') == 'no' and tags.get('foot') not in ('yes', 'designated'):
            continue
        nds = [x.get('ref') for x in w.iter('nd') if x.get('ref') in nodes]
        for a, b in zip(nds, nds[1:]):
            d = metres(nodes[a], nodes[b])
            graph.setdefault(a, []).append((b, d)); graph.setdefault(b, []).append((a, d))
    ids = list(graph)
    # For each course point, the path nodes right on it.
    k = math.cos(math.radians(route[0][0]))
    near = {}
    for n in ids:
        y, x = nodes[n]
        # quick bounding filter, then exact distance
        best = None
        for i, p in enumerate(route):
            if abs(p[0] - y) > 0.0004 or abs(p[1] - x) > 0.0004 / k:
                continue
            d = metres((y, x), p)
            if d <= NEAR_COURSE and (best is None or d < best[1]):
                best = (i, d)
        if best:
            near[n] = best
    out = {}
    for a in access:
        start = (a['lat'], a['lon'])
        if min(metres(start, p) for p in route) > JOIN_MAX_WALK:
            continue
        s0 = min(ids, key=lambda n: metres(nodes[n], start))
        gap = metres(nodes[s0], start)
        if gap > 150:
            continue  # the car park isn't on the mapped path network
        dist, prev, q = {s0: gap}, {}, [(gap, s0)]
        while q:
            d, n = heapq.heappop(q)
            if d > dist.get(n, 1e18) or d > JOIN_MAX_WALK:
                continue
            for m, w in graph.get(n, []):
                if d + w < dist.get(m, 1e18):
                    dist[m] = d + w; prev[m] = n; heapq.heappush(q, (d + w, m))
        # cheapest walk to each course point, then one join per pass (the cheapest within 0.5 km either side)
        cost = {}
        for n, (i, off) in near.items():
            if n in dist and dist[n] + off < cost.get(i, (1e18,))[0]:
                cost[i] = (dist[n] + off, n)
        joins = []
        for i, (c, n) in cost.items():
            if any(j != i and abs(route[j][2] - route[i][2]) < 0.5 and (cc < c or cc == c and j < i) for j, (cc, _) in cost.items()):
                continue
            path, m = [], n
            while m != s0:
                path.append(list(nodes[m])); m = prev[m]
            path.append(list(nodes[s0]))
            geom = [[a['lat'], a['lon']]] + path[::-1] + [[route[i][0], route[i][1]]]
            joins.append({'idx': i, 'conn_m': int(round(c)), 'conn_ascent': max(0, round(route[i][3] - a['ele'])) if a.get('ele') is not None else 0,
                          'geom': simplify(geom)})
        if joins:
            out[f"{a['name']}|{a['lat']}|{a['lon']}"] = sorted(joins, key=lambda j: j['idx'])
            print(f"  {a['name'][:34]:<35} " + ', '.join(f"km {route[j['idx']][2]:.1f} ({j['conn_m']} m walk)" for j in out[f"{a['name']}|{a['lat']}|{a['lon']}"]))
    return out


HEAD = ('// Extra courses (shorter races) alongside the main GPT100 course in data/course.js.\n'
        '// Made by tools/add_course.py from each course GPX. Access points are shared with the main course.\n')


def main():
    if len(sys.argv) < 5:
        sys.exit(__doc__)
    path, cid, name, label = sys.argv[1:5]
    note = sys.argv[5] if len(sys.argv) > 5 else ''
    pts, wpts = load_gpx(path)
    route, km, asc = [], 0.0, 0.0
    for i, p in enumerate(pts):
        if i:
            km += metres(pts[i - 1], p) / 1000
            asc += max(0.0, p[2] - pts[i - 1][2])
        route.append([round(p[0], 5), round(p[1], 5), round(km, 3), round(p[2], 1)])

    def nearest_km(lat, lon):
        return min(route, key=lambda r: metres((lat, lon), r))[2]

    k = w3w_key()
    loop = metres(pts[0], pts[-1]) < 100
    stops = [{'name': 'Start and finish' if loop else 'Start', 'lat': route[0][0], 'lon': route[0][1], 'km': 0, 'kind': 'start'}]
    for lat, lon, wname in wpts:
        clean = re.sub(r'^(Emergency\s+)?(Aid Station|Checkpoint|Water Point)\s*-\s*', '', wname, flags=re.I).strip()
        kind = 'aid' if re.search('aid station', wname, re.I) else 'water' if re.search('water', wname, re.I) else 'checkpoint'
        if kind == 'water' and clean.lower() == 'water point':
            label_name = 'Water point'
        else:
            label_name = clean + {'aid': ' (aid station)', 'water': ' (water point)', 'checkpoint': ' (checkpoint)'}[kind]
        stops.append({'name': label_name, 'lat': lat, 'lon': lon, 'km': nearest_km(lat, lon), 'kind': kind})
    stops.append({'name': 'Finish' if not loop else 'Start and finish', 'lat': route[-1][0], 'lon': route[-1][1], 'km': route[-1][2], 'kind': 'finish'})
    for s in stops:
        s['w3w'] = to_3wa(s['lat'], s['lon'], k)
        print(f"  km {s['km']:6.2f}  {s['name']:<34} ///{s['w3w']}")

    add_access_heights()
    src = open(COURSE, encoding='utf-8').read()
    access = json.loads(re.search(r'window\.GPT100_DATA = (\{.*\});', src, re.S).group(1))['access']
    print('Walking routes from access points to the course (OpenStreetMap):')
    joins = walking_joins(route, access)

    courses = []
    if os.path.exists(OUT):
        m = re.search(r'window\.GPT100_COURSES = (\[.*\]);', open(OUT, encoding='utf-8').read(), re.S)
        courses = json.loads(m.group(1)) if m else []
    courses = [c for c in courses if c['id'] != cid]
    courses.append({'id': cid, 'name': name, 'label': label, 'note': note, 'total_km': round(km, 1),
                    'total_ascent_m': int(round(asc)), 'stops': stops, 'joins': joins, 'route': route})
    open(OUT, 'w', encoding='utf-8').write(HEAD + 'window.GPT100_COURSES = ' + json.dumps(courses, separators=(',', ':')) + ';\n')
    print(f'{name}: {km:.1f} km, {asc:.0f} m ascent, {len(route)} points, {len(stops)} stops. Courses: ' + ', '.join(c['id'] for c in courses))


if __name__ == '__main__':
    main()

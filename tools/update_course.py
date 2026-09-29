#!/usr/bin/env python3
"""Update data/course.js from a new course GPX.

Usage: python3 tools/update_course.py path/to/course.gpx

What it does:
- Replaces the route with the GPX track (km measured along the track, elevation from the GPX).
- Re-measures trail_km for every access point and crossing against the new route.
- Marks aid stations from the GPX waypoints whose names contain "Aid Station",
  renaming the matching access point to the waypoint's name. The start and finish stay aid stations.
- Warns about any aid station waypoint with no access point nearby. Add that point in admin.html
  (or data/course.js) with its drive times, then run this again.

Drive times, drive routes and walk tracks are left as they are.
"""
import json, math, re, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
COURSE = os.path.join(HERE, '..', 'data', 'course.js')
AID_MATCH_M = 300  # an access point this close to an aid station waypoint is that aid station


def metres(a, b):
    r = math.pi / 180
    x = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(x))


def load_gpx(path):
    s = open(path, encoding='utf-8').read()
    pts = [(float(a), float(b), float(e)) for a, b, e in
           re.findall(r'<trkpt lat="([-\d.]+)" lon="([-\d.]+)">\s*<ele>([-\d.]+)</ele>', s)]
    if not pts:
        sys.exit('No track points with elevation found in ' + path)
    wpts = []
    for a, b, body in re.findall(r'<wpt lat="([-\d.]+)" lon="([-\d.]+)">(.*?)</wpt>', s, re.S):
        n = re.search(r'<name>(.*?)</name>', body, re.S)
        wpts.append((float(a), float(b), n.group(1).strip() if n else ''))
    return pts, wpts


def nearest(route, lat, lon):
    k = math.cos(lat * math.pi / 180)
    best, bi = 1e18, 0
    for i, p in enumerate(route):
        d = (p[0] - lat) ** 2 + ((p[1] - lon) * k) ** 2
        if d < best:
            best, bi = d, i
    return bi


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    pts, wpts = load_gpx(sys.argv[1])
    src = open(COURSE, encoding='utf-8').read()
    m = re.search(r'window\.GPT100_DATA = (\{.*\});', src, re.S)
    data = json.loads(m.group(1))

    route, km, asc = [], 0.0, 0.0
    for i, p in enumerate(pts):
        if i:
            km += metres(pts[i - 1], p) / 1000
            asc += max(0.0, p[2] - pts[i - 1][2])
        route.append([round(p[0], 5), round(p[1], 5), round(km, 3), round(p[2], 1)])
    data['route'] = route
    data['total_km'] = round(km, 1)
    data['total_ascent_m'] = int(round(asc))
    end = route[-1][2]

    # The trail point an access point joins: the end of its walk track, else the point itself.
    def join(a):
        g = a.get('conn_geom')
        return (g[-1][0], g[-1][1]) if g and len(g) > 1 else (a['lat'], a['lon'])

    for a in data['access']:
        a['trail_km'] = route[nearest(route, *join(a))][2]
    for a in data['access']:
        # Names generated from a km (e.g. "Road crossing 148.69 km") follow the new km.
        if re.fullmatch(r'Road crossing (km )?[\d.]+( km)?', a['name']):
            a['name'] = f"Road crossing km {a['trail_km']:.1f}"
    for c in data['crossings']:
        c['km'] = route[nearest(route, c['lat'], c['lon'])][2]

    aid_wpts = [w for w in wpts if re.search(r'aid station', w[2], re.I)]
    for a in data['access']:
        a['aid'] = a['trail_km'] in (0, end) and bool(re.search(r'\((Start|Finish)\)', a['name']))
    for lat, lon, name in aid_wpts:
        clean = re.sub(r'^(Emergency\s+)?Aid Station\s*-\s*', '', name, flags=re.I).strip()
        if re.match(r'Emergency', name, re.I):
            clean += ' (emergency aid)'
        cands = sorted((metres((lat, lon), (a['lat'], a['lon'])), i) for i, a in enumerate(data['access']))
        if cands and cands[0][0] <= AID_MATCH_M:
            a = data['access'][cands[0][1]]
            a['aid'] = True
            if a['name'] != clean:
                print(f'  renamed "{a["name"]}" -> "{clean}"')
                a['name'] = clean
        else:
            print(f'  WARNING: no access point within {AID_MATCH_M} m of "{name}" ({lat}, {lon}). Add it, then run again.')

    data['access'].sort(key=lambda a: a['trail_km'])
    out = src[:m.start(1)] + json.dumps(data, separators=(',', ':')) + src[m.end(1):]
    open(COURSE, 'w', encoding='utf-8').write(out)
    print(f'Course updated: {data["total_km"]} km, {data["total_ascent_m"]} m ascent, {len(route)} points, '
          f'{sum(1 for a in data["access"] if a["aid"])} aid stations.')


if __name__ == '__main__':
    main()

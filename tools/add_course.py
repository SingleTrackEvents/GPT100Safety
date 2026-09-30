#!/usr/bin/env python3
"""Add or update an extra course (e.g. the 14k) from a GPX.

Usage: python3 tools/add_course.py path/to/course.gpx ID "Name" "Label for the course picker" ["Note"]
Example: python3 tools/add_course.py GPT14k.gpx 14k GPT14k "14k and 6k" "The 6k runs on part of this course."

Writes data/courses.js. The route, km and elevation come from the GPX track. Every GPX waypoint
(aid station, water point, checkpoint) becomes a stop that splits the run sheet, plus the start and
finish. Stops get a what3words address. Access points and drive routes are shared with the main
course, so nothing else needs setting up.
"""
import json, os, re, sys, urllib.request

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

    courses = []
    if os.path.exists(OUT):
        m = re.search(r'window\.GPT100_COURSES = (\[.*\]);', open(OUT, encoding='utf-8').read(), re.S)
        courses = json.loads(m.group(1)) if m else []
    courses = [c for c in courses if c['id'] != cid]
    courses.append({'id': cid, 'name': name, 'label': label, 'note': note, 'total_km': round(km, 1),
                    'total_ascent_m': int(round(asc)), 'stops': stops, 'route': route})
    open(OUT, 'w', encoding='utf-8').write(HEAD + 'window.GPT100_COURSES = ' + json.dumps(courses, separators=(',', ':')) + ';\n')
    add_access_heights()
    print(f'{name}: {km:.1f} km, {asc:.0f} m ascent, {len(route)} points, {len(stops)} stops. Courses: ' + ', '.join(c['id'] for c in courses))


if __name__ == '__main__':
    main()

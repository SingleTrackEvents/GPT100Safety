#!/usr/bin/env python3
"""Extend stored drive routes along gated or forestry tracks the public routers won't use.

Usage: python3 tools/extend_routes.py ROUTES.json "Access point name" [more names...]

For each named access point and each base, it takes the route line (the stored drive_geoms line, or
Valhalla's line from ROUTES.json if none is stored yet), downloads the OpenStreetMap roads and tracks
between where it stops and the access point, and follows the shortest way along them to the point.
Vehicle roads and tracks are used first. Walking paths are only used if nothing else connects,
and the output says so. Drive times are not changed.
"""
import heapq, json, math, os, re, sys, time, urllib.request, xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from drive_routes import metres, simplify  # noqa: E402

COURSE = os.path.join(HERE, '..', 'data', 'course.js')
WALK_ONLY = {'footway', 'path', 'steps', 'pedestrian', 'bridleway', 'cycleway'}


def osm(bbox):
    url = 'https://api.openstreetmap.org/api/0.6/map?bbox=%.5f,%.5f,%.5f,%.5f' % bbox
    req = urllib.request.Request(url, headers={'User-Agent': 'GPT100Safety route check'})
    root = ET.fromstring(urllib.request.urlopen(req, timeout=90).read())
    nodes = {n.get('id'): (float(n.get('lat')), float(n.get('lon'))) for n in root.iter('node')}
    ways = []
    for w in root.iter('way'):
        tags = {t.get('k'): t.get('v') for t in w.iter('tag')}
        if 'highway' in tags:
            ways.append((tags, [x.get('ref') for x in w.iter('nd') if x.get('ref') in nodes]))
    return nodes, ways


def shortest(nodes, ways, start, goal, allow_walk):
    graph = {}
    for tags, nds in ways:
        if tags['highway'] in WALK_ONLY and not allow_walk:
            continue
        for a, b in zip(nds, nds[1:]):
            d = metres(nodes[a], nodes[b])
            graph.setdefault(a, []).append((b, d, tags))
            graph.setdefault(b, []).append((a, d, tags))
    if not graph:
        return None
    s = min(graph, key=lambda n: metres(nodes[n], start))
    g = min(graph, key=lambda n: metres(nodes[n], goal))
    dist, prev, seen = {s: 0}, {}, set()
    q = [(0, s)]
    while q:
        d, n = heapq.heappop(q)
        if n in seen:
            continue
        seen.add(n)
        if n == g:
            break
        for m, w, tags in graph.get(n, []):
            if d + w < dist.get(m, 1e18):
                dist[m] = d + w; prev[m] = (n, tags); heapq.heappush(q, (d + w, m))
    if g not in seen:
        return None
    path, used, n = [g], [], g
    while n != s:
        n, tags = prev[n]; path.append(n); used.append(tags)
    path.reverse(); used.reverse()
    return {'pts': [list(nodes[n]) for n in path], 'm': dist[g], 'join_gap': metres(nodes[s], start),
            'end_gap': metres(nodes[g], goal), 'ways': used}


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    routes = json.load(open(sys.argv[1]))
    names = sys.argv[2:]
    src = open(COURSE, encoding='utf-8').read()
    m = re.search(r'window\.GPT100_DATA = (\{.*\});', src, re.S)
    data = json.loads(m.group(1))
    for a in data['access']:
        if a['name'] not in names:
            continue
        goal = (a['lat'], a['lon'])
        rec = next((r for r in routes.values() if r['name'] == a['name']
                    and abs(r['lat'] - a['lat']) < 1e-6 and abs(r['lon'] - a['lon']) < 1e-6), None)
        for k in data['bases']:
            base = (data['bases'][k][1], data['bases'][k][0])
            old = a.get('drive_geom')
            if not (a.get('drive_geoms') or {}).get(k) and old and len(old) > 1 and \
                    min(metres(old[0], base), metres(old[-1], base)) < 1500 and min(metres(old[0], goal), metres(old[-1], goal)) < 60:
                print(f'{a["name"]} {k}: hand-traced line already reaches the point'); continue
            g = (a.get('drive_geoms') or {}).get(k) or (rec and rec['bases'].get(k, {}).get('valhalla', {}).get('geom'))
            if not g or len(g) < 2:
                print(f'{a["name"]} {k}: no route line to extend'); continue
            if metres(g[-1], goal) < 60:
                print(f'{a["name"]} {k}: already reaches the point'); continue
            end = g[-1]
            pad = 0.01
            bbox = (min(end[1], goal[1]) - pad, min(end[0], goal[0]) - pad, max(end[1], goal[1]) + pad, max(end[0], goal[0]) + pad)
            nodes, ways = osm(bbox); time.sleep(1)
            res = shortest(nodes, ways, end, goal, False) or shortest(nodes, ways, end, goal, True)
            if not res or res['end_gap'] > 150 or res['join_gap'] > 150:
                print(f'{a["name"]} {k}: no connected track found ({res and round(res["end_gap"])} m short)'); continue
            walk = any(t['highway'] in WALK_ONLY for t in res['ways'])
            named = []
            for t in res['ways']:
                label = f"{t.get('name') or 'unnamed'} ({t['highway']}{', ' + t['access'] if t.get('access') else ''})"
                if not named or named[-1] != label:
                    named.append(label)
            a.setdefault('drive_geoms', {})[k] = g + simplify(res['pts'], 5)[1:]
            print(f'{a["name"]} {k}: +{res["m"] / 1000:.2f} km via ' + ' > '.join(named) +
                  f'; ends {round(res["end_gap"])} m from the point' + ('  ** USES A WALKING PATH **' if walk else ''))
    open(COURSE, 'w', encoding='utf-8').write(src[:m.start(1)] + json.dumps(data, separators=(',', ':')) + src[m.end(1):])


if __name__ == '__main__':
    main()

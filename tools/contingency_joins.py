#!/usr/bin/env python3
"""Walks from the access points to the Miler's contingency stretch, along OpenStreetMap paths, tracks and streets.

Usage: python3 tools/contingency_joins.py   (run by tools/add_contingency.mjs after it writes data/contingency.js)

Adds "joins" to data/contingency.js: {"name|lat|lon": [{idx, conn_m, conn_ascent, geom}]}, idx along the contingency
stretch. The shared parts of the course use the GPT100's own access points and walks (js/engine.js), so only the
stretch that differs is worked out here, the same way tools/add_course.py does it for the 14k.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from add_course import walking_joins, add_access_heights, COURSE  # noqa: E402

OUT = os.path.join(HERE, '..', 'data', 'contingency.js')


def main():
    src = open(OUT, encoding='utf-8').read()
    m = re.search(r'window\.GPT100_CONTINGENCY = (\{.*\});', src, re.S)
    data = json.loads(m.group(1))
    add_access_heights()
    access = json.loads(re.search(r'window\.GPT100_DATA = (\{.*\});', open(COURSE, encoding='utf-8').read(), re.S).group(1))['access']
    print('Walking routes from access points to the contingency (OpenStreetMap):')
    data['joins'] = walking_joins(data['route'], access)
    open(OUT, 'w', encoding='utf-8').write(src[:m.start(1)] + json.dumps(data, separators=(',', ':')) + src[m.end(1):])
    print(f"{len(data['joins'])} access points join the contingency stretch")


if __name__ == '__main__':
    main()

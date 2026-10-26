#!/usr/bin/env python3
"""Helicopter landing sites (HLS) for the maps and the Find card: writes data/helipads.js.

Usage: python3 tools/import_helipads.py            (pip install openpyxl)

Reads two things in tools/helipads/:
  Wimmera Helipads.xlsx   the DEECA "Wimmera District Helipads" list (via Parks Victoria, 20 October 2026):
                          position to about 100 m, pad size and surface, vehicle access, hazards, last inspection,
                          and whether the entry is current or expired.
  used-oct-2026.json      the sites a Parks Victoria helicopter operation used in October 2026, with precise
                          positions, so they're known to be in good condition. Two of them aren't on the DEECA list.

Each site gets the nearest GPT100 course km and how far off the course it is (from data/course.js), as the
Parks Victoria emergency markers do in data/track-grades.js. Re-run after editing either source file.

Heights (ele_m) are the ground at each site's position from a terrain model, not the spreadsheet or the email: the
spreadsheet's are feet values read as metres (Major Mitchell Plateau 307 against about 1013 m) and a few emailed ones
are wrong too (Gar 359 against about 707 m). They come from the Open-Meteo elevation API (Copernicus 90 m), or
OpenTopoData's SRTM 30 m when Open-Meteo is unavailable. With neither, a site keeps the terrain height already in
data/helipads.js if its position hasn't moved, else it gets none (shown without a height) and is listed.
"""
import datetime, json, math, os, re, sys, urllib.parse, urllib.request

try:
    import openpyxl
except ImportError:
    sys.exit('pip install openpyxl')

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
XLSX = os.path.join(HERE, 'helipads', 'Wimmera Helipads.xlsx')
USED = os.path.join(HERE, 'helipads', 'used-oct-2026.json')
COURSE = os.path.join(ROOT, 'data', 'course.js')
OUT = os.path.join(ROOT, 'data', 'helipads.js')

# Hazard notes typed in capitals in the spreadsheet, reworded by hand (other entries are shown as typed).
HAZARDS = {
    'Wimmera Roses Gap HLS': '300 m south of the Crute Track and Bolte Highway (Halls Gap to Mt Zero Road) intersection. Two helipads',
    'Wimmera Mt Byron Helipad HLS': 'Trees to the east and west. Pad rises slightly to the south',
}
# Short names for the map, where the spreadsheet's are long or odd.
NAMES = {
    'Wimmera-Gar-Mt Difficult Grampians NP HLS': 'Gar (Mt Difficult)',
    'Grampians - Piccaninny': 'Bainggug (Piccaninny)',
    'Wimmera Mt Byron Helipad HLS': 'Mt Byron',
    'Wimmera Roses Gap HLS': 'Roses Gap (Mt Zero Rd)',
    'Wimmera Victoria Range Nth Fireline HLS': 'Victoria Range North Fireline',
    'Wimmera - Mt Difficult HLS': 'Mt Difficult (Pines Rd)',
}
# Days (Melbourne dates) a site can't take a helicopter: js/helipads.js lists it after the usable sites then.
CLOSED = {'Bainggug (Piccaninny)': ['2026-11-07', '2026-11-08']}  # its car park is the Bainggug aid station
# Terrain heights: Open-Meteo first, then OpenTopoData. Each returns one height per position, in order.
DEMS = [
    ('Open-Meteo elevation API (Copernicus 90 m)', lambda pts: 'https://api.open-meteo.com/v1/elevation?' + urllib.parse.urlencode(
        {'latitude': ','.join(str(p[0]) for p in pts), 'longitude': ','.join(str(p[1]) for p in pts)}), lambda j: j['elevation']),
    ('OpenTopoData SRTM 30 m', lambda pts: 'https://api.opentopodata.org/v1/srtm30m?locations=' + '|'.join(f'{p[0]},{p[1]}' for p in pts),
     lambda j: [r['elevation'] for r in j['results']]),
]


def metres(a, b):
    R, rad = 6371000.0, math.pi / 180
    la1, la2 = a[0] * rad, b[0] * rad
    dla, dlo = (b[0] - a[0]) * rad, (b[1] - a[1]) * rad
    x = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))


def dem_heights(pts):
    """Ground heights (m) for [(lat, lon)], and the source, or (None, None) when no terrain service answers."""
    for name, url, read in DEMS:
        try:
            with urllib.request.urlopen(url(pts), timeout=60) as r:
                h = read(json.load(r))
            if len(h) == len(pts) and all(x is not None for x in h):
                return [round(x) for x in h], name
            print(name + ': incomplete answer', file=sys.stderr)
        except Exception as e:
            print(name + ': ' + str(e), file=sys.stderr)
    return None, None


def short_name(full):
    if full in NAMES:
        return NAMES[full]
    n = re.sub(r'^\s*(Wimmera|Grampians)\s*-?\s*', '', full.strip())
    n = re.sub(r'\s*(Helipad\s*)?HLS\s*$', '', n)
    return re.sub(r'\s+', ' ', n).strip()


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def coord(v):
    """'37.355 S' -> -37.355. The sheet has 'S' on a couple of longitudes and a lower-case 's'; the hemisphere
    is the Grampians either way, so south and east are assumed."""
    if v is None:
        return None
    m = re.search(r'-?\d+(?:\.\d+)?', str(v))
    return float(m.group(0)) if m else None


def size_m(v):
    m = re.search(r'(\d+(?:\.\d+)?)', str(v or ''))
    return float(m.group(1)) if m else None   # '45cm' in the sheet is a typo for 45 m


def when(v):
    if isinstance(v, datetime.datetime):
        return v.date().isoformat()
    m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})', str(v or ''))
    return f'{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}' if m else None


def status(v):
    s = str(v or '').strip()
    if not s:
        return 'unknown', ''
    if s.lower().startswith('current'):
        return 'current', s[7:].strip(' .')
    if s.lower().startswith('expired'):
        return 'expired', s[7:].strip(' .')
    return 'unknown', s


def text(v):
    s = re.sub(r'\s+', ' ', str(v or '')).strip()
    if s in ('-', 'Nil', 'nil', 'None', '?') or s.lower().startswith('nil -'):
        return ''
    # A few entries are typed in capitals; bring them down to a sentence.
    letters = re.sub(r'[^A-Za-z]', '', s)
    if len(letters) > 8 and letters.isupper():
        s = s.lower()
        s = re.sub(r'\b(mt|rd|hls|gpt|e|w|n|s)\b', lambda m: m.group(1).upper(), s)
        s = s[0].upper() + s[1:]
    return s


def main():
    src = open(COURSE, encoding='utf-8').read()
    route = json.loads(re.search(r'window\.GPT100_DATA = (\{.*\});', src, re.S).group(1))['route']
    used = json.load(open(USED, encoding='utf-8'))['sites']
    by_sheet = {u['sheet']: u for u in used if u.get('sheet')}

    ws = openpyxl.load_workbook(XLSX, data_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    head = [str(c or '').strip().lower() for c in rows[1]]
    col = lambda key: next(i for i, h in enumerate(head) if key in h)
    C = {k: col(k) for k in ['helipad name', 'location', 'track', 'elevation', 'lat', 'lon', 'diam', 'surface',
                             'vehicle', 'hazards', 'last inspected', 'current', 'sau']}
    sites = []
    for r in rows[2:]:
        full = text(r[C['helipad name']])
        if not full:
            continue
        lat, lon = coord(r[C['lat']]), coord(r[C['lon']])
        if lat is None or lon is None:
            print('No position:', full, file=sys.stderr)
            continue
        st, st_note = status(r[C['current']])
        u = by_sheet.pop(full, None)
        s = {
            'id': slug(short_name(full)), 'name': short_name(full), 'full': full,
            'lat': -abs(lat), 'lon': abs(lon), 'precise': False,
            'ele_m': None,  # filled from the terrain model below
            'park': text(r[C['location']]), 'track': text(r[C['track']]),
            'diam_m': size_m(r[C['diam']]), 'surface': text(r[C['surface']]),
            'vehicle': text(r[C['vehicle']]), 'hazards': HAZARDS.get(full, text(r[C['hazards']])),
            'inspected': when(r[C['last inspected']]), 'status': st, 'status_note': st_note,
            'sau': r[C['sau']], 'used': False,
        }
        if u:
            s.update(lat=u['lat'], lon=u['lon'], precise=True, used=True)
            if u.get('note'):
                s['note'] = u['note']
        sites.append(s)
    for u in by_sheet.values():
        print('Not in the spreadsheet:', u['sheet'], file=sys.stderr)
    # Sites Parks Victoria used that the DEECA list doesn't have.
    for u in used:
        if not u.get('sheet'):
            sites.append({'id': slug(u['name']), 'name': u['name'], 'full': u['name'], 'lat': u['lat'], 'lon': u['lon'],
                          'precise': True, 'ele_m': None, 'park': 'Grampians National Park', 'track': '',
                          'diam_m': None, 'surface': '', 'vehicle': '', 'hazards': '', 'inspected': None,
                          'status': 'unlisted', 'status_note': '', 'sau': None, 'used': True,
                          **({'note': u['note']} if u.get('note') else {})})

    # Nearest course point.
    for s in sites:
        best = min(range(len(route)), key=lambda i: metres((s['lat'], s['lon']), (route[i][0], route[i][1])))
        s['km'] = route[best][2]
        s['off_m'] = round(metres((s['lat'], s['lon']), (route[best][0], route[best][1])))
    sites.sort(key=lambda s: s['km'])
    for s in sites:
        s['lat'], s['lon'] = round(s['lat'], 6), round(s['lon'], 6)
        if s['name'] in CLOSED:
            s['closed'] = CLOSED[s['name']]

    # Heights from the terrain model, or the ones already written from it when no service answers.
    heights, ele_src = dem_heights([(s['lat'], s['lon']) for s in sites])
    if heights:
        for s, h in zip(sites, heights):
            s['ele_m'] = h
    else:
        old, ele_src = {}, None
        try:
            t = open(OUT, encoding='utf-8').read()
            prev = json.loads(t[t.index('{'):t.rindex('}') + 1])
            if prev.get('ele_src'):
                ele_src = prev['ele_src']
                old = {(p['lat'], p['lon']): p.get('ele_m') for p in prev['sites']}
        except (OSError, ValueError):
            pass
        for s in sites:
            s['ele_m'] = old.get((s['lat'], s['lon']))
            if s['ele_m'] is None:
                print('No terrain height:', s['name'], file=sys.stderr)

    data = {
        'source': 'DEECA Wimmera District helipad list and map (6 October 2026), via Parks Victoria 20 October 2026',
        'used_when': 'October 2026',
        'ele_src': ele_src,
        'sites': sites,
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('// Helicopter landing sites (HLS) near the course, from the DEECA "Wimmera District Helipads" list that Parks Victoria\n'
                '// sent on 20 October 2026 (tools/helipads/), with the sites a Parks Victoria helicopter used in October 2026 marked\n'
                '// (used: true, precise positions). Positions from the DEECA list alone are to about 100 m (precise: false).\n'
                '// status: current or expired on the DEECA list, or unlisted (used by Parks Victoria but not on the list). km and off_m:\n'
                '// the nearest GPT100 course km and how far off the course. ele_m: ground height at the position from the terrain model\n'
                f'// in ele_src ({ele_src or "none available"}), not the DEECA list or the email. closed: Melbourne dates\n'
                '// the site can\'t take a helicopter. Made by tools/import_helipads.py; do not edit by hand.\n')
        f.write('window.GPT100_HELIPADS = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(f'{len(sites)} sites written to {os.path.relpath(OUT, ROOT)}')
    for s in sites:
        print(f"  km {s['km']:6.1f}  {s['off_m']:5d} m off  {s['ele_m'] or '-':>5} m  {s['status']:8s} {'used' if s['used'] else '    '}  {s['name']}")


if __name__ == '__main__':
    main()

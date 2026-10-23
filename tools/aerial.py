"""Find the best free aerial image for a project address and save it at a known ft/px scale.

    python3 tools/aerial.py "299 E San Ysidro Blvd, San Diego CA" --site san-ysidro
    python3 tools/aerial.py "..." --site <slug> --add-to-tool     # also adds a SITES entry to the layout tool
    python3 tools/aerial.py --list                                 # probe every source in rules/aerial_sources.json

Steps: geocode (SANDAG address points in San Diego County, else the Census geocoder), ask every source that covers
the point for its resolution and date at the site (catalog / metadata where the service has one), probe each with a
small export, rank by ground resolution then date, and export the winner into a north-up frame centred on the address.
The frame is a local Transverse Mercator in US survey feet (scale 1.0, origin at the address), so ft/px is exact and
the address pin is the image centre, anywhere in the US. Writes sites/<site>/aerial/:
    <site>_<source>_<date>_<ftpx>ftpx_<W>x<H>ft.jpg   enhanced (contrast + unsharp mask sized to the source resolution)
    *_raw.jpg                                         as served (gitignored)
    candidates.jpg                                    every source side by side, for picking by eye (gitignored)
    aerial.json                                       address, geocode, frame, chosen source, all candidates
Restricted sources (Esri World Imagery) are skipped unless --esri is given; they are for reference and tracing only.
"""
import argparse, base64, datetime, io, json, math, os, re, sys, urllib.parse, urllib.request

from PIL import Image, ImageDraw, ImageFilter, ImageOps, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = os.path.join(ROOT, 'rules', 'aerial_sources.json')
TOOL = os.path.join(ROOT, 'cd50-layout', 'cd50-layout.html')
FTUS = 1200 / 3937  # m per US survey ft
SD_BBOX = (-117.61, 32.53, -116.08, 33.51)
UA = {'User-Agent': 'CD50-Tool aerial finder (HiON EV)'}


def get(url, params=None, timeout=40, raw=False):
    if params: url += ('&' if '?' in url else '?') + urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        data = r.read()
    if raw: return data
    d = json.loads(data)
    if isinstance(d, dict) and 'error' in d: raise RuntimeError(d['error'].get('message', 'service error'))
    return d


def short_err(e):
    s = str(getattr(e, 'reason', '') or e)
    return 'host not reachable (blocked by network policy or offline)' if re.search(r'Tunnel|403|resolve|Name or service|timed out|refused', s) else s[:120]


# ---------- geocoding
def in_bbox(lon, lat, b): return b is None or (b[0] <= lon <= b[2] and b[1] <= lat <= b[3])


def geocode_census(address):
    d = get('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress',
            {'address': address, 'benchmark': 'Public_AR_Current', 'format': 'json'})
    m = d['result']['addressMatches']
    if not m: return None
    c = m[0]['coordinates']
    return {'lon': c['x'], 'lat': c['y'], 'matched': m[0]['matchedAddress'], 'source': 'US Census geocoder (address range, interpolated)'}


def geocode_sandag(address):
    d = get('https://geo.sandag.org/server/rest/services/SANDAG_COMPOSITE_LOCATOR/GeocodeServer/findAddressCandidates',
            {'SingleLine': address, 'outSR': 4326, 'outFields': 'Addr_type,Loc_name', 'f': 'json'})
    c = [x for x in d.get('candidates', []) if x['score'] >= 90]
    c.sort(key=lambda x: (x['attributes'].get('Addr_type') != 'PointAddress', 'APN' not in x['attributes'].get('Loc_name', ''), -x['score']))
    if not c: return None
    x = c[0]
    return {'lon': x['location']['x'], 'lat': x['location']['y'], 'matched': x['address'],
            'source': f"SANDAG composite locator ({x['attributes'].get('Loc_name')}, {x['attributes'].get('Addr_type')})"}


def geocode(address):
    notes, g = [], None
    try: g = geocode_census(address)
    except Exception as e: notes.append('Census: ' + short_err(e))
    if g is None or in_bbox(g['lon'], g['lat'], SD_BBOX):
        try:
            s = geocode_sandag(address)
            if s and in_bbox(s['lon'], s['lat'], SD_BBOX): g = s
        except Exception as e: notes.append('SANDAG: ' + short_err(e))
    if g is None: sys.exit('Address not found. ' + '; '.join(notes) + ' Try --lonlat <lon>,<lat>.')
    return g


# ---------- local frame: Transverse Mercator in US ft centred on the address (true north up, scale 1.0)
def local_sr(lon, lat):
    wkt = ('PROJCS["CD50 local TM",GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",'
           'SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],'
           'PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],'
           f'PARAMETER["Central_Meridian",{lon:.7f}],PARAMETER["Scale_Factor",1.0],PARAMETER["Latitude_Of_Origin",{lat:.7f}],'
           'UNIT["Foot_US",0.3048006096012192]]')
    return json.dumps({'wkt': wkt}, separators=(',', ':'))


def export(src, sr, bbox, w, h, fmt='jpg'):
    """One export request: bbox in local ft (xmin, ymin, xmax, ymax), returns a PIL image."""
    p = {'bbox': ','.join(f'{v:.3f}' for v in bbox), 'bboxSR': sr, 'imageSR': sr, 'size': f'{w},{h}', 'f': 'image'}
    if src['type'] == 'image':
        p.update(format=fmt, interpolation='RSP_CubicConvolution', noData='')
        url = src['url'] + '/exportImage'
    else:
        p.update(format=fmt, transparent='false', dpi=96)
        url = src['url'] + '/export'
    data = get(url, p, timeout=90, raw=True)
    if data[:1] == b'{': raise RuntimeError(json.loads(data).get('error', {}).get('message', 'export failed'))
    return Image.open(io.BytesIO(data)).convert('RGB')


def export_tiled(src, sr, wft, hft, ftpx, maxpx):
    W, H = round(wft / ftpx), round(hft / ftpx)
    out = Image.new('RGB', (W, H))
    for y0 in range(0, H, maxpx):
        for x0 in range(0, W, maxpx):
            w, h = min(maxpx, W - x0), min(maxpx, H - y0)
            xmin, ymax = -wft / 2 + x0 * ftpx, hft / 2 - y0 * ftpx
            out.paste(export(src, sr, (xmin, ymax - h * ftpx, xmin + w * ftpx, ymax), w, h), (x0, y0))
    return out


def blank(im):
    """No-data frames come back flat black, white or one colour."""
    st = ImageStat.Stat(im.convert('L'))
    return st.stddev[0] < 4


# ---------- what each source has at the site
def site_info(src, lon, lat):
    """Resolution (ft) and date at the point from the service's catalog or metadata layer; nominal values otherwise."""
    gsd, date, detail = src['gsd_ft'], src.get('date'), None
    pt = {'geometry': f'{lon},{lat}', 'geometryType': 'esriGeometryPoint', 'inSR': 4326, 'f': 'json'}
    if src.get('catalog'):
        d = get(src['url'] + '/query', {**pt, 'spatialRel': 'esriSpatialRelIntersects', 'where': 'Category=1',
                                        'outFields': 'Name,resolution_value,resolution_units,acquisition_date,agency', 'returnGeometry': 'false'})
        rows = []
        for f in d.get('features', []):
            a = f['attributes']
            if a.get('resolution_value') is None: continue
            r = a['resolution_value'] * (1 / FTUS if str(a.get('resolution_units', '')).upper().startswith('MET') else 1)
            dt = datetime.datetime.fromtimestamp(a['acquisition_date'] / 1000, datetime.timezone.utc).date().isoformat() if a.get('acquisition_date') else None
            rows.append((r, dt or '', a.get('Name'), a.get('agency')))
        if rows:
            rows.sort(key=lambda r: (round(r[0], 2), [-ord(c) for c in r[1]]))
            gsd, date, detail = rows[0][0], rows[0][1] or None, f'{rows[0][2]} ({rows[0][3]})'
    if src.get('metadata'):
        d = get(src['metadata'] + '/identify', {**pt, 'sr': 4326, 'layers': 'all', 'tolerance': 1,
                                               'mapExtent': f'{lon-.001},{lat-.001},{lon+.001},{lat+.001}', 'imageDisplay': '400,400,96', 'returnGeometry': 'false'})
        for r in d.get('results', []):
            a = {k.upper(): v for k, v in r['attributes'].items()}
            res = a.get('SRC_RES') or a.get('RESOLUTION (M)')
            dt = str(a.get('SRC_DATE') or a.get('SRC_DATE2') or '')
            if res not in (None, '', 'Null'):
                gsd = float(res) / FTUS
                if re.fullmatch(r'\d{8}', dt): date = f'{dt[:4]}-{dt[4:6]}-{dt[6:]}'
                detail = a.get('NICE_DESC') or a.get('SRC_DESC') or a.get('NICE_NAME')
                break
    return gsd, date, detail


def hosts(src):
    return sorted({urllib.parse.urlparse(u).hostname for u in (src['url'], src.get('metadata')) if u})


def blocked_better(cfg, cands, best):
    """Sources that cover the site and are nominally sharper than the winner but did not answer: name them and their hosts."""
    by_id = {s['id']: s for s in cfg['sources']}
    lim = best['gsd_ft'] if best else 99
    out = [c for c in cands if c.get('status') not in ('ok', 'no imagery at this site') and not c['status'].startswith('skipped')
           and by_id[c['id']]['gsd_ft'] < lim]
    return [{'id': c['id'], 'name': c['name'], 'gsd_ft': by_id[c['id']]['gsd_ft'], 'status': c['status'], 'hosts': hosts(by_id[c['id']])}
            for c in sorted(out, key=lambda c: by_id[c['id']]['gsd_ft'])]


def rank_key(c): return (round(c['gsd_ft'], 2), [-ord(ch) for ch in (c.get('date') or '0')])


def candidates(cfg, lon, lat, sr, wft, hft, esri=False, only=None):
    out = []
    for src in cfg['sources']:
        if only and src['id'] != only: continue
        c = {'id': src['id'], 'name': src['name'], 'license': src['license'], 'credit': src['credit']}
        if not in_bbox(lon, lat, src.get('bbox')): continue
        if src['license'] != 'public' and not (esri or only): c['status'] = 'skipped (restricted license; use --esri)'; out.append(c); continue
        try:
            c['gsd_ft'], c['date'], c['detail'] = site_info(src, lon, lat)
            k = 320 / wft
            probe = export(src, sr, (-wft / 2, -hft / 2, wft / 2, hft / 2), 320, round(hft * k))
            if blank(probe): c['status'] = 'no imagery at this site'
            else: c['status'], c['_probe'] = 'ok', probe
        except Exception as e:
            c['status'] = short_err(e)
        out.append(c)
    return out


# ---------- image improvement
def enhance(im, gsd_ft, ftpx):
    """Stretch contrast a little and sharpen at the scale of the source pixels (upsampled sources get a wider radius)."""
    im = ImageOps.autocontrast(im, cutoff=0.4, preserve_tone=True)
    up = max(1.0, gsd_ft / ftpx)
    return im.filter(ImageFilter.UnsharpMask(radius=round(0.6 * up, 1), percent=80 if up > 1.5 else 60, threshold=2))


def contact_sheet(cands, path):
    ok = [c for c in cands if c.get('_probe')]
    if not ok: return
    w, h = ok[0]['_probe'].size
    sheet = Image.new('RGB', (w * len(ok), h + 34), 'white'); d = ImageDraw.Draw(sheet)
    for i, c in enumerate(ok):
        sheet.paste(c['_probe'], (i * w, 34))
        d.text((i * w + 4, 2), f"{i + 1}. {c['id']}", fill='black')
        d.text((i * w + 4, 17), f"{c['gsd_ft']:.2f} ft  {c.get('date') or 'date ?'}  {c['license']}", fill='black')
    sheet.save(path, quality=85)


# ---------- layout tool SITES entry
def js(v): return json.dumps(v, ensure_ascii=False, separators=(',', ':'))


def sites_entry(slug, label, meta, jpg_bytes):
    f = meta['frame']
    e = (f'  {{id:{js(slug)}, folder:{js(slug)}, label:{js(label)}, wFt:{f["w_ft"]}, hFt:{f["h_ft"]}, pin:[{f["w_ft"]/2},{f["h_ft"]/2}], '
         f'address:{js(meta["address"])}, geo:{js({"lon": meta["geocode"]["lon"], "lat": meta["geocode"]["lat"], "frame": "local TM ftUS at pin"})}, '
         f'credit:{js(meta["credit"])}, src:"data:image/jpeg;base64,{base64.b64encode(jpg_bytes).decode()}"}},')
    return e


def add_to_tool(entry, slug, path=TOOL):
    html = open(path, encoding='utf-8').read()
    a = html.index('const SITES = [')
    b = html.index('\n];\n', a)
    body = html[a:b]
    line = re.compile(r'\n  \{id:' + re.escape(js(slug)) + r',[^\n]*')
    if line.search(body): body = line.sub(lambda m: '\n' + entry, body, count=1)
    else: body = body.rstrip('\n') + '\n' + entry
    open(path, 'w', encoding='utf-8').write(html[:a] + body + html[b:])


def slugify(s):
    words = re.sub(r'[^a-z0-9 ]+', ' ', s.lower().split(',')[0]).split()
    return '-'.join(words[:5]) or 'site'


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('address', nargs='?')
    ap.add_argument('--site', help='site folder under sites/ (default: from the address)')
    ap.add_argument('--lonlat', help='skip geocoding: lon,lat of the address point')
    ap.add_argument('--w', type=float, help='frame width ft (default 700)')
    ap.add_argument('--h', type=float, help='frame height ft (default 525)')
    ap.add_argument('--ftpx', type=float, help='output ft per pixel (default 0.25 for sources 1 ft or finer, else 0.5)')
    ap.add_argument('--source', help='use this source id instead of the best ranked')
    ap.add_argument('--esri', action='store_true', help='include restricted sources (Esri World Imagery, reference only)')
    ap.add_argument('--no-enhance', action='store_true')
    ap.add_argument('--add-to-tool', action='store_true', help='add or replace the SITES entry in cd50-layout.html')
    ap.add_argument('--list', action='store_true', help='probe every source at the address (or San Ysidro) and stop')
    ap.add_argument('--domains', action='store_true', help='print every host the sources use (for the network allow list) and stop')
    a = ap.parse_args(argv)
    cfg = json.load(open(SOURCES, encoding='utf-8'))
    if a.domains:
        print('\n'.join(sorted({h for s in cfg['sources'] for h in hosts(s)}))); return 0
    fr = cfg['frame']
    wft, hft = a.w or fr['w_ft'], a.h or fr['h_ft']
    address = a.address or ('299 E San Ysidro Blvd, San Diego, CA 92173' if a.list else None)
    if not address and not a.lonlat: ap.error('give the project address')
    if a.lonlat:
        lon, lat = map(float, a.lonlat.split(','))
        g = {'lon': lon, 'lat': lat, 'matched': address or a.lonlat, 'source': 'given lon/lat'}
    else:
        g = geocode(address)
    print(f"Address: {g['matched']}  ({g['lat']:.6f}, {g['lon']:.6f})  via {g['source']}")
    sr = local_sr(g['lon'], g['lat'])
    cands = candidates(cfg, g['lon'], g['lat'], sr, wft, hft, esri=a.esri or a.list, only=a.source)
    ok = sorted([c for c in cands if c.get('status') == 'ok'], key=rank_key)
    for c in sorted(cands, key=lambda c: (c.get('status') != 'ok', rank_key(c) if 'gsd_ft' in c else (99,))):
        res = f"{c['gsd_ft']:.2f} ft native, {c.get('date') or 'date ?'}" if c.get('status') == 'ok' else ''
        print(f"  {'*' if ok and c is ok[0] else ' '} {c['id']:<20} [{c['license']}] {c['status']}  {res}")
    bb = blocked_better(cfg, cands, ok[0] if ok else None)
    if bb:
        print('Sharper sources cover this site but did not answer from here:')
        for b in bb: print(f"    {b['name']} (~{b['gsd_ft']:g} ft): {b['status']}")
        print('  To use them, allow these domains: ' + ', '.join(sorted({h for b in bb for h in b['hosts']})))
    if a.list: return 0
    if not ok: sys.exit('No source returned imagery here. Check the network policy (see rules/aerial_sources.json) or pass --lonlat.')
    best = ok[0]
    src = next(s for s in cfg['sources'] if s['id'] == best['id'])
    ftpx = a.ftpx or (fr['ft_per_px'][0] if best['gsd_ft'] <= fr['fine_gsd_ft'] else fr['ft_per_px'][1])
    slug = a.site or slugify(g['matched'])
    outdir = os.path.join(ROOT, 'sites', slug, 'aerial'); os.makedirs(outdir, exist_ok=True)
    try: info = get(src['url'], {'f': 'json'})
    except Exception: info = {}
    maxpx = min(info.get('maxImageWidth', 4000), info.get('maxImageHeight', 4000), 4000)
    raw = export_tiled(src, sr, wft, hft, ftpx, maxpx)
    im = raw if a.no_enhance else enhance(raw, best['gsd_ft'], ftpx)
    date = (best.get('date') or 'nodate').replace('-', '')
    stem = f"{slug}_{best['id']}_{date}_{ftpx:g}ftpx_{wft:g}x{hft:g}ft"
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=86, optimize=True)
    open(os.path.join(outdir, stem + '.jpg'), 'wb').write(buf.getvalue())
    raw.save(os.path.join(outdir, stem + '_raw.jpg'), quality=90)
    contact_sheet(cands, os.path.join(outdir, 'candidates.jpg'))
    credit = (f"{best['credit']}, {best.get('date') or 'date unknown'} ({best['gsd_ft']:.2f} ft native), "
              f"{ftpx:g} ft/px, north up, local TM frame centred on the address"
              f"{'; contrast and unsharp mask applied' if not a.no_enhance else ''}. Pin from {g['source']}.")
    meta = {'format': 'cd50-aerial/1', 'created': datetime.date.today().isoformat(), 'address': address or g['matched'], 'geocode': g,
            'frame': {'w_ft': wft, 'h_ft': hft, 'ft_per_px': ftpx, 'px': list(im.size), 'pin_ft': [wft / 2, hft / 2],
                      'crs': 'Transverse Mercator, NAD83, US survey ft, k=1, origin at the address point', 'wkt': json.loads(sr)['wkt']},
            'image': stem + '.jpg', 'chosen': best['id'], 'blocked_better': bb, 'credit': credit, 'enhanced': not a.no_enhance,
            'candidates': [{k: v for k, v in c.items() if not k.startswith('_')} for c in cands]}
    json.dump(meta, open(os.path.join(outdir, 'aerial.json'), 'w', encoding='utf-8'), indent=1)
    print(f"Saved {os.path.relpath(os.path.join(outdir, stem + '.jpg'), ROOT)}  {im.size[0]}x{im.size[1]} px at {ftpx:g} ft/px")
    if best['license'] != 'public': print('WARNING: restricted license; reference and tracing only, do not issue drawings with this image.')
    if a.add_to_tool:
        add_to_tool(sites_entry(slug, g['matched'], meta, buf.getvalue()), slug)
        print(f'Added SITES entry "{slug}" to cd50-layout/cd50-layout.html')
    return 0


if __name__ == '__main__':
    sys.exit(main())

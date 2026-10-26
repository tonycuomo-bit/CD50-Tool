"""Reads and checks layout.json, the Site Layout tool's export (cd50-layout/layout-format.md), for cd50.py.

load_layout(path) returns (layout, warnings). It refuses a file that is not a layout export, and fixes up the site images:
an image exported beside layout.json (`file`, from Download layout) is read in as a data URI after its sha256 is checked, and
an image stamped with another address than the project's is left out, so another site's photo never reaches a sheet.
"""
import base64, hashlib, json, mimetypes, os, re

FORMATS = ('cd50-layout/1', 'cd50-layout/2')
CURRENT = FORMATS[-1]
# frame.scale.how values; anything but measured is flagged on the plan views
SCALE_FLAGS = {'assumed': ' (BACKGROUND SCALE FROM ASSUMED 9 FT STALLS, VERIFY)', 'estimated': ' (BACKGROUND SCALE ESTIMATED, VERIFY)',
               'unscaled': ' (BACKGROUND NOT TO SCALE, VERIFY)'}
# top-level keys cd50.py reads, and their types
REQUIRED = {'format': str, 'frame': dict, 'sizing': dict, 'chargers': list, 'items': list, 'routes': list}
OPTIONAL = {'project': dict, 'bollards': list, 'parking': dict, 'landscape': dict, 'site_images': dict, 'tool': dict, 'exported': str}
_WORDS = [('east', 'e'), ('west', 'w'), ('north', 'n'), ('south', 's'), ('boulevard', 'blvd'), ('drive', 'dr'), ('street', 'st'),
          ('avenue', 'ave'), ('northwest', 'nw'), ('northeast', 'ne'), ('southwest', 'sw'), ('southeast', 'se')]


class LayoutError(ValueError):
    pass


def norm_addr(a):
    """Same as normAddr() in the layout tool: one address written different ways compares equal."""
    s = re.sub(r'[.,#]', ' ', str(a or '').lower())
    for w, r in _WORDS: s = re.sub(r'\b%s\b' % w, r, s)
    return re.sub(r'\s+', ' ', s).strip()


def same_addr(a, b):
    return not a or not b or norm_addr(a) == norm_addr(b)


def check(layout):
    """Structural check of a parsed layout. Raises LayoutError; returns warnings."""
    if not isinstance(layout, dict): raise LayoutError('layout.json is not a JSON object')
    warn = []
    fmt = layout.get('format')
    if fmt not in FORMATS: raise LayoutError(f'layout.json format is {fmt!r}; this generator reads {", ".join(FORMATS)}')
    if fmt != CURRENT: warn.append(f'layout.json is {fmt}; re-export it from the layout tool to get {CURRENT}')
    for k, t in REQUIRED.items():
        if not isinstance(layout.get(k), t): raise LayoutError(f'layout.json: "{k}" is missing or not a {t.__name__}')
    for k, t in OPTIONAL.items():
        if layout.get(k) is not None and not isinstance(layout[k], t): raise LayoutError(f'layout.json: "{k}" is not a {t.__name__}')
    fr = layout['frame']
    for k in ('origin_ft', 'size_ft'):
        v = fr.get(k)
        if not (isinstance(v, list) and len(v) == 2 and all(isinstance(n, (int, float)) for n in v)):
            raise LayoutError(f'layout.json: frame.{k} must be [x, y] in feet')
    how = ((fr.get('scale') or {}).get('how')) or 'measured'
    if how not in ('measured', *SCALE_FLAGS): raise LayoutError(f'layout.json: frame.scale.how {how!r} is not one of measured, {", ".join(SCALE_FLAGS)}')
    for i, it in enumerate(layout['items']):
        if not isinstance(it, dict) or not {'id', 'type', 'x', 'y'} <= set(it): raise LayoutError(f'layout.json: items[{i}] needs id, type, x, y')
    for i, g in enumerate(layout['chargers']):
        if not isinstance(g, dict) or g.get('kind') not in ('V4', 'MW') or not isinstance(g.get('posts'), int):
            raise LayoutError(f'layout.json: chargers[{i}] needs kind V4 or MW and a whole number of posts')
    return warn


def _data_uri(path):
    mime = mimetypes.guess_type(path)[0] or 'image/png'
    raw = open(path, 'rb').read()
    return raw, f'data:{mime};base64,' + base64.b64encode(raw).decode('ascii')


def site_images(layout, base_dir):
    """Resolves layout['site_images'] in place to entries with a data URI `src`. Returns warnings for what was left out."""
    warn, out = [], {}
    addr = (layout.get('project') or {}).get('address')
    for k, v in (layout.get('site_images') or {}).items():
        if not isinstance(v, dict): continue
        name = v.get('name') or k
        if not same_addr(v.get('address'), addr):
            warn.append(f'site image "{k}" ({name}) was added for {v["address"]}, not {addr}; left out'); continue
        if isinstance(v.get('src'), str) and v['src'].startswith('data:image/'):
            out[k] = v; continue
        if v.get('file'):
            p = os.path.normpath(os.path.join(base_dir, v['file']))
            if not p.startswith(os.path.normpath(base_dir) + os.sep) or not os.path.isfile(p):
                warn.append(f'site image "{k}": {v["file"]} not found next to layout.json; left out'); continue
            raw, uri = _data_uri(p)
            if v.get('sha256') and hashlib.sha256(raw).hexdigest() != v['sha256']:
                warn.append(f'site image "{k}": {v["file"]} does not match its sha256 (a different file?); left out'); continue
            out[k] = {**v, 'src': uri}; continue
        if v.get('asset_id'): warn.append(f'site image "{k}": asset {v["asset_id"]} was not fetched into the layout; left out')
    layout['site_images'] = out
    return warn


def load_layout(path):
    try: layout = json.load(open(path, encoding='utf-8'))
    except (OSError, ValueError) as e: raise LayoutError(f'cannot read {path}: {e}')
    warn = check(layout)
    warn += site_images(layout, os.path.dirname(os.path.abspath(path)))
    return layout, warn

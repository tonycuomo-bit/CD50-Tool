"""The layout tool in a real browser (Chromium via Playwright): the Aerial Site Sketch round trip, storage across a reload,
dragging every kind of item, Google Earth import, the 9 ft stall scale and Sketch view. Skipped without node or Playwright."""
import io, json, os, shutil, subprocess, zipfile
import pytest
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, 'cd50-layout', 'cd50-layout.html')
KML = '''<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document>
<Placemark><name>Site</name><LookAt><longitude>-105.2211</longitude><latitude>39.7555</latitude><altitude>0</altitude><heading>0</heading>
<tilt>0</tilt><range>300</range></LookAt><Point><coordinates>-105.2211,39.7555,0</coordinates></Point></Placemark>
<Placemark><name>Edge</name><LineString><coordinates>-105.2215,39.7555,0 -105.2207,39.7555,0</coordinates></LineString></Placemark></Document></kml>'''


@pytest.fixture(scope='module')
def run(tmp_path_factory):
    if not shutil.which('node'): pytest.skip('node not installed')
    d = tmp_path_factory.mktemp('browser')
    im = Image.new('RGB', (1600, 1000), (150, 150, 150)); ImageDraw.Draw(im).line([(300, 500), (1300, 500)], fill=(255, 255, 0), width=6); im.save(d / 'ge.jpg')
    with zipfile.ZipFile(d / 'ge.kmz', 'w', zipfile.ZIP_DEFLATED) as z: z.writestr('doc.kml', KML)
    sk = Image.new('RGB', (800, 600), 'white'); ImageDraw.Draw(sk).rectangle([100, 100, 700, 500], outline='black', width=5); sk.save(d / 'sk.png')
    env = dict(os.environ, NODE_PATH=os.pathsep.join(filter(None, [os.environ.get('NODE_PATH'), subprocess.run(['npm', 'root', '-g'], capture_output=True, text=True).stdout.strip()])))
    r = subprocess.run(['node', os.path.join(ROOT, 'tests', 'browser', 'layout_smoke.cjs'), PAGE, str(d)], capture_output=True, text=True, timeout=240, env=env)
    out = json.loads(r.stdout.strip().splitlines()[-1])
    if 'skip' in out: pytest.skip(out['skip'])
    assert 'fatal' not in out, out.get('fatal')
    return out


def test_no_page_errors(run):
    assert run['errors'] == []


def test_sketch_round_trip(run):
    assert run['sketchOpened'] and run['sketchAddress'] == '1201 Main St, Golden, CO' and run['backToLayout']
    assert run['libs']                                   # jsPDF and JSZip are inlined, so exports work offline
    s = run['sent']
    assert s['layout'] and s['slot'] and 'at its scale' in s['note'] and s['scale'].startswith('Scale')


def test_images_survive_reload_outside_localstorage(run):
    r = run['reload']
    assert r['bg'].startswith('data:image/png') and r['slot'] and not r['warn']
    assert r['lsBytes'] < 200_000                        # the images went to IndexedDB, not the ~5 MB localStorage


def test_every_item_drags_without_panning(run):
    for k, v in run['drag'].items():
        assert v and v['moved'] and not v['panned'] and v['select'], (k, v)
    assert run['escSelect']


def test_google_earth_import_and_stall_scale(run):
    assert 'No scale yet' in run['geImage']
    g = run['geKmz']
    assert 'estimated' in g['stat'] and g['refine'] and g['select']
    assert run['stallFt'] == '18' and '2 standard stalls at 9 ft' in run['stallStat']
    assert run["frameScale"] == {"how": "assumed", "by": "2 standard stalls at 9 ft"}


def test_site_images_belong_to_the_address(run):
    ph = run['photos']
    assert ph['a'] and not ph['b'] and ph['back']                      # set aside at another address, back at its own
    assert 'set aside' in ph['note'] and ph['exportB'] == {}
    lot = ph['exportA']['lot']
    assert lot['address'] == '1201 Main St, Golden, CO' and 'src' not in lot and lot['omitted']   # Copy leaves the image out


def test_sketch_for_another_address_is_held_back(run):
    m = run['mismatch']
    assert 'not loaded' in m['text'] and m['button']


def test_download_is_a_zip_with_image_files(run):
    import hashlib, sys
    d = run['download']
    assert d['name'].endswith('-layout.zip')
    with zipfile.ZipFile(d['path']) as z:
        raw = z.read('layout.json').decode('utf-8'); lay = json.loads(raw)
        assert 'data:image' not in raw and lay['format'] == 'cd50-layout/2' and len(lay['tool']['build']) == 12
        lot = lay['site_images']['lot']
        assert lot['file'].startswith('images/lot.') and hashlib.sha256(z.read(lot['file'])).hexdigest() == lot['sha256']
        bg = lay['site_images']['background']                 # the plan background goes out too, for A-101 / E-101 / E-102
        assert bg['file'].startswith('images/background.') and hashlib.sha256(z.read(bg['file'])).hexdigest() == bg['sha256']
        z.extractall(os.path.join(os.path.dirname(d['path']), 'unzipped'))
    # cd50.py's reader takes it as is: the image comes back as a data URI from the file beside layout.json
    sys.path.insert(0, os.path.join(ROOT, 'cd50-plansets')); import layout_io
    got, warn = layout_io.load_layout(os.path.join(os.path.dirname(d['path']), 'unzipped', 'layout.json'))
    assert got['site_images']['lot']['src'].startswith('data:image/') and not [w for w in warn if 'lot' in w]
    assert got['site_images']['background']['src'].startswith('data:image/')


def test_sketch_view_uses_the_sketch_slot(run):
    assert run['sketchView'] == {'pressed': 'true', 'href': 'data:image/png;base64,'}


def test_rotate_toggle_and_group_move(run):
    assert run['rotPressed'] == 'true' and run['rotOff'] == 'true'           # Rotate is a toggle back to Select
    assert 40 < run['rotOne']['d'] < 50                                       # dragged round 45 degrees, not a 15 degree step
    assert run['rotOne']['stayed'] < 0.01 and run['rotOne']['other']          # a single item turns in place, alone
    assert run['groupText']
    g = run['groupMove']                                                      # both selected posts move by the same amount, the rest stay
    assert g['a'] == g['b'] and abs(g['a'][0]) > 1 and g['c'] == [0, 0]
    r = run['groupRot']                                                       # the group turns about its centre and keeps its spacing
    assert r['a'] == 90 and r['b'] == 90 and abs(r['gap'][0] - r['gap'][1]) < 0.05
    assert run['escClears']


def test_site_folder_follows_the_address(run):
    f = run['folder']
    assert f['auto'] == '1201-main-st' and 'sites/1201-main-st/' in f['where']
    assert f['other'] == '555-center-drive-northwest'                         # a new address starts from its own slug
    assert f['back'] == 'golden-main-r2' and f['reload'] == 'golden-main-r2'  # a typed folder is kept for its address


def test_undo_keeps_the_last_four_changes(run):
    u = run['undo']
    assert u['start'][1] and u['at6'][0] > u['at0'][0]                     # nothing to undo at first; six nudges moved the item
    assert u['after6'] == ['↶ Undo (4)', False] and u['afterKey'][0] == '↶ Undo (3)'
    assert u['end'] == ['↶ Undo', True] and u['at6'][0] > u['at2'][0] > u['at0'][0]   # four steps back, not six


def test_download_into_a_chosen_folder(run):
    d = run['saveDir']
    assert d['folder'] == 'golden-main' and 'golden-main' in d['note']
    assert 'layout.json' in d['files'] and d['format'] == 'cd50-layout/2' and 'Saved' in d['button']


def test_start_new_clears_the_layout(run):
    n = run['startNew']
    assert n['asks'] and n['addr0'] and n['cancel']                           # asks first, Cancel keeps everything
    assert n['addr'] == '' and n['gate'] and set(n['idb']) <= {'bg'}            # back at the address step; only the default lot is stored
    assert not (n['bg'] or '').startswith('data:image/jpeg')                 # the uploaded background is gone
    assert n['folder'] == 'golden-main-r3'                                   # a typed site folder is kept for its address

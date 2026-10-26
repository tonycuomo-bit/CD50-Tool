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
    assert run['frameScale'] == {'how': 'measured', 'by': '2 standard stalls at 9 ft'}


def test_sketch_view_uses_the_sketch_slot(run):
    assert run['sketchView'] == {'pressed': 'true', 'href': 'data:image/png;base64,'}

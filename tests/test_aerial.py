"""Aerial finder (tools/aerial.py) and the layout tool's address-first start. No network: the sources are not called."""
import json, os, re, shutil, subprocess, sys
import pytest
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import aerial  # noqa: E402

CFG = json.load(open(aerial.SOURCES, encoding='utf-8'))
TOOL_HTML = open(os.path.join(ROOT, 'cd50-layout', 'cd50-layout.html'), encoding='utf-8').read()   # built from cd50-layout/src/
SITES_JS = open(aerial.TOOL, encoding='utf-8').read()                                                  # src/sites.js


def test_sources_table():
    ids = [s['id'] for s in CFG['sources']]
    assert len(ids) == len(set(ids))
    for s in CFG['sources']:
        assert s['type'] in ('image', 'map') and s['url'].startswith('https://') and not s['url'].endswith('/')
        assert s['license'] in ('public', 'restricted') and s['credit'] and s['gsd_ft'] > 0
        b = s.get('bbox')
        assert b is None or (len(b) == 4 and b[0] < b[2] and b[1] < b[3])
    # a nationwide public-domain fallback must always be there
    assert any(s['bbox'] is None and s['license'] == 'public' for s in CFG['sources'])
    f = CFG['frame']
    assert f['w_ft'] > 0 and f['h_ft'] > 0 and f['ft_per_px'][0] < f['ft_per_px'][1]


def test_ranking_prefers_finer_then_newer():
    c = [{'id': 'naip', 'gsd_ft': 1.97, 'date': '2022-04-25'}, {'id': 'old6in', 'gsd_ft': 0.5, 'date': '2019'},
         {'id': 'new6in', 'gsd_ft': 0.5, 'date': '2024-05-01'}, {'id': 'undated', 'gsd_ft': 0.5, 'date': None}]
    assert [x['id'] for x in sorted(c, key=aerial.rank_key)] == ['new6in', 'old6in', 'undated', 'naip']


def test_local_frame_is_centred_on_the_address_in_us_feet():
    wkt = json.loads(aerial.local_sr(-117.039995, 32.551966))['wkt']
    assert 'Central_Meridian",-117.0399950' in wkt and 'Latitude_Of_Origin",32.5519660' in wkt
    assert 'Scale_Factor",1.0' in wkt and 'Foot_US",0.3048006096012192' in wkt


def test_slug():
    assert aerial.slugify('299 E. San Ysidro Blvd, San Diego, CA 92173') == '299-e-san-ysidro-blvd'


def test_enhance_keeps_size():
    im = Image.effect_noise((140, 105), 40).convert('RGB')
    assert aerial.enhance(im, 1.97, 0.5).size == im.size
    assert not aerial.blank(im) and aerial.blank(Image.new('RGB', (64, 48), 'black'))


@pytest.mark.skipif(not shutil.which('node'), reason='node not installed')
def test_add_to_tool_inserts_then_replaces(tmp_path):
    p = tmp_path / 'sites.js'; p.write_text(SITES_JS, encoding='utf-8')
    meta = {'frame': {'w_ft': 700, 'h_ft': 525}, 'address': '1 Test St, Town, CA', 'geocode': {'lon': -117.0, 'lat': 32.6}, 'credit': 'test'}
    for jpg in (b'first', b'second'):
        aerial.add_to_tool(aerial.sites_entry('zz-test', '1 TEST ST', meta, jpg), 'zz-test', str(p))
    html = p.read_text(encoding='utf-8')
    assert html.count('{id:"zz-test"') == 1 and 'c2Vjb25k' in html          # base64 of b'second'
    subprocess.run(['node', '-e', 'new Function(require("fs").readFileSync(0, "utf8"))'], input=html, text=True, check=True)


def test_layout_tool_requires_the_address():
    assert 'id="addrblock"' in TOOL_HTML and 'id="addr"' in TOOL_HTML and 'gate();' in TOOL_HTML
    assert 'project:{address:S.address' in TOOL_HTML                     # the address goes out with layout.json
    # Enter, leaving the box or Open Aerial Site Sketch commits the address; the old Find aerial search is gone
    assert 'function commitAddress(' in TOOL_HTML and 'id="b-addr"' not in TOOL_HTML and 'FIND_TRIGGER' not in TOOL_HTML


def test_layout_tool_imports_google_earth():
    assert 'id="gefile"' in TOOL_HTML and 'function parseKml(' in TOOL_HTML and 'DecompressionStream("deflate-raw")' in TOOL_HTML
    assert 'function geCalibrate(' in TOOL_HTML


def test_layout_tool_site_images_and_sketch():
    for slot in ('vicinity', 'lot', 'sketch'):
        assert f'data-slot="{slot}"' in TOOL_HTML
    assert 'id="b-sketchapp"' in TOOL_HTML and 'install_box' in TOOL_HTML and 'site_images:photosExport()' in TOOL_HTML
    # Aerial Site Sketch is built in: a second view in a shadow root; its result comes back by the cd50:sketch event
    # (or, from the standalone artifact, by message or paste with its scale note) into the layout area and the sketch slot
    assert 'id="sketchview"' in TOOL_HTML and 'id="sketch-tpl"' in TOOL_HTML and 'attachShadow(' in TOOL_HTML
    assert 'SKETCH: "cd50:sketch"' in TOOL_HTML and 'ADDRESS: "cd50:address"' in TOOL_HTML and 'id="send-layout"' in TOOL_HTML
    assert '"cd50-sketch"' in TOOL_HTML and 'cd50-sketch-ack' in TOOL_HTML and 'cd50-sketch-meta' in TOOL_HTML


@pytest.mark.skipif(not shutil.which('node'), reason='node not installed')
def test_layout_tool_scripts_parse():
    for js in re.findall(r'<script>\n(.*?)</script>', TOOL_HTML, re.S):
        subprocess.run(['node', '-e', 'new Function(require("fs").readFileSync(0, "utf8"))'], input=js, text=True, check=True)


def test_blocked_better_names_sharper_sources_and_their_hosts():
    cands = [{'id': 'usgs-naip-plus', 'name': 'NAIP', 'status': 'ok', 'gsd_ft': 1.97},
             {'id': 'cook-2025', 'name': 'Cook', 'status': 'host not reachable (blocked by network policy or offline)'},
             {'id': 'esri-world-imagery', 'name': 'Esri', 'status': 'skipped (restricted license; use --esri)'}]
    bb = aerial.blocked_better(CFG, cands, cands[0])
    assert [b['id'] for b in bb] == ['cook-2025'] and bb[0]['hosts'] == ['gis.cookcountyil.gov']
    assert aerial.blocked_better(CFG, cands[:1], cands[0]) == []


def test_every_source_host_is_listed_in_claude_md():
    doc = open(os.path.join(ROOT, 'CLAUDE.md'), encoding='utf-8').read()
    for s in CFG['sources']:
        for h in aerial.hosts(s):
            assert f'`{h}`' in doc, f'{h} missing from the network list in CLAUDE.md'

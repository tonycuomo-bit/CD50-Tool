"""Aerial finder (tools/aerial.py) and the layout tool's address-first start. No network: the sources are not called."""
import json, os, re, shutil, subprocess, sys
import pytest
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import aerial  # noqa: E402

CFG = json.load(open(aerial.SOURCES, encoding='utf-8'))
TOOL_HTML = open(aerial.TOOL, encoding='utf-8').read()


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
    p = tmp_path / 'tool.html'; p.write_text(TOOL_HTML, encoding='utf-8')
    meta = {'frame': {'w_ft': 700, 'h_ft': 525}, 'address': '1 Test St, Town, CA', 'geocode': {'lon': -117.0, 'lat': 32.6}, 'credit': 'test'}
    for jpg in (b'first', b'second'):
        aerial.add_to_tool(aerial.sites_entry('zz-test', '1 TEST ST', meta, jpg), 'zz-test', str(p))
    html = p.read_text(encoding='utf-8')
    assert html.count('{id:"zz-test"') == 1 and 'c2Vjb25k' in html          # base64 of b'second'
    js = re.search(r'<script>\n(.*)</script>', html, re.S).group(1)
    subprocess.run(['node', '-e', 'new Function(require("fs").readFileSync(0, "utf8"))'], input=js, text=True, check=True)


def test_layout_tool_requires_the_address():
    assert 'id="addrblock"' in TOOL_HTML and 'id="addr"' in TOOL_HTML and 'gate();' in TOOL_HTML
    assert re.search(r'const FIND_TRIGGER = "trig_\w+"', TOOL_HTML)
    assert 'project:{address:S.address' in TOOL_HTML                     # the address goes out with layout.json

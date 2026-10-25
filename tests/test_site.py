"""Site inputs (sites/<site>/site.json) and the plan set generator. Run: python3 -m pytest"""
import hashlib, json, os, re, shutil, string, subprocess, sys
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITES = os.path.join(ROOT, 'sites')
SITE_IDS = sorted(d for d in os.listdir(SITES) if os.path.isfile(os.path.join(SITES, d, 'site.json')))
GOLDEN = os.path.join(ROOT, 'tests', 'golden')
CTX_KEYS = {'XFMR', 'SVC', 'TOT_KVA', 'TOT_A', 'XF_REQ', 'MW', 'V4', 'NB', 'NBT', 'NBR', 'NBF', 'owner', 'owner_address',
            'owner_contact', 'owner_email', 'architect', 'designer_email', 'architect_phone'}


def load(site_id): return json.load(open(os.path.join(SITES, site_id, 'site.json'), encoding='utf-8'))


@pytest.mark.parametrize('site_id', SITE_IDS)
def test_site_files_exist(site_id):
    s = load(site_id)
    for k, f in s['files'].items():
        if not k.endswith('_caption'): assert os.path.isfile(os.path.join(SITES, site_id, f)), f


@pytest.mark.parametrize('site_id', SITE_IDS)
def test_text_templates_use_known_fields(site_id):
    for key, items in load(site_id)['text'].items():
        for t in (c for i in items for c in (i if isinstance(i, list) else [i])):
            for _, name, _, _ in string.Formatter().parse(t):
                if name is not None: assert name.split('[')[0] in CTX_KEYS, f"{key}: unknown field {{{name}}}"


@pytest.mark.parametrize('site_id', SITE_IDS)
def test_no_contacts_in_site_json(site_id):
    raw = open(os.path.join(SITES, site_id, 'site.json'), encoding='utf-8').read()
    assert not re.search(r'[\w.+-]+@[\w-]+\.[\w.]+', raw), 'emails belong in site_private.json, not site.json'
    assert not re.search(r'\b\d{3}-\d{3}-\d{4}\b', raw), 'phone numbers belong in site_private.json'


@pytest.mark.parametrize('site_id', [s for s in SITE_IDS if os.path.exists(os.path.join(GOLDEN, f'{s}.cd50.html.sha256'))])
def test_generator_matches_golden(site_id, tmp_path):
    """Drawings for a committed site must not change unless intended. Builds from a copy without site_private.json.
    If a change is intended, check the new PDF, then update tests/golden/<site>.cd50.html.sha256 (see CLAUDE.md)."""
    pytest.importorskip('shapely')
    sites = tmp_path / 'sites'      # copy of sites/ without any site_private.json or out/ (sites may share files via ../)
    shutil.copytree(SITES, sites, ignore=shutil.ignore_patterns('site_private.json', 'out'))
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'cd50-plansets', 'cd50.py'), str(sites / site_id)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    out = sites / site_id / 'out'
    got = hashlib.sha256(open(out / 'cd50.html', 'rb').read()).hexdigest()
    want = open(os.path.join(GOLDEN, f'{site_id}.cd50.html.sha256')).read().strip()
    assert got == want, f'{site_id} drawings changed; if intended, set tests/golden/{site_id}.cd50.html.sha256 to {got}'
    data = json.load(open(out / 'cd50_data.json'))
    assert data['xfmr'] and data['svc'] and data['bollards']
    tesla = json.load(open(os.path.join(ROOT, 'rules', 'tesla_rules.json'), encoding='utf-8'))
    cat = [c for c in data['checks'] if c['check'] == 'cat_length']
    assert cat and all(c['ft'] <= tesla['cat_max_ft'] for c in cat), 'a CAT6 run is over the Tesla limit'
    assert {c['run'] for c in cat} >= {r['tag'] for r in data['routes'] if r['tag'].startswith(('DC-', 'COM-'))}


@pytest.mark.parametrize('site_id', [s for s in SITE_IDS if load(s)['files'].get('layout')])
def test_layout_export_format(site_id):
    lay = json.load(open(os.path.join(SITES, site_id, load(site_id)['files']['layout']), encoding='utf-8'))
    tool = open(os.path.join(ROOT, 'cd50-layout', 'cd50-layout.html'), encoding='utf-8').read()
    assert lay['format'] == 'cd50-layout/1' and 'format:"cd50-layout/1"' in tool
    ids = {i['id'] for i in lay['items']}
    assert all(b['item'] in ids for b in lay['bollards']) and all(r['from'] in ids and r['to'] in ids for r in lay['routes'])
    assert {g['kind'] for g in lay['chargers']} == {'MW', 'V4'}       # drawings need one MW and one V4 group for now
    for pl in (lay.get('landscape') or {}).get('plants', []):        # generic plants only; species are picked at CD90
        assert pl['species'] == 'TBD' and pl['dia_ft'] > 0 and f'code:"{pl["code"]}"' in tool


def test_site_images_sheets(tmp_path):
    """Layout tool site_images: vicinity map on G-001, boxed lot image on G-003 and sketch on A-100, before A-101."""
    import base64, io
    from PIL import Image
    def uri(fmt):
        b = io.BytesIO(); Image.new('RGB', (40, 30), 'gray').save(b, fmt); return f'data:image/{fmt.lower()};base64,' + base64.b64encode(b.getvalue()).decode()
    src = os.path.join(SITES, 'san-ysidro-r6'); site = load('san-ysidro-r6')
    site['files'] = {k: (os.path.join(src, v) if k != 'layout' and not k.endswith('_caption') else v) for k, v in site['files'].items()}
    lay = json.load(open(os.path.join(src, site['files']['layout']), encoding='utf-8'))
    lay['site_images'] = {'vicinity': {'src': uri('JPEG')}, 'lot': {'src': uri('JPEG'), 'install_box': [0.2, 0.2, 0.6, 0.7]}, 'sketch': {'src': uri('PNG')}}
    json.dump(site, open(tmp_path / 'site.json', 'w')); json.dump(lay, open(tmp_path / site['files']['layout'], 'w'))
    subprocess.run([sys.executable, os.path.join(ROOT, 'cd50-plansets', 'cd50.py'), str(tmp_path)], check=True, capture_output=True)
    out = open(tmp_path / 'out' / 'cd50.html', encoding='utf-8').read()
    assert 'VICINITY MAP' in out and 'PROPOSED EV CHARGING INSTALL AREA' in out
    nums = re.findall(r'font-size="44"[^>]*>([A-Z]-\d{3})<', out)
    assert nums[:5] == ['G-001', 'G-002', 'G-003', 'A-100', 'A-101'], nums

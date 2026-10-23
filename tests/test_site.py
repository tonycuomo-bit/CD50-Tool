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
    src = os.path.join(SITES, site_id)
    for f in os.listdir(src):
        if os.path.isfile(os.path.join(src, f)) and f != 'site_private.json': shutil.copy(os.path.join(src, f), tmp_path)
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'cd50-plansets', 'cd50.py'), str(tmp_path)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    got = hashlib.sha256(open(tmp_path / 'out' / 'cd50.html', 'rb').read()).hexdigest()
    want = open(os.path.join(GOLDEN, f'{site_id}.cd50.html.sha256')).read().strip()
    assert got == want, f'{site_id} drawings changed; if intended, set tests/golden/{site_id}.cd50.html.sha256 to {got}'
    data = json.load(open(tmp_path / 'out' / 'cd50_data.json'))
    assert data['xfmr'] and data['svc'] and data['bollards']

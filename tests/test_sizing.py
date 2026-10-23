"""Sizing rules (Tony's): cabinets, breakers, transformer, service. Run: python3 -m pytest"""
import json, os, re, shutil, subprocess, sys
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'cd50-plansets')); sys.path.insert(0, os.path.join(ROOT, 'tools'))
from sizing import RULES, size_groups, next_up, egc_al  # noqa: E402

SAN_YSIDRO = [dict(kind="MW", posts=2, kva=1247), dict(kind="V4", posts=8, kva=1247)]
CLEVELAND = [dict(kind="V4", posts=8, kva=499)]


def test_san_ysidro_r2():
    z = size_groups(SAN_YSIDRO)
    assert z['total_kva'] == 2494
    assert z['xfmr'] == 3750 and z['svc'] == 4000 and z['svc_tag'] == 'SB-1'
    assert [g['ocpd'] for g in z['groups']] == [2000, 2000]
    assert not z['derated'] and not z['xf_over'] and not z['svc_over']


def test_cleveland_499kw_is_600a_on_800a_panel():
    z = size_groups(CLEVELAND); g = z['groups'][0]
    assert round(g['amps']) == 600 and g['ocpd'] == 800
    assert z['xfmr'] == 750 and z['svc'] == 800 and z['svc_tag'] == 'PB1'
    assert g['derated'] and g['nameplate'] == 625      # derate table required, not an error


@pytest.mark.parametrize('kva,ocpd', [(625, 1000), (998, 1600), (1247, 2000)])
def test_nameplate_breakers(kva, ocpd):
    g = size_groups([dict(kind="V4", posts=8, kva=kva)])['groups'][0]
    assert g['ocpd'] == ocpd and not g['derated']


@pytest.mark.parametrize('kind,posts,cabs', [("V4", 1, 1), ("V4", 8, 1), ("V4", 9, 2), ("V4", 16, 2),
                                             ("MW", 1, 1), ("MW", 2, 1), ("MW", 3, 2), ("MW", 4, 2)])
def test_cabinet_count(kind, posts, cabs):
    assert size_groups([dict(kind=kind, posts=posts, kva=499)])['cabs'] == cabs


def test_transformer_always_rounds_up():
    for kva in (499, 625, 998, 1247):
        for cabs in (1, 2, 3):
            z = size_groups([dict(kind="V4", posts=8 * cabs, kva=kva)])
            assert z['xfmr'] >= z['xf_req'] or z['xf_over']
    assert next_up(RULES['std_xfmr'], 1500) == 1500         # exact size is not bumped
    assert next_up(RULES['std_xfmr'], 1500.01) == 2000


def test_service_over_5000a_warns():
    z = size_groups([dict(kind="MW", posts=6, kva=1247)])     # 3 cabinets, 4500 A x 1.25 = 5625 A
    assert z['svc_over'] and z['svc'] == 5000 and not z['xf_over']
    z = size_groups([dict(kind="MW", posts=8, kva=1247)])     # 4 cabinets, 4988 kVA x 1.25 > 5000 kVA
    assert z['xf_over']


def test_rules_table_is_consistent():
    for k in ('std_ocpd', 'std_xfmr'):
        assert RULES[k] == sorted(RULES[k])
    for a in RULES['std_ocpd']:
        assert egc_al(a)
    assert [i['kva'] for i in RULES['inputs']] == [499, 625, 998, 1247]


def test_layout_tool_rules_in_sync():
    import sync_rules
    html = open(sync_rules.TOOL, encoding='utf-8').read()
    assert sync_rules.synced(html) == html, 'run python3 tools/sync_rules.py'


CASES = [SAN_YSIDRO, CLEVELAND, [dict(kind="MW", posts=6, kva=1247)], [dict(kind="V4", posts=12, kva=625), dict(kind="MW", posts=2, kva=998)],
         [dict(kind="V4", posts=4, kva=998)], [dict(kind="MW", posts=8, kva=1247)]]


@pytest.mark.skipif(not shutil.which('node'), reason='node not installed')
def test_layout_tool_js_matches_python():
    html = open(os.path.join(ROOT, 'cd50-layout', 'cd50-layout.html'), encoding='utf-8').read()
    js = re.search(r'// BEGIN SIZING\n(.*?)// END SIZING', html, re.S).group(1)
    js += f'\nconsole.log(JSON.stringify({json.dumps(CASES)}.map(sizeGroups)));'
    out = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
    for case, z in zip(CASES, out):
        p = size_groups(case)
        assert (z['totalKva'], z['xfmr'], z['xfOver'], z['svcAmps'], z['svcOver'], z['svcTag'], z['cabs'], z['derated']) == \
               (p['total_kva'], p['xfmr'], p['xf_over'], p['svc'], p['svc_over'], p['svc_tag'], p['cabs'], p['derated'])
        assert z['svcReq'] == pytest.approx(p['svc_req']) and z['xfReq'] == pytest.approx(p['xf_req'])
        for jg, pg in zip(z['G'], p['groups']):
            assert (jg['cabs'], jg['cabOcpd'], jg['nameplate']['kva'], jg['derated']) == (pg['cabs'], pg['ocpd'], pg['nameplate'], pg['derated'])

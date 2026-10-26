"""layout_io: the checks cd50.py runs on layout.json before drawing (format, structure, site images)."""
import base64, hashlib, io, json, os, sys
import pytest
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'cd50-plansets'))
import layout_io

R6 = os.path.join(ROOT, 'sites', 'san-ysidro-r6', 'layout.json')


def png():
    b = io.BytesIO(); Image.new('RGB', (8, 6), 'white').save(b, 'PNG'); return b.getvalue()


def write(tmp_path, lay, files=None):
    for name, data in (files or {}).items():
        p = tmp_path / name; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(data)
    (tmp_path / 'layout.json').write_text(json.dumps(lay)); return str(tmp_path / 'layout.json')


def base():
    lay = json.load(open(R6, encoding='utf-8')); lay['project'] = {'address': '1201 Main St, Golden, CO'}; return lay


def test_committed_layout_is_clean():
    lay, warn = layout_io.load_layout(R6)
    assert warn == [] and lay['format'] == layout_io.CURRENT


def test_addresses_compare_like_the_tool():
    assert layout_io.same_addr('299 E. San Ysidro Blvd', '299 east san ysidro boulevard')
    assert layout_io.same_addr('555 Center Drive Northwest, Walker', '555 Center Dr NW Walker')
    assert not layout_io.same_addr('555 Center Dr NW, Walker, MI', '1201 Main St, Golden, CO')
    assert layout_io.same_addr(None, 'anything')                        # an unknown stamp is not a mismatch


def test_image_file_beside_layout_is_read_and_checked(tmp_path):
    raw = png(); lay = base()
    lay['site_images'] = {'lot': {'name': 'lot.png', 'address': '1201 Main St., Golden, CO', 'file': 'images/lot.png', 'sha256': hashlib.sha256(raw).hexdigest()}}
    got, warn = layout_io.load_layout(write(tmp_path, lay, {'images/lot.png': raw}))
    assert warn == [] and base64.b64decode(got['site_images']['lot']['src'].split(',', 1)[1]) == raw


def test_wrong_site_image_is_left_out(tmp_path):
    lay = base()
    lay['site_images'] = {'lot': {'name': 'Lava island Westminster - Alt - Sat Close.png', 'address': '555 Center Drive Northwest, Walker, MI 49544',
                                  'src': 'data:image/png;base64,' + base64.b64encode(png()).decode()}}
    got, warn = layout_io.load_layout(write(tmp_path, lay))
    assert got['site_images'] == {} and 'Walker' in warn[0] and 'left out' in warn[0]


def test_changed_or_missing_image_file_is_left_out(tmp_path):
    lay = base()
    lay['site_images'] = {'lot': {'file': 'images/lot.png', 'sha256': '0' * 64}, 'vicinity': {'file': 'images/vicinity.png'},
                          'sketch': {'file': '../outside.png'}}
    got, warn = layout_io.load_layout(write(tmp_path, lay, {'images/lot.png': png(), '../outside.png': png()}))
    assert got['site_images'] == {} and len(warn) == 3 and 'sha256' in warn[0]


def test_bad_layouts_are_refused(tmp_path):
    for bad in ({'format': 'cd50-layout/9'}, {**base(), 'items': {}}, {**base(), 'frame': {**base()['frame'], 'scale': {'how': 'guess'}}},
                {**base(), 'chargers': [{'kind': 'XY', 'posts': 2}]}):
        with pytest.raises(layout_io.LayoutError):
            layout_io.load_layout(write(tmp_path, bad))


def test_old_format_warns_and_assumed_scale_is_flagged(tmp_path):
    lay = base(); lay['format'] = 'cd50-layout/1'; lay['frame']['scale'] = {'how': 'assumed', 'by': '2 standard stalls at 9 ft'}
    _, warn = layout_io.load_layout(write(tmp_path, lay))
    assert 're-export' in warn[0] and 'ASSUMED' in layout_io.SCALE_FLAGS['assumed']

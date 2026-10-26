"""cd50-layout/cd50-layout.html is generated from cd50-layout/src/ by tools/build_layout.py; it must be current."""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import build_layout  # noqa: E402


def test_built_page_matches_src():
    cur = open(build_layout.OUT, encoding='utf-8', newline='').read()
    assert cur == build_layout.build(), 'cd50-layout.html is out of date: run python3 tools/build_layout.py'


def test_no_cdn_scripts():
    # the page loads no outside scripts (fonts may come from Google Fonts and fall back to system fonts offline)
    assert not __import__('re').search(r'^<script src=', build_layout.build(), __import__('re').M)

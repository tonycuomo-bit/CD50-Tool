"""Build the single-file layout tool (cd50-layout/cd50-layout.html) from cd50-layout/src/.

Edit the files in src/, then run this. The artifact stays one self-contained HTML file; src/ is where it is edited.
  page.html          head, styles and the layout tool's markup, with include lines
  layout.js          the layout tool's script (includes sites.js)
  sites.js           the SITES array (pre-scaled imagery as data URIs); tools/aerial.py --add-to-tool edits it
  bridge.js          the hand-off between the layout tool and Aerial Site Sketch, used by both scripts
  sketch/            Aerial Site Sketch: sketch.html (template with its styles and markup) and sketch.js
A line that is exactly `<!-- @include NAME -->` is replaced by that file (relative to src/), recursively.
  python3 tools/build_layout.py            write cd50-layout/cd50-layout.html
  python3 tools/build_layout.py --check    exit 1 if the committed file is not what src/ builds
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'cd50-layout', 'src')
OUT = os.path.join(ROOT, 'cd50-layout', 'cd50-layout.html')
INC = re.compile(r'^<!-- @include (\S+) -->\n', re.M)


def expand(name, seen=()):
    if name in seen: sys.exit('include loop: ' + ' -> '.join(seen + (name,)))
    text = open(os.path.join(SRC, name), encoding='utf-8', newline='').read()
    return INC.sub(lambda m: expand(m.group(1), seen + (name,)), text)


def build():
    return expand('page.html')


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    html = build()
    if '--check' in argv:
        cur = open(OUT, encoding='utf-8', newline='').read() if os.path.exists(OUT) else ''
        if cur != html: sys.exit('cd50-layout.html is out of date: run python3 tools/build_layout.py')
        print('cd50-layout.html matches src/'); return
    open(OUT, 'w', encoding='utf-8', newline='').write(html)
    print(f'wrote {os.path.relpath(OUT, ROOT)} ({len(html):,} bytes)')


if __name__ == '__main__':
    main()

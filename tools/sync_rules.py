"""Copy rules/sizing_rules.json (RULES), rules/tesla_rules.json (TESLA) and rules/aerial_sources.json (AERIAL) into the Site Layout tool
(cd50-layout/cd50-layout.html).

Run after editing any of the rules JSON files:  python3 tools/sync_rules.py
Use --check to fail (exit 1) if the tool is out of date instead of writing it.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOL = os.path.join(ROOT, 'cd50-layout', 'cd50-layout.html')
BLOCKS = {name: os.path.join(ROOT, 'rules', f) for name, f in
          (('RULES', 'sizing_rules.json'), ('TESLA', 'tesla_rules.json'), ('AERIAL', 'aerial_sources.json'))}


def pat(name): return re.compile(rf'(// BEGIN {name}[^\n]*\n)const {name} = .*?;\n(// END {name})', re.S)


def block_js(name):
    r = {k: v for k, v in json.load(open(BLOCKS[name], encoding='utf-8')).items() if not k.startswith('_')}
    return f'const {name} = ' + json.dumps(r, ensure_ascii=False, separators=(',', ':')) + ';\n'


def synced(html):
    for name in BLOCKS: html = pat(name).sub(lambda m: m.group(1) + block_js(name) + m.group(2), html, count=1)
    return html


if __name__ == '__main__':
    html = open(TOOL, encoding='utf-8').read()
    for name in BLOCKS:
        if not pat(name).search(html): sys.exit(f'{name} markers not found in ' + TOOL)
    new = synced(html)
    if '--check' in sys.argv:
        sys.exit(0 if new == html else 'cd50-layout.html is out of date; run python3 tools/sync_rules.py')
    open(TOOL, 'w', encoding='utf-8').write(new)
    print('updated' if new != html else 'already in sync')

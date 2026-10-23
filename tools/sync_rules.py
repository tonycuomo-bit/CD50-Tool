"""Copy rules/sizing_rules.json into the Site Layout tool (cd50-layout/cd50-layout.html).

Run after editing the rules JSON:  python3 tools/sync_rules.py
Use --check to fail (exit 1) if the tool is out of date instead of writing it.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES = os.path.join(ROOT, 'rules', 'sizing_rules.json')
TOOL = os.path.join(ROOT, 'cd50-layout', 'cd50-layout.html')
PAT = re.compile(r'(// BEGIN RULES[^\n]*\n)const RULES = .*?;\n(// END RULES)', re.S)


def rules_js():
    r = {k: v for k, v in json.load(open(RULES, encoding='utf-8')).items() if not k.startswith('_')}
    return 'const RULES = ' + json.dumps(r, ensure_ascii=False, separators=(',', ':')) + ';\n'


def synced(html):
    return PAT.sub(lambda m: m.group(1) + rules_js() + m.group(2), html, count=1)


if __name__ == '__main__':
    html = open(TOOL, encoding='utf-8').read()
    if not PAT.search(html): sys.exit('RULES markers not found in ' + TOOL)
    new = synced(html)
    if '--check' in sys.argv:
        sys.exit(0 if new == html else 'cd50-layout.html is out of date; run python3 tools/sync_rules.py')
    open(TOOL, 'w', encoding='utf-8').write(new)
    print('updated' if new != html else 'already in sync')

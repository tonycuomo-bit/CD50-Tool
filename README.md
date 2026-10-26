# CD50 Tool

Tools HiON EV uses to semi-automate CD50 (preliminary construction design) plan sets for Tesla V4 Supercharger and V4 Megacharger sites. See [CLAUDE.md](CLAUDE.md) for the design rules, sizing logic and workflow.

## What's here

| Folder | Contents |
| --- | --- |
| `sites/` | One folder per site: `site.json` (project info, chargers, geometry, sheet text) plus its linework, truck path and aerial. |
| `cd50-layout/` | Site Layout tool, a single self-contained HTML file built from `cd50-layout/src/` by `python3 tools/build_layout.py`. Open it in a browser; edit `src/`, never the built file. |
| `cd50-plansets/` | `cd50.py` plan set generator, `sizing.py`, and `pdf.cjs` PDF printer. `source/` has the WB-67 truck path scripts that regenerate the MW inputs. |
| `cd50-intake/` | Draft intake workbook (question set, derived values, checks). |

## Build a plan set

```
pip install -r requirements.txt
npm install -g playwright            # plus: npx playwright install chromium
cp sites/site_private.example.json sites/san-ysidro/site_private.json   # optional: owner/contact details
python3 cd50-plansets/cd50.py sites/san-ysidro && node cd50-plansets/pdf.cjs sites/san-ysidro
```

Output is `sites/san-ysidro/out/cd50.pdf` (36 x 24 in sheets). A site laid out in the Site Layout tool needs only its exported `layout.json` plus a `site.json` (see `sites/san-ysidro-r6/`). Rename it `<site>_CD50_<YYYY-MM-DD>[_rN].pdf` when issuing. Generated files and `site_private.json` are gitignored, so owner names, emails and phone numbers stay out of git.

## Tests and sizing rules

```
pip install -r requirements-dev.txt
python3 -m pytest
```

Sizing rules live in `rules/sizing_rules.json`. After changing them, run `python3 tools/sync_rules.py` to update the layout tool (it rebuilds it).

## Truck path inputs

To change the Megacharger truck lanes, edit `cd50-plansets/source/cF.json`, run `python3 mw3.py` from `cd50-plansets/source/`, copy `mw_pos.json` and `mw_overlay.svgfrag` into `sites/san-ysidro/`, then rebuild.

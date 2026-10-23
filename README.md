# CD50 Tool

Tools HiON EV uses to semi-automate CD50 (preliminary construction design) plan sets for Tesla V4 Supercharger and V4 Megacharger sites. See [CLAUDE.md](CLAUDE.md) for the design rules, sizing logic and workflow.

## What's here

| Folder | Contents |
| --- | --- |
| `cd50-layout/` | Site Layout tool, a single self-contained HTML file. Open it in a browser. `sites/` holds site aerials (USGS NAIP). |
| `cd50-plansets/` | `cd50.py` plan set generator and `pdf.cjs` PDF printer, with the San Ysidro inputs. `source/` has the WB-67 truck path scripts that regenerate the MW inputs. |
| `cd50-intake/` | Draft intake workbook (question set, derived values, checks). |

## Build a plan set

```
pip install -r requirements.txt
npm install -g playwright            # plus: npx playwright install chromium
cp cd50-plansets/site_private.example.json cd50-plansets/site_private.json   # optional: owner/contact details
python3 cd50-plansets/cd50.py && node cd50-plansets/pdf.cjs
```

Output is `cd50-plansets/cd50.pdf` (36 x 24 in sheets). Rename it `<site>_CD50_<YYYY-MM-DD>[_rN].pdf` when issuing. Generated files and `site_private.json` are gitignored, so owner names, emails and phone numbers stay out of git.

## Truck path inputs

To change the Megacharger truck lanes, edit `cd50-plansets/source/cF.json`, run `python3 mw3.py` from `cd50-plansets/source/`, copy `mw_pos.json` and `mw_overlay.svgfrag` up one level, then rebuild.

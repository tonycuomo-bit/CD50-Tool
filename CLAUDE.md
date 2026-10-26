# CLAUDE.md: CD50 tools (HiON EV)

This repo holds the tools HiON uses to semi-automate CD50 plan sets for Tesla V4 Supercharger and V4 Megacharger (MW) sites. Owner: Tony (HiON). Read this file before changing any tool or drawing.

## Repo layout

```
CLAUDE.md                  this file: rules, tools, workflow, roadmap
README.md                  short setup and build steps
requirements.txt           Python deps (shapely, numpy, Pillow); requirements-dev.txt adds pytest
rules/sizing_rules.json    Tony's sizing rules, the one table both tools use
rules/tesla_rules.json     Tesla design limits (330 ft CAT run, DC trench, clearances, stalls) with sources; both tools use it
rules/aerial_sources.json  free aerial imagery sources (URL, coverage, resolution, date, license); tools/aerial.py uses it
tests/                     pytest suite (sizing rules, Python/JS parity, site inputs, golden drawing hashes, aerial finder, layout build, browser smoke test)
tools/sync_rules.py        copies the rules tables (sizing, Tesla) into the layout tool source, then rebuilds it
tools/build_layout.py      builds cd50-layout/cd50-layout.html from cd50-layout/src/ (--check: fail if stale)
tools/new_site.py          layout tool export -> sites/<slug>/layout.json + a generic starter site.json
tools/aerial.py            address -> best free aerial, georeferenced at an exact ft/px, sharpened; can add it to the layout tool
sites/
  site_private.example.json  template for the gitignored per-site owner/contact file
  san-ysidro/
    site.json              project info, chargers, equipment geometry, sheet text (templates)
    lines_mw2.svg, mw_overlay.svgfrag, mw_pos.json, *.jpg   linework, WB-67 swept path, MW positions, NAIP aerial
    out/                   generated cd50.html / cd50_data.json / cd50.pdf (gitignored)
  san-ysidro-r6/           San Ysidro redrawn in the layout tool (site.json + layout.json, shares ../san-ysidro files); builds r6
cd50-layout/
  cd50-layout.html         Site Layout tool with Aerial Site Sketch built in (single self-contained HTML, GENERATED: do not edit)
  src/                     its source: page.html, layout.js, sites.js, bridge.js, sketch/, vendor/ (jsPDF, JSZip)
cd50-plansets/
  cd50.py                  plan set generator: sites/<site>/site.json -> sites/<site>/out/
  sizing.py                sizing calcs (cabinets, breakers, transformer, service, feeders, EGC)
  pdf.cjs                  Chromium print of out/cd50.html -> out/cd50.pdf (36x24 in)
  source/                  WB-67 truck path scripts that regenerate the MW inputs
cd50-intake/
  CD50 Intake Sheet DRAFT.xlsx   draft question set
```

## Working in this repo

- Private repo, default branch `main`. Do work on a branch and open a PR to `main`; Tony reviews.
- Run `python3 -m pytest` before every PR (needs `pip install -r requirements-dev.txt`; the parity test also needs node).
- After any change to `cd50.py` or a site's inputs, rebuild (`python3 cd50-plansets/cd50.py sites/<site> && node cd50-plansets/pdf.cjs sites/<site>`) and check the printed bollard count and conduit lengths. Look at the PDF for drawing changes.
- `tests/test_site.py` builds each site with a golden file (`tests/golden/<site>.cd50.html.sha256`, built without `site_private.json`) and fails if the drawings changed. A refactor must keep it passing. For an intended drawing change, check the PDF, then update the hash (the test prints the new one) in the same PR and say so.
- Never commit generated files, issued PDFs, `site_private.json`, emails, or architect source PDFs.

## What a CD set is

- **CD50**: first revision of the construction documents (physical design, electrical design, applicable state/national construction and electrical codes, related construction info). This is what these tools produce.
- **CD90**: engineered, goes to Tesla design review and zoning/planning approval.
- **CD100**: reviewed and stamped by a licensed PE, used for permit and construction.
- It is the same document at each stage, maturing toward the stamp. HiON EV is shown as **Designer**. Past sets were prepared by SSC, Inc. for HiON.

## Sheet format (decided)

- 24x36 in sheets (36 x 24 landscape), Tesla templatized plan set look, Tesla **G / E / A / S** numbering.
- Primary template: Tesla `V4 Docs/2026.09.21 - V4 Templatized Plan Set.pdf` (G-001, E-101, E-201/202/203 SLD variants by cabinet rating, E-501/502, A-501 ADA, S-501/502 foundations by wind speed). Megacharger version is in `MW V4/`.
- Keep the SSC extras Tesla's template lacks: site info, GN general notes, specs, ADA, existing/survey sheets.
- Current CD50 sheet list: G-001 Cover (vicinity map when the layout carries one), G-002 General Notes, G-003 Site Location & Proposed Install Area (boxed lot image, layout-mode sites with one), A-100 Aerial Site Sketch (sketch result, when present), A-101 Site Plan & Truck Circulation, L-101 Landscape Plan (layout-mode sites with plants), E-101 Electrical Site Plan, E-102 Enlarged Electrical Plans, E-201 Single-Line Diagram, E-301 Load Calcs & Schedules, S-501 Pad, Foundation & Bollard Details.
- Plan scale 1"=20' (3.6 pt per ft at 72 pt/in); enlarged plans 1"=10'.

## Sizing rules (Tony's rules; do not change without asking)

A short question set drives everything (post counts, product, cabinet input setting).

- **Cabinets**: 1 cabinet per 8 V4 posts; 1 cabinet per 2 MW (Megacharger) posts.
- **Cabinet input choices**: 499 kW minimum (Cleveland/Madisonville design: 600 A on an 800 A panel) or Tesla nameplates 625 / 998 / 1247 kVA. Cabinets are software-limited at commissioning, so a setting below nameplate is intentional. Treat it as an intake input and show Tesla's derate table; never flag it as an error.
- **Cabinet breaker**: cabinet amps (kVA / (480 x sqrt3)) x 1.25, next standard OCPD size.
- **Transformer**: total kVA x 1.25, rounded **UP** to the next standard size (150, 225, 300, 500, 750, 1000, 1500, 2000, 2500, 3000, 3750, 5000). Always upsize; never undersize the service.
- **Service/switchboard**: max(largest cabinet OCPD, 125% of summed cabinet amps), next standard size. Warn above 5000 A.
- **Mixed MW + V4** on one shared transformer and service is supported.
- Example (San Ysidro r2+): MW-1 1247 + V4-1 1247 = 2494 kVA, XR-1 3750 kVA, SB-1 4000 A, 2000 A cabinet breakers.
- **One rules table**: `rules/sizing_rules.json` (standard sizes, factors, posts per cabinet, input choices, feeders, EGC). `cd50-plansets/sizing.py` reads it; `tools/sync_rules.py` copies it into the layout tool's `RULES` block. The tool's `sizeGroups()` (between `// BEGIN SIZING` and `// END SIZING`) mirrors `size_groups()` line for line, and `tests/test_sizing.py` runs both and compares. To change a rule: edit the JSON (with Tony's OK), run `python3 tools/sync_rules.py`, then `python3 -m pytest`.

## Tesla design limits

- `rules/tesla_rules.json` holds the Tesla limits with a source on every rule: V4 Supercharger Design Guide (rev 0, 06/23/25, plotted 04/28/26), V4 Install Manual (12/2025), Commercial Charging Design Manual (rev 03/18/24). Where they differ, the **newest wins** (e.g. V4DG's 24 DC conduits per trench group and 28" max depth replace the CCDM's 16 and 24"). These are Tesla's rules, not Tony's sizing rules: when Tony sends a newer Tesla document, update the JSON and its `sources`, run `python3 tools/sync_rules.py`, then pytest.
- **Run limit**: CAT6 post to cabinet, cabinet to cabinet or cabinet to switchgear max 330 ft (100 m). There is no separate DC conductor length limit in any Tesla document so far. Both tools check every DC, COM and cabinet feeder run (plan length + 10 ft stub-ups): the tool flags it under the conduit schedule, `cd50.py` prints a warning, writes `checks` into `cd50_data.json`, and states the longest run on E-301. `tests/test_site.py` fails if a committed site is over.
- **DC trench**: up to 24 DC post conduits per group, 24" between groups; more than 4 need engineered backfill per Tesla's Rho table. E-301 Table 6 lists all the limits from the JSON `notes`.

## Bollards and clearances

Bollards are required at **all** equipment, in both the drawings and the layout tool. (The Tesla install manual has no bollard rules; "bollard" there means the post frame.)

- **V4 posts**: Tesla templatized S-502 rebounding bollards, 2'-3 3/4" each side of post CL on a 5'-11" x 2'-0" CIP pad, 6" dia, (3) 3/8" SS Hilti KB-TZ2, 2.5" embed.
- **MW drive-thru posts**: MW Design Guide G-102 fig. 4, one bollard 5'-7" from (upstream of) the post.
- **Cabinets / switchboard**: CFC 312 guard posts, 3 ft off, 4 ft o.c. max, front (door side) removable.
- **Transformer**: per utility (Tesla G-001 utility note 4); removable at the doors.
- **Clearances (Tesla)**: cabinet 5' front / 3' sides / 6" back; transformer 3' sides / 8' front.
- **Custom bollards (layout tool)**: the first edit on an item (drag, delete, kind, count) freezes its bollards into a custom list that moves with the item and is exported as-is; a set count is spaced evenly around the guard ring and may exceed 4 ft o.c. Custom lists skip the swept-path filter; the inspector flags any in the truck path.
- **Swept-path skip**: no bollards in the path of traffic. Guard posts that fall inside the truck swept path (buffered 0.5 ft) are dropped: `SWEPT` filter in `cd50.py`, `noBollard` polygon on a SITES entry in the layout tool. Tesla post bollards are always kept.

## Tools

### Site Layout tool (single-file HTML)

- Live: https://claude.ai/artifact/EtmZLbypTPyGDZyL3uGDJc. Source: `cd50-layout/cd50-layout.html` (was `cd50-layout-v6.html` in the shared project folder; older versions stay there, git is the history from now on).
- Features: **0 · Project address** first (required: the other steps stay locked until it is entered; it goes out in layout.json as `project.address`/`geo`). Enter (or leaving the box, or Open Aerial Site Sketch) sets it; saved sites load with Load site. The old in-tool **Find aerial** search was removed (2026-10-26, Tony): site imagery now comes from Aerial Site Sketch and the site image slots, or from `tools/aerial.py --add-to-tool` plus Load site. **Aerial Site Sketch** is built into the page (2026-10-26, Tony): **Open Aerial Site Sketch** (beside the address, and automatically on each new address unless unticked) switches the page to the sketch view with the address filled in; **Back to the layout** returns with the layout untouched. The sketch lives between the `AERIAL SITE SKETCH` markers: its markup and styles in `<template id="sketch-tpl">`, attached to `#sketchview` as a shadow root so its styles and ids stay apart, and its own script after the layout script (Claude tracing via `sample`, monday.com and Google Drive lookups via `mcp`, jsPDF/JSZip from cdnjs). The two talk by window events defined once in `src/bridge.js`: the layout fires `CD50.ADDRESS`; the sketch's **Send to the layout** fires `CD50.SKETCH` with a `CD50.sketchResult()` `{png, ppf, north, scale, scaleSource, address, name}`, and the layout loads the PNG as the plan background at that scale, fills the sketch slot and switches back. Paste and layout keys are ignored while the sketch view is open. The standalone sketch artifact (https://claude.ai/artifact/B7Dy26CLWxtQnVBRmUQXin) is no longer linked; a `cd50-sketch` message from a claude.ai page or a pasted PNG with its `cd50-sketch-meta` note from it still loads. **Site images and sketch** (right after the address): three image slots hold a wide vicinity overhead, a zoomed lot image with the proposed install area boxed (drawn in a large dialog, saved as `install_box` fractions), and the sketch PNG. **Sketch view** shows that Aerial sketch result when the slot has one (a sent sketch at its scale, centred on the site point at 60, 50 ft; a hand-uploaded one fitted to the current image width), else the traced linework of the current image; uploading into the slot turns Sketch view on. They belong to the project address: each is stamped with it, and entering a new address sets the last address's images aside (they come back with that address), so another site's photo never goes out with a layout. A sketch result traced for another address is held back with a **Load it anyway** button, and Load site of a saved site with an address switches to that address. They go out as `site_images` (each with `address` and `sha256`), together with the plan background as a `background` entry: **Download layout** saves `<site>-layout.zip` (layout.json plus `images/<slot>.<ext>`; a plain layout.json when there are none), Build PDF sends asset ids, and Copy layout.json leaves them out. **Import Google Earth** (step 2, or drop the files on the plan) takes a Google Earth Pro saved image plus a KML/KMZ of a placemark (the pin) and, ideally, a path along a long straight edge, saved from the same straight-down, north-up view, in one pick or one at a time. The image shows at once; the KML/KMZ then scales and pins it with no clicks, from the placemark's saved view (LookAt range, ~60° horizontal field of view). **Refine the scale with the Earth path** (two clicks on the path's first and last points) sets the exact ft/px; otherwise check it with Set scale. Tony accepts Google's terms for these preliminary, unstamped layouts (2026-10-24); the tool notes it. Then: sizing panel (V4 / MW / MW + V4), image paste/upload, crop, scale, sketch view, drag/rotate equipment with pads (2026-10-26, Tony: **⟳ Rotate** toolbar toggle turns an item, stall or sign to any angle by dragging round it, Shift snaps to 15°, and the inspectors take a typed 0-360° angle; **multi-select** by Shift/Ctrl-click, the **Multi-select** toggle, or Shift-drag a box on empty space, then drag any selected item to move the group, rotate it about its centre, R / arrow keys for steps and nudges, Delete removes selected parking and plants, Esc clears; conduit bend points stay put), **↶ Undo** (toolbar or Ctrl+Z, 2026-10-26, Tony) steps back through the last 4 layout changes (a change counts once the layout has been still for 0.4 s, so a drag is one step; pan/zoom, the address, site folders and builds are not undone; a new address starts a fresh history), clearances and bollards (toggle + count; drag, delete or set fixed/removable on single bollards, set a per-equipment bollard count, Reset to auto), parking panel (ADA standard CA CBC 11B-812 or federal, striping style, EV stall size, sign catalog, pavement stencil; Stalls at V4 posts, + van / standard / ambulatory accessible EVCS with access aisle, Signs at stalls; accessible-EVCS scoping check), landscaping (generic trees and shrubs T-1..T-4, S-1..S-3 with canopy size, species TBD), auto conduit runs (SL, AC-SPR, DC per post, COM) with bend points, schedule, **Copy layout.json / Download layout** for the plan set generator (format `cd50-layout/2`, described in `cd50-layout/layout-format.md`; `tool.build` is a hash of `src/` stamped by `build_layout.py`). **6 · Plan set PDF** has a **Build PDF with Claude** button: in the claude.ai viewer it fires Tony's "CD50 layout tool: Build PDF" scheduled task (`BUILD_TRIGGER`, via the Claude Code Remote connector, `mcp` capability) with `{build_id, site, notes, layout}`, which wakes a Claude session to build and post the PDF; opened as a local file it downloads the layout and copies a Claude Code prompt. Each build has a status doc `builds/<build_id>` in the page's db (`requested → working → ready {pdf} | failed {msg}`, written by the task with version-pinned writes); the page shows it, resumes watching after a reload, and will not send a second build of the same site while one is open (one with no answer for 30 minutes counts as failed). Aerials fetched by the old Find aerial step (`aerials/<site>` docs marked ready) are listed under Saved site imagery. Build PDF uploads the site images to the page's asset store and sends `site_images` as asset ids (the request is size-limited); the scheduled task fetches them back into `src` before building. Republish with `capabilities: {downloads: true, db: {}, mcp: {servers: [{server: "Claude Code Remote", tools: ["fire_trigger"]}, {server: "monday.com", tools: ["get_board_items_page"]}, {server: "Google Drive", tools: ["search_files"]}]}, sample: {images: true}, assets: {}}` (or omit `capabilities` to keep the stored set).
- Footprints and feeder sets are approximate (CD50 level).
- Sites live in the `const SITES` array: `src` (data URI image), `wFt`, `hFt`, `pin` (image ft), plus optional `place`, `view`, `north`, `sketchSrc` (linework), `mwLayout {posts:[[x,y,rot]],cabs:[...]}`, `svcLayout` (xfmr/svc/ct/mtr), `noBollard` polygon. Users pick one with **Load site**.
- To publish a change: edit the files in `cd50-layout/src/`, run `python3 tools/build_layout.py`, run pytest (the browser test drives the built page in Chromium), commit both, and republish `cd50-layout/cd50-layout.html` to the same artifact URL. Never edit the built file by hand; `tests/test_layout_build.py` fails if it does not match `src/`. No more `-vN` copies.
- Run it: open the HTML file in a browser. It is self-contained (images are data URIs, jsPDF and JSZip are inlined), no server needed and it works offline; fonts come from Google Fonts and fall back to system fonts. Claude tracing, monday and Drive work only in the claude.ai viewer.
- Source layout (`cd50-layout/src/`): `page.html` (head, styles, layout markup, include lines `<!-- @include NAME -->`), `layout.js` (the layout tool; includes `sites.js`, the SITES data that `aerial.py --add-to-tool` edits), `bridge.js` (`CD50`: the hand-off events, `CD50.STALL_FT` = 9 and `CD50.sketchResult()`, the one definition of a sketch result), `sketch/sketch.html` + `sketch/sketch.js` (Aerial Site Sketch), `vendor/` (see its README).
- Storage: the layout goes to localStorage `cd50layout`, image metadata to `cd50photos`; the image data itself (background, its traced sketch, the three site image slots) goes to IndexedDB `cd50layout`, so images cannot fill the ~5 MB localStorage quota. A failed write shows a warning at the top of the side panel.
- Scale: every background carries `scale {how, by}`: `measured` (preset site, a marked length, a Google Earth path), `assumed` (a count of standard 9 ft stalls), `estimated` (Google Earth saved view, a sketch scaled from stalls) or `unscaled`. It shows under step 2 and goes out as `frame.scale` in layout.json; `cd50.py` adds "(BACKGROUND SCALE FROM ASSUMED 9 FT STALLS, VERIFY)", "(BACKGROUND SCALE ESTIMATED, VERIFY)" or "(BACKGROUND NOT TO SCALE, VERIFY)" to the plan view scales and prints a warning. **Standard stalls are 9 ft wide** (Tony, 2026-10-26): Set scale takes a stall count (clicks on stripe centres N stalls apart = 9 x N ft), and Aerial Site Sketch, when no scale bar or length is given, estimates its scale from the median traced stall width (rows of 3+, at least 6 stalls), before its four internal reviews; with an estimated scale the reviews report aisle widths but may not move rows to fit them (that would only make the sketch agree with itself), the final review needs a reason to undo an earlier review, and one review makes at most max(6, 30%) changes. A pass that is cut off is re-run in two halves; Run it again runs only the final review. Every background is placed with its site point at `SITE_PT` (60, 50 ft).

### CD50 plan set generator (`cd50-plansets/cd50.py`)

- Python (shapely, numpy). Builds every sheet as SVG inside one HTML file (`cd50.html`, 36x24 in pages), then Chromium prints it to PDF. Also writes `cd50_data.json` (bollards, conduit routes, xfmr, svc, total kVA).
- Setup (once): `pip install -r requirements.txt` and `npm install -g playwright` (plus `npx playwright install chromium` on a machine without a bundled Chromium; the cloud container already has one at `/opt/pw-browsers/chromium`).
- Run from the repo root, naming the site folder:
  ```
  python3 cd50-plansets/cd50.py sites/san-ysidro && node cd50-plansets/pdf.cjs sites/san-ysidro   # -> sites/san-ysidro/out/
  ```
  `cd50.py` prints the bollard count and conduit route lengths. `pdf.cjs` uses globally installed Playwright and launches `/opt/pw-browsers/chromium`, falling back to Playwright's own Chromium. On a desktop it then opens the PDF and its folder (Explorer / Finder with the file selected); `--no-open`, `CD50_NO_OPEN=1` or `CI` skips that. If the PDF is open in a viewer that locks it, close it and rerun. Copy `out/cd50.pdf` to the dated, revisioned name below. `out/` is gitignored.
- Owner / contact details: keep them out of git anyway (the repo was public at first and may be shared). `cd50.py` reads them from `sites/<site>/site_private.json` (gitignored; copy `sites/site_private.example.json`). Missing fields print as `[PENDING · FROM EMAIL / MONDAY]`. Do not hard-code names, emails or phone numbers in the code.
- Inputs (all in `sites/<site>/`): `site.json` plus the files it names under `files` (aerial, linework SVG, WB-67 swept path, MW positions, or `layout`), and optional `site_private.json`. Paths may point into another site folder (`../san-ysidro/...`).
- **Two geometry modes.** With `files.layout`, the generator takes equipment, pads, front clearances, bollards, conduit paths and the charger groups from `layout.json` (the layout tool export, format `cd50-layout/2`, tool feet; `cd50-plansets/layout_io.py` checks it first and refuses a malformed file). Plan points are `(ft - frame.origin_ft) * 3.6 + linework viewBox origin`; with no linework, the aerial is the plan background. Without it, the hand-placed San Ysidro yard model is used (`geometry` in `site.json`). San Ysidro r5 stays on the yard model until it is redrawn in the tool and Tony approves the new sheets.
- **Choose save folder…** (step 6, 2026-10-26, Tony): picks a folder (File System Access API: Chrome or Edge with the tool opened as a file; the claude.ai viewer refuses folder pickers, so there it says so and downloads as before). The folder handle is kept per address in IndexedDB, its name becomes the Site folder unless it is a generic one (Downloads, Desktop, sites...), and Download layout then writes layout.json and images/ straight into it instead of a zip.
- **Site folder** (step 6 of the tool): `sites/<folder>`, defaulting to the address slug (street part, up to 5 words, same rule as `aerial.py` and `new_site.py`), editable and remembered per address (`S.folders`); a saved site uses its own folder. The note under it says where things are saved. A new site from the tool: `python3 tools/new_site.py layout.json` writes `sites/<slug>/layout.json` and, if missing, a generic `site.json` (address, charger mix, generic notes, utility/AHJ/APN `[TBD]`; no San Ysidro files). PDFs for a new site are named `<folder>_CD50_<date>_rN.pdf`.
- Adding a site from the tool: lay it out (Load site or paste an image, set scale, place equipment, add conduit bend points), Download layout, unzip it into `sites/<site>/` (or save a plain layout.json there), write `sites/<site>/site.json` (copy `san-ysidro-r6/site.json`: `project`, `files`, `text`), then build. If the sizing rules changed after the export, `cd50.py` warns; re-export.
- `layout.json` may carry a `parking` block (stalls with outline and access-aisle polygons, signs with codes, jurisdiction, striping, ADA scoping result); `parking_layout()` draws it on the plans. Tesla rules come from the V4 Supercharger Design Guide (rev 0, 06/23/25): G-101 stall minimum 9' x 17' (10'-6" / 11' wide with side obstructions on one / both sides), G-104 ADA (van 11', 12' in CA, + 5' aisle; standard 9' + 5'; 18' long; optional 2' buffer; 30" x 48" clear floor space at the post; 4" white border and cross striping, NO PARKING 12" letters; fishbone / on-the-line ADA stalls not allowed in CA). They live in `stall` / `ada` in `rules/tesla_rules.json` (the tool's `TESLA_STALL` / `TESLA_ADA`), and the tool uses the larger of Tesla and the jurisdiction. Federal EV scoping uses the 2010 ADA 208.2 parking table as a proxy.
- `layout.json` may carry a `site_images` block (from the tool's site image slots; `layout_io.py` reads each `file` beside layout.json and checks its sha256, takes a `src` data URI as is, and leaves out any image stamped with another address than `project.address`, with a warning): `vicinity` replaces the site aerial on G-001 as the vicinity map; `lot` gets sheet G-003 with its `install_box` (fractions of the image) drawn as the proposed install area; `sketch` gets sheet A-100. Both sheets come right before A-101. Without the block the sheets are unchanged.
- `layout.json` may carry a `landscape` block (`plants`: code, label, tree, dia_ft, size, `species: "TBD"`, xy). With plants, `cd50.py` adds sheet L-101 (landscape plan, planting schedule with species TBD, landscape notes). Species are picked by the landscape architect at CD90.
- Layout-mode sites may be V4-only, MW-only or both (2026-10-26: Tony's V4-only Walker MI layout crashed the generator). The plan background is, in order: `files.aerial`, `files.linework`, a `site_images.background` image, the `site_images.sketch` when its aspect matches the frame, else none (warning). A layout with no bollards prints a warning.
- Layout-mode limits for now: at most one MW group and one V4 group (step 5), conduit labels sit on each run's longest segment, enlarged plan views are fixed-size boxes centred on the equipment, and no dimension strings.
- `site.json` sections: `project` (title block and cover text, utility, AHJ, APN), `files`, `chargers` (groups `{tag, kind: V4|MW, posts, kva, name}` sized by `sizing.py`), `geometry` (north angle, yard placement off a property line, switchboard/transformer offsets in the yard, V4 cabinet and post positions, plan view boxes), and `text` (every notes list and the cover tables). Text entries are Python format templates filled from the sizing and bollard results and `site_private.json`: `{XFMR:,}`, `{SVC:,}`, `{TOT_KVA:,}`, `{MW[kva]}`, `{V4[ocpd]}`, `{NB}`, `{owner}` and so on (the full list is `CTX` in `cd50.py`; `tests/test_site.py` rejects unknown fields). Never put emails or phone numbers in `site.json`.
- Upstream scripts in `cd50-plansets/source/`: `truck.py` (WB-67 kinematics, L1 19.5 / L2 45.5 ft), `cF.json` (truck lane config), `mw3.py` (regenerates the MW input files from `cF.json`; run it from `source/` and copy `mw_pos.json` and `mw_overlay.svgfrag` into `sites/san-ysidro/`), `compose.py`, `site_poly.npy`. Change truck lanes in `cF.json`, rerun `mw3.py`, then `cd50.py`.
- Still San Ysidro-shaped in code (yard model only): the property-line equipment yard and hand-placed conduit trench waypoints and label spots (`ROUTES` section, E-102 dimension strings). `PENDING` marks owner fields waiting on approval.
- Output naming: `<site>_CD50_<YYYY-MM-DD>[_rN].pdf`. Never overwrite a previous revision; bump `_rN`. Issued PDFs go to the shared project folder `cd50-plansets/` and Tony's OneDrive, not git (they carry owner contacts).

### Intake sheet

- `cd50-intake/CD50 Intake Sheet DRAFT.xlsx`: Intake (~85 named fields, dropdowns, Cleveland example), Derived (breaker size, SLD variant, AFC, TSC rule, scope lines), Checks (Lessons Learned IDs), Lists. Draft; its generator script was not saved. The repo copy has the Cleveland example owner replaced with a placeholder.

## Site imagery workflow (no Google)

Tony sends an address (or types it into step 0 of the layout tool); Claude adds the site.

1. Run `python3 tools/aerial.py "<address>" --site <slug> --add-to-tool` (add `--esri` to include Esri World Imagery, reference only; `--list` probes every source; `--lonlat` skips geocoding). It geocodes (SANDAG `SANDAG_COMPOSITE_LOCATOR` address point in San Diego County, preferring the `ADDRESS_APN` PointAddress hit; else the Census geocoder), asks each source in `rules/aerial_sources.json` for its resolution and date at the site (NAIP Plus catalog, Esri metadata layer, nominal values otherwise), probes each with a small export, ranks by resolution then date, and exports the winner into a 700 x 525 ft frame.
2. The frame is a local Transverse Mercator in US survey feet (NAD83, scale 1.0, origin at the address), passed to ArcGIS `exportImage`/`export` as a WKT `bboxSR`/`imageSR`. So ft/px is exact anywhere in the US, true north is up and the pin is the image centre; no state plane zone table is needed. 0.25 ft/px for sources 1 ft or finer, else 0.5 ft/px; frames over the service's max size are exported in tiles and stitched.
3. Improvement: light contrast stretch plus an unsharp mask sized to the source pixels (NAIP at 2 ft native gets a wider radius). It cannot add detail the source lacks; a better source is the only real fix.
4. Output in `sites/<slug>/aerial/`: the enhanced jpg and `aerial.json` (address, geocode, frame WKT, chosen source, every candidate) are committed; `*_raw.jpg` and `candidates.jpg` (side-by-side of every source) are gitignored. `--add-to-tool` adds or replaces the SITES entry (`folder` maps it to `sites/<slug>` for Build PDF). Public-domain/CC0 imagery can be committed; Esri imagery is reference and tracing only, never issued.
5. Sources (`rules/aerial_sources.json`, 35 entries, ranked per site by resolution then date): statewide NC, MD, VA, KY, PA, WV, TN, OH, IN, CT, MO, NY, NJ, OR; metros DC, Philadelphia, Chicago (Cook), Denver/Boulder/Golden (DRAPP, City of Boulder), Champaign, DeKalb GA, Palm Beach and Pinellas FL, San Bernardino, Reno, Maricopa/Phoenix, Fairfax, San Diego (SANDAG); nationwide USGS National Map imagery and NAIP Plus. Restricted (opt-in, reference only): Esri World Imagery and vendor-licensed county imagery (King County/Seattle, Hillsborough/Tampa, Fort Worth). No public service found for Houston, Dallas, LA County (public LARIAC stops at 2014), Atlanta/Fulton, Las Vegas, Minneapolis (WMS only), Utah (key), Georgia statewide, Colorado statewide, MassGIS (tiles only), Madison County IL. Add a service by adding an entry to the JSON.
- Blocked sources: when a nominally sharper source covers the site but does not answer, `aerial.py` prints it and the domains to allow (also saved as `blocked_better` in `aerial.json`), and the tool shows a "Sharper imagery exists" note under the candidates. `python3 tools/aerial.py --domains` prints every host.
- Network: hosts the sources use (`python3 tools/aerial.py --domains`): `basemap.nationalmap.gov`, `citymaps.reno.gov`, `cteco.uconn.edu`, `dcgis.dekalbcountyga.gov`, `di-ingov.img.arcgis.com`, `egis.pinellas.gov`, `gis.bouldercolorado.gov`, `gis.cookcountyil.gov`, `gis.fortworthtexas.gov`, `gis.mcassessor.maricopa.gov`, `gis.pbcgov.org`, `gis.sandag.org`, `gismaps.kingcounty.gov`, `gisportal.champaignil.gov`, `gisportal.jeffco.us`, `imagery.dcgis.dc.gov`, `imagery.nationalmap.gov`, `imagery.oregonexplorer.info`, `imagery.pasda.psu.edu`, `kyraster.ky.gov`, `maps.hillsboroughcounty.org`, `maps.nj.gov`, `maps.ohio.gov`, `maps.pasda.psu.edu`, `maps.sbcounty.gov`, `mdgeodata.md.gov`, `metadata.maptiles.arcgis.com`, `orthos.its.ny.gov`, `services.arcgisonline.com`, `services.gis.nc.gov`, `stateimagery.msdis.missouri.edu`, `tagis.dep.wv.gov`, `tnmap.tn.gov`, `vginmaps.vdem.virginia.gov`, `www.fairfaxcounty.gov`; geocoding `geocoding.geo.census.gov` and `geo.sandag.org`. All of them belong in the cloud environment's allow list. As of 2026-10-23 the cloud reaches the USGS hosts, Ohio, Indiana, Cook County, DRAPP, Boulder, NYS, NJ and Fairfax; `gis.sandag.org` connects but the server resets cloud connections. On Tony's PC (browser or `aerial.py`) there is no such limit. Copyable list: https://claude.ai/artifact/6e2jnHd85RrCgM525tR5Lz
6. Optional engineering sketch: architect AutoCAD PDFs keep layers; `pymupdf` `get_drawings()` gives `d['layer']`. Whitelist BNDY, A-WALL/BUILDING, CURB/PVT-CURB/PVT-CONCRETE, EX-CURB, CL, PVT-STRIPE, DIM, fixtures; drop DEMO-*, hatches, CAR-CLEARENCE, landscape, title block. Apply `page.rotation_matrix`; at 1"=20', 72 pt = 20 ft. Align a Google Earth screenshot with a 2-point similarity fit on curb lines.
- Google Maps/Earth was dropped (no usable API key; terms restrict tracing).
- MW truck layouts are checked with simulated WB-67 swept paths (L1 19.5 ft / L2 45.5 ft).

## Workflow rules

1. Build the CD50 from the agreed design first (layout tool, then generator).
2. Tony reviews and approves the document/layout.
3. Only after approval, fill in ownership/contact/APN details from email and Monday.com. Until then, show `[PENDING · FROM EMAIL / MONDAY]` placeholders.
- HiON EV is Designer. Contractor of record is TBD unless stated.
- Do not modify Tony's local files without asking. Do not send email; draft only.

## Folder locations

- Tony's work folder (Windows, OneDrive): `C:\Users\acuom\OneDrive\Documents\HiON Claude`
- Reference set: `...\HiON Claude\Reference Data and Files\CD50 Design and Data` holds signed CD100 examples (DTC, Madisonville, Golden, Cleveland), Tesla reviews and Review Index, `Lessons Learned.xlsx` (41 lessons, unconfirmed), V4 Docs, MW V4. All PDFs have outlined text, so read them as images. No CAD templates.
- Project shared folder (Claude project files, `/mnt/project-files/`): same subfolders as this repo, plus issued PDFs, older layout tool versions and architect-derived sketches.
- Repo: https://github.com/tonycuomo-bit/CD50-Tool (private since 2026-10-23; default branch `main`).
- Analysis write-up: https://claude.ai/artifact/NJa5JvakJwk2CgqkSgwFpW

## Active site: San Ysidro (299 E. San Ysidro Blvd, San Diego)

- Jack in the Box site; owner, contacts, project number and due dates are kept outside the repo (project memory / `site_private.json`). One combined SDG&E request (8 V4 + MCS).
- Design: coffee pad removed; 2-post MW pull-through in the NW wedge (right-in from EB Beyer, right-turn-only exit to E. Beyer); 8 V4 posts at the former FUTURE EV row; equipment yard parallel to the I-805 (west) PL, 3 ft off it. Sets are in the shared project folder `cd50-plansets/`: `299E-San-Ysidro_CD50_2026-10-23_r5.pdf` (yard model) and `_r8.pdf` (from the layout tool, `sites/san-ysidro-r6`, with the Tesla limits table and L-101 landscape plan; out for review). r6 had the owner line doubled; r7 was an internal step. COM-1 (SPR-1 to MW-1 etherloop) is 310 ft against the 330 ft limit.

## San Ysidro open items

- Equipment yard location still flagged TBD; conduit lengths P-1, SL-1, F-1, F-2, COM-1 are placeholders.
- I-805-side truck lane swept path passes ~0.5 ft from the PL; needs a buffer. No on-site truck queue fits.
- East Beyer bike lane and median added after the architect's plans; drawings pending from the architect.

## Roadmap (priority order)

1. ~~One sizing module with tests.~~ Done: `rules/sizing_rules.json`, `sizing.py`, `tests/test_sizing.py`.
2. ~~Site input file.~~ Done: `sites/<site>/site.json`; San Ysidro output unchanged. Left for later steps: conduit routes and label placement (step 3), V4-only / MW-only / multi-cabinet drawing variants (step 5), and splitting the notes into a shared standard-notes library plus site-specific notes.
3. ~~Layout tool → generator hand-off.~~ Done: the tool exports `layout.json`; `cd50.py` builds from it. San Ysidro is redrawn in the tool as `sites/san-ysidro-r6` (r5 yard, trench bend points and guard posts; 8 stalls with 1C van + 1D standard accessible EVCS, signs). Next: once Tony approves r6, make it the San Ysidro site and retire the yard model; add a primary (P-1) run and dimension strings to the tool export.
4. **Intake → site.json.** Rebuild the intake workbook generator (lost) or read the xlsx directly, so the question set fills `site.json`.
5. **Benchmark sites (Tony, 2026-10-23).** Rebuild finished jobs through the pipeline and compare against the signed CD100s: **Cleveland** for a 499 kW (software-limited) site, and **Golden or Collinsville** for full-capacity sites. This proves the generalization. (Collinsville is not in the reference folder list yet; get its set from Tony if it is the one used.)
6. **Pre-submission checker.** Turn the confirmed Lessons Learned list into automated checks that run on `cd50_data.json`.
7. **CI.** GitHub Action that installs deps, runs tests, builds the PDF and attaches it to the run. Add a SessionStart hook so cloud sessions install deps automatically.
8. **CD90 engineering.** Conduit fill and voltage drop, foundations from geotech plus Tesla S-501/S-502 (wind speed, soil class).

Other notes: the Monday.com connector fails to connect (proxy 403), so monday info currently comes from email notifications.

# CLAUDE.md: CD50 tools (HiON EV)

This repo holds the tools HiON uses to semi-automate CD50 plan sets for Tesla V4 Supercharger and V4 Megacharger (MW) sites. Owner: Tony (HiON). Read this file before changing any tool or drawing.

## Repo layout

```
CLAUDE.md                  this file: rules, tools, workflow, roadmap
README.md                  short setup and build steps
requirements.txt           Python deps (shapely, numpy, Pillow); requirements-dev.txt adds pytest
rules/sizing_rules.json    Tony's sizing rules, the one table both tools use
rules/tesla_rules.json     Tesla design limits (330 ft CAT run, DC trench, clearances, stalls) with sources; both tools use it
rules/aerial_sources.json  free aerial imagery sources (URL, coverage, resolution, date, license); aerial.py and the layout tool use it
tests/                     pytest suite (sizing rules, Python/JS parity, site inputs, golden drawing hashes, aerial finder)
tools/sync_rules.py        copies the rules tables (sizing, Tesla, aerial sources) into the layout tool
tools/aerial.py            address -> best free aerial, georeferenced at an exact ft/px, sharpened; can add it to the layout tool
sites/
  site_private.example.json  template for the gitignored per-site owner/contact file
  san-ysidro/
    site.json              project info, chargers, equipment geometry, sheet text (templates)
    lines_mw2.svg, mw_overlay.svgfrag, mw_pos.json, *.jpg   linework, WB-67 swept path, MW positions, NAIP aerial
    out/                   generated cd50.html / cd50_data.json / cd50.pdf (gitignored)
  san-ysidro-r6/           San Ysidro redrawn in the layout tool (site.json + layout.json, shares ../san-ysidro files); builds r6
cd50-layout/
  cd50-layout.html         Site Layout tool (single self-contained HTML)
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
- Features: **0 · Project address** first (required: the other steps stay locked until it is entered; it goes out in layout.json as `project.address`/`geo`). **Find aerial** loads a saved SITES entry when the address matches one; otherwise it geocodes (Census JSONP, SANDAG point in San Diego County), checks every source in `AERIAL` (from `rules/aerial_sources.json`) that covers the site, ranks by resolution then date, shows the candidates to compare, and loads the best one sharpened, north up, pinned, at an exact ft/px. That works when the browser can reach the sources (opened as a local file). When it can't (the claude.ai viewer blocks outside hosts), it writes `aerials/<site>` `{status: "requested"}` to the page's shared db and fires Tony's "CD50 layout tool: Find aerial" scheduled task (`FIND_TRIGGER`) with `{address, site, esri}`. Claude runs `tools/aerial.py`, uploads the jpg to the artifact's asset store and writes the doc `ready` with `asset_id` (from `tool_doc.json`); the page watches the doc and loads the image by itself, usually 2 to 4 minutes after Find aerial, with no republish or reload. Ready docs show in Fetched site imagery on every open. If the call to Claude fails the page names the error code and copies the `aerial.py` command. **Open Aerial Site Sketch** (beside Find aerial) opens Tony's Aerial Site Sketch artifact (https://claude.ai/artifact/B7Dy26CLWxtQnVBRmUQXin, maintained outside this repo) in a new window, automatically on each new address unless unticked, with the address passed in the link (and copied, with a Paste button there as fallback). **Site images and sketch** (right after the address): three image slots hold a wide vicinity overhead, a zoomed lot image with the proposed install area boxed (drawn in a large dialog, saved as `install_box` fractions), and the sketch PNG brought back from Aerial Site Sketch. They are kept in localStorage `cd50photos` and go out as `site_images` in Copy/Download layout.json (not in the Build PDF request, which is size-limited); `cd50.py` does not use them yet. **Import Google Earth** (step 2) takes a Google Earth Pro saved image plus a KML/KMZ of a placemark (the pin) and, ideally, a path along a long straight edge, saved from the same straight-down, north-up view: two clicks on the path's first and last points set the exact ft/px, and the placemark sets the pin; with no path the scale is estimated from the placemark's saved view (LookAt range, ~60° horizontal field of view) and should be checked with Set scale. Tony accepts Google's terms for these preliminary, unstamped layouts (2026-10-24); the tool notes it. Then: sizing panel (V4 / MW / MW + V4), image paste/upload, crop, scale, sketch view, drag/rotate equipment with pads, clearances and bollards (toggle + count; drag, delete or set fixed/removable on single bollards, set a per-equipment bollard count, Reset to auto), parking panel (ADA standard CA CBC 11B-812 or federal, striping style, EV stall size, sign catalog, pavement stencil; Stalls at V4 posts, + van / standard / ambulatory accessible EVCS with access aisle, Signs at stalls; accessible-EVCS scoping check), landscaping (generic trees and shrubs T-1..T-4, S-1..S-3 with canopy size, species TBD), auto conduit runs (SL, AC-SPR, DC per post, COM) with bend points, schedule, **Copy / Download layout.json** for the plan set generator. **6 · Plan set PDF** has a **Build PDF with Claude** button: in the claude.ai viewer it fires Tony's "CD50 layout tool: Build PDF" scheduled task (`BUILD_TRIGGER`, via the Claude Code Remote connector, `mcp` capability) with `{site, notes, layout}`, which wakes the CD50 Claude session to build and post the PDF; opened as a local file it downloads layout.json and copies a Claude Code prompt. Republish with `capabilities: {downloads: true, mcp: {servers: [{server: "Claude Code Remote", tools: ["fire_trigger"]}]}, db: {}, assets: {}}` (or omit `capabilities` to keep the stored set).
- Footprints and feeder sets are approximate (CD50 level).
- Sites live in the `const SITES` array: `src` (data URI image), `wFt`, `hFt`, `pin` (image ft), plus optional `place`, `view`, `north`, `sketchSrc` (linework), `mwLayout {posts:[[x,y,rot]],cabs:[...]}`, `svcLayout` (xfmr/svc/ct/mtr), `noBollard` polygon. Users pick one with **Load site**.
- To publish a change: edit `cd50-layout/cd50-layout.html`, commit, and republish to the same artifact URL. No more `-vN` copies.
- Run it: open the HTML file in a browser. It is fully self-contained (images are data URIs), no server needed.

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
- **Two geometry modes.** With `files.layout`, the generator takes equipment, pads, front clearances, bollards, conduit paths and the charger groups from `layout.json` (the layout tool export, format `cd50-layout/1`, tool feet). Plan points are `(ft - frame.origin_ft) * 3.6 + linework viewBox origin`; with no linework, the aerial is the plan background. Without it, the hand-placed San Ysidro yard model is used (`geometry` in `site.json`). San Ysidro r5 stays on the yard model until it is redrawn in the tool and Tony approves the new sheets.
- Adding a site from the tool: lay it out (Load site or paste an image, set scale, place equipment, add conduit bend points), Download layout.json, save it as `sites/<site>/layout.json`, write `sites/<site>/site.json` (copy `san-ysidro-r6/site.json`: `project`, `files`, `text`), then build. If the sizing rules changed after the export, `cd50.py` warns; re-export.
- `layout.json` may carry a `parking` block (stalls with outline and access-aisle polygons, signs with codes, jurisdiction, striping, ADA scoping result); `parking_layout()` draws it on the plans. Tesla rules come from the V4 Supercharger Design Guide (rev 0, 06/23/25): G-101 stall minimum 9' x 17' (10'-6" / 11' wide with side obstructions on one / both sides), G-104 ADA (van 11', 12' in CA, + 5' aisle; standard 9' + 5'; 18' long; optional 2' buffer; 30" x 48" clear floor space at the post; 4" white border and cross striping, NO PARKING 12" letters; fishbone / on-the-line ADA stalls not allowed in CA). They live in `stall` / `ada` in `rules/tesla_rules.json` (the tool's `TESLA_STALL` / `TESLA_ADA`), and the tool uses the larger of Tesla and the jurisdiction. Federal EV scoping uses the 2010 ADA 208.2 parking table as a proxy.
- `layout.json` may carry a `site_images` block (data URIs from the tool's site image slots): `vicinity` replaces the site aerial on G-001 as the vicinity map; `lot` gets sheet G-003 with its `install_box` (fractions of the image) drawn as the proposed install area; `sketch` gets sheet A-100. Both sheets come right before A-101. Without the block the sheets are unchanged.
- `layout.json` may carry a `landscape` block (`plants`: code, label, tree, dia_ft, size, `species: "TBD"`, xy). With plants, `cd50.py` adds sheet L-101 (landscape plan, planting schedule with species TBD, landscape notes). Species are picked by the landscape architect at CD90.
- Layout-mode limits for now: one MW group and one V4 group (step 5), conduit labels sit on each run's longest segment, enlarged plan views are fixed-size boxes centred on the equipment, and no dimension strings.
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
5. Sources (`rules/aerial_sources.json`, 35 entries, ranked per site by resolution then date): statewide NC, MD, VA, KY, PA, WV, TN, OH, IN, CT, MO, NY, NJ, OR; metros DC, Philadelphia, Chicago (Cook), Denver/Boulder/Golden (DRAPP, City of Boulder), Champaign, DeKalb GA, Palm Beach and Pinellas FL, San Bernardino, Reno, Maricopa/Phoenix, Fairfax, San Diego (SANDAG); nationwide USGS National Map imagery and NAIP Plus. Restricted (opt-in, reference only): Esri World Imagery and vendor-licensed county imagery (King County/Seattle, Hillsborough/Tampa, Fort Worth). No public service found for Houston, Dallas, LA County (public LARIAC stops at 2014), Atlanta/Fulton, Las Vegas, Minneapolis (WMS only), Utah (key), Georgia statewide, Colorado statewide, MassGIS (tiles only), Madison County IL. Add a service by adding an entry to the JSON, then `python3 tools/sync_rules.py`.
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

# CLAUDE.md: CD50 tools (HiON EV)

This repo holds the tools HiON uses to semi-automate CD50 plan sets for Tesla V4 Supercharger and V4 Megacharger (MW) sites. Owner: Tony (HiON). Read this file before changing any tool or drawing.

## What a CD set is

- **CD50**: first revision of the construction documents (physical design, electrical design, applicable state/national construction and electrical codes, related construction info). This is what these tools produce.
- **CD90**: engineered, goes to Tesla design review and zoning/planning approval.
- **CD100**: reviewed and stamped by a licensed PE, used for permit and construction.
- It is the same document at each stage, maturing toward the stamp. HiON EV is shown as **Designer**. Past sets were prepared by SSC, Inc. for HiON.

## Sheet format (decided)

- 24x36 in sheets (36 x 24 landscape), Tesla templatized plan set look, Tesla **G / E / A / S** numbering.
- Primary template: Tesla `V4 Docs/2026.09.21 - V4 Templatized Plan Set.pdf` (G-001, E-101, E-201/202/203 SLD variants by cabinet rating, E-501/502, A-501 ADA, S-501/502 foundations by wind speed). Megacharger version is in `MW V4/`.
- Keep the SSC extras Tesla's template lacks: site info, GN general notes, specs, ADA, existing/survey sheets.
- Current CD50 sheet list: G-001 Cover, G-002 General Notes, A-101 Site Plan & Truck Circulation, E-101 Electrical Site Plan, E-102 Enlarged Electrical Plans, E-201 Single-Line Diagram, E-301 Load Calcs & Schedules, S-501 Pad, Foundation & Bollard Details.
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
- The sizing code exists in two places: the layout tool JS and the top of `cd50.py`. Keep them identical.

## Bollards and clearances

Bollards are required at **all** equipment, in both the drawings and the layout tool. (The Tesla install manual has no bollard rules; "bollard" there means the post frame.)

- **V4 posts**: Tesla templatized S-502 rebounding bollards, 2'-3 3/4" each side of post CL on a 5'-11" x 2'-0" CIP pad, 6" dia, (3) 3/8" SS Hilti KB-TZ2, 2.5" embed.
- **MW drive-thru posts**: MW Design Guide G-102 fig. 4, one bollard 5'-7" from (upstream of) the post.
- **Cabinets / switchboard**: CFC 312 guard posts, 3 ft off, 4 ft o.c. max, front (door side) removable.
- **Transformer**: per utility (Tesla G-001 utility note 4); removable at the doors.
- **Clearances (Tesla)**: cabinet 5' front / 3' sides / 6" back; transformer 3' sides / 8' front.
- **Swept-path skip**: no bollards in the path of traffic. Guard posts that fall inside the truck swept path (buffered 0.5 ft) are dropped: `SWEPT` filter in `cd50.py`, `noBollard` polygon on a SITES entry in the layout tool. Tesla post bollards are always kept.

## Tools

### Site Layout tool (single-file HTML)

- Live: https://claude.ai/artifact/EtmZLbypTPyGDZyL3uGDJc. Source: `cd50-layout/cd50-layout.html` (was `cd50-layout-v6.html` in the shared project folder; older versions stay there, git is the history from now on).
- Features: sizing panel (V4 / MW / MW + V4), image paste/upload, crop, scale, sketch view, drag/rotate equipment with pads, clearances and bollards (toggle + count), auto conduit runs (SL, AC-SPR, DC per post, COM) with bend points, schedule, JSON export.
- Footprints and feeder sets are approximate (CD50 level).
- Sites live in the `const SITES` array: `src` (data URI image), `wFt`, `hFt`, `pin` (image ft), plus optional `place`, `view`, `north`, `sketchSrc` (linework), `mwLayout {posts:[[x,y,rot]],cabs:[...]}`, `svcLayout` (xfmr/svc/ct/mtr), `noBollard` polygon. Users pick one with **Load site**.
- To publish a change: edit `cd50-layout/cd50-layout.html`, commit, and republish to the same artifact URL. No more `-vN` copies.
- Run it: open the HTML file in a browser. It is fully self-contained (images are data URIs), no server needed.

### CD50 plan set generator (`cd50-plansets/cd50.py`)

- Python (shapely, numpy). Builds every sheet as SVG inside one HTML file (`cd50.html`, 36x24 in pages), then Chromium prints it to PDF. Also writes `cd50_data.json` (bollards, conduit routes, xfmr, svc, total kVA).
- Setup (once): `pip install -r requirements.txt` and `npm install -g playwright` (plus `npx playwright install chromium` on a machine without a bundled Chromium; the cloud container already has one at `/opt/pw-browsers/chromium`).
- Run (the script chdirs to its own folder, so it works from anywhere):
  ```
  python3 cd50-plansets/cd50.py && node cd50-plansets/pdf.cjs   # cd50.html + cd50_data.json, then cd50.pdf (36x24 in)
  ```
  `cd50.py` prints the bollard count and conduit route lengths. `pdf.cjs` uses globally installed Playwright and launches `/opt/pw-browsers/chromium`, falling back to Playwright's own Chromium. Copy `cd50.pdf` to the dated, revisioned name below. Generated files are gitignored.
- Owner / contact details: the repo is public, so they never go in git. `cd50.py` reads them from `cd50-plansets/site_private.json` (gitignored; copy `site_private.example.json`). Missing fields print as `[PENDING · FROM EMAIL / MONDAY]`. Do not hard-code names, emails or phone numbers in the code.
- Inputs it reads (all in `cd50-plansets/`): `mw_pos.json` (MW cabinet/post positions + rotation), `lines_mw2.svg` (site linework with right-turn-only truck exit), `mw_overlay.svgfrag` (WB-67 swept path polygon), optional `site_private.json`, plus the site aerial at `../cd50-layout/sites/`.
- Upstream scripts in `cd50-plansets/source/`: `truck.py` (WB-67 kinematics, L1 19.5 / L2 45.5 ft), `cF.json` (truck lane config), `mw3.py` (regenerates the three MW input files from `cF.json`; run it from `source/` and copy outputs up), `compose.py`, `site_poly.npy`. Change truck lanes in `cF.json`, rerun `mw3.py`, then `cd50.py`.
- It is currently San Ysidro-specific: equipment coordinates, post X positions, yard placement and note text are hard-coded. `PENDING` marks owner/APN fields waiting on approval.
- Output naming: `<site>_CD50_<YYYY-MM-DD>[_rN].pdf`. Never overwrite a previous revision; bump `_rN`. Issued PDFs go to the shared project folder `cd50-plansets/` and Tony's OneDrive, not git (they carry owner contacts).

### Intake sheet

- `cd50-intake/CD50 Intake Sheet DRAFT.xlsx`: Intake (~85 named fields, dropdowns, Cleveland example), Derived (breaker size, SLD variant, AFC, TSC rule, scope lines), Checks (Lessons Learned IDs), Lists. Draft; its generator script was not saved. The repo copy has the Cleveland example owner replaced with a placeholder.

## Site imagery workflow (no Google)

Tony sends an address; Claude adds the site to the layout tool.

1. Geocode: SANDAG `SANDAG_COMPOSITE_LOCATOR/findAddressCandidates` (geo.sandag.org) with `outSR=2230`; use the `ADDRESS_APN` PointAddress hit. Outside San Diego, use the Census geocoder (geocoding.geo.census.gov). APN via SANDAG `Parcels_APN_Locator` reverse geocode (verify against title).
2. Imagery: USGS NAIP `USGSNAIPPlus/ImageServer/exportImage` (imagery.nationalmap.gov) with `bboxSR=imageSR=2230` (CA State Plane VI, US ft) so ft/px is exact. Standard frame 700 x 525 ft at 1400 x 1050 px = 0.5 ft/px. NAIP is ~2 ft native, so it looks blocky up close. Use the state plane zone for the site's state outside CA.
3. Save to `cd50-layout/sites/<site>_0.5ftpx_700x525ft.jpg` and add a SITES entry. NAIP imagery is public domain, so it can be committed. The exported sketch PDFs/JPGs stay in the shared project folder; traced linework the tools need (`lines_mw2.svg`, the layout tool's `sketchSrc`) is committed.
4. Optional engineering sketch: architect AutoCAD PDFs keep layers; `pymupdf` `get_drawings()` gives `d['layer']`. Whitelist BNDY, A-WALL/BUILDING, CURB/PVT-CURB/PVT-CONCRETE, EX-CURB, CL, PVT-STRIPE, DIM, fixtures; drop DEMO-*, hatches, CAR-CLEARENCE, landscape, title block. Apply `page.rotation_matrix`; at 1"=20', 72 pt = 20 ft. Align a Google Earth screenshot with a 2-point similarity fit on curb lines.
- These hosts must be allowed in the environment's network policy. Google Maps/Earth was dropped (no usable API key; terms restrict tracing).
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
- Repo: https://github.com/tonycuomo-bit/CD50-Tool (public).
- Analysis write-up: https://claude.ai/artifact/NJa5JvakJwk2CgqkSgwFpW

## Active site: San Ysidro (299 E. San Ysidro Blvd, San Diego)

- Jack in the Box site; owner, contacts, project number and due dates are kept outside the repo (project memory / `site_private.json`). One combined SDG&E request (8 V4 + MCS).
- Design: coffee pad removed; 2-post MW pull-through in the NW wedge (right-in from EB Beyer, right-turn-only exit to E. Beyer); 8 V4 posts at the former FUTURE EV row; equipment yard parallel to the I-805 (west) PL, 3 ft off it. Latest set: `299E-San-Ysidro_CD50_2026-10-23_r5.pdf` in the shared project folder `cd50-plansets/`.

## Open items

- Generalize `cd50.py`: read site, equipment and sizing from intake JSON instead of hard-coded San Ysidro values; share one sizing module with the layout tool.
- Equipment yard location at San Ysidro still flagged TBD; conduit lengths P-1, SL-1, F-1, F-2, COM-1 are placeholders.
- I-805-side truck lane swept path passes ~0.5 ft from the PL; needs a buffer. No on-site truck queue fits.
- East Beyer bike lane and median added after the architect's plans; drawings pending from the architect.
- Verify max cabinet-to-post DC run vs. Tesla V4 Install Manual; conduit fill and voltage drop at CD90.
- Foundations are placeholders until geotech and Tesla S-501/S-502 (wind speed, soil class) are applied.
- Confirm the Lessons Learned list and wire it into a pre-submission checker.
- Monday.com connector fails to connect (proxy 403); monday info currently comes via email notifications.

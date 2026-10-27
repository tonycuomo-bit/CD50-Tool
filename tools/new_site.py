"""Start a new site folder from a Site Layout tool export: writes sites/<slug>/layout.json and a generic site.json.

  python3 tools/new_site.py <layout.json> [--site <slug>] [--force]

The slug defaults to the layout's address (same rule as tools/aerial.py and the layout tool's Site folder field).
site.json gets the address, the charger mix (V4, MW or both) and generic CD50 notes; utility, AHJ, APN and the
other project fields are [TBD] for Tony to fill in. An existing site.json is kept unless --force (layout.json is
always replaced). No owner or contact details: those go in site_private.json.
"""
import argparse, datetime, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TBD = "[TBD]"


def slugify(s):     # same as tools/aerial.py and the layout tool's siteSlug()
    words = re.sub(r'[^a-z0-9 ]+', ' ', s.lower().split(',')[0]).split()
    return '-'.join(words[:5]) or 'site'


def site_json(lay, slug):
    addr = (lay.get('project') or {}).get('address') or TBD
    parts = [p.strip() for p in addr.split(',')]
    street, rest = parts[0].upper(), ", ".join(parts[1:]).upper()
    ca = bool(re.search(r'\bCA\b|CALIFORNIA', rest))
    G = {g['kind']: g for g in lay['chargers']}; mw, v4 = G.get('MW'), G.get('V4')
    what = " + ".join(f"V4 {'MEGACHARGER' if k == 'MW' else 'SUPERCHARGER'} ({G[k]['posts']} POSTS)" for k in ('MW', 'V4') if k in G)
    equip = " + ".join(f"Tesla V4 {'Megacharger' if k == 'MW' else 'Supercharger'}" for k in ('MW', 'V4') if k in G)
    elec, bldg, acc = ("CEC", "CBC", "CBC 11B") if ca else ("NEC", "IBC", "ICC A117.1 / 2010 ADA Standards")
    summary = [[f"{'Megacharger' if k == 'MW' else 'Supercharger'} posts", f"{g['posts']}  ·  cabinet {g['tag']} @ {{{k}[kva]}} kVA"] for k, g in (('MW', mw), ('V4', v4)) if g]
    breakers = "  ·  ".join(f"{g['tag']} {{{k}[ocpd]}} A" for k, g in (('MW', mw), ('V4', v4)) if g)
    scope = [f"Install ({g['posts']}) Tesla V4 {'Megacharger' if k == 'MW' else 'Supercharger'} posts with cabinet {g['tag']}, at the locations on A-101 and E-101."
             for k, g in (('MW', mw), ('V4', v4)) if g]
    return {
        "_note": f"Started by tools/new_site.py from the layout tool export for {addr}. Fill in the [TBD] project fields (utility, AHJ, APN) and review the notes; owner/contact details go in site_private.json next to this file (gitignored).",
        "id": slug, "short_name": street.title(), "date": datetime.date.today().strftime("%m/%d/%Y"),
        "project": {"title_lines": [street, "EV CHARGING", rest or TBD], "headline": f"{street} · EV CHARGING",
                    "subtitle": f"CD50 PRELIMINARY CONSTRUCTION DESIGN · {what}", "location_line": rest or TBD,
                    "apn_short": "TBD", "utility": "UTILITY TBD", "utility_primary": "UTILITY PRIMARY (VOLTAGE TBD)",
                    "ahj_short": "AHJ TBD", "designer": "HiON EV", "contractor": "TBD"},
        "files": {"layout": "layout.json"},
        "text": {
            "project_data": [["Site address", addr], ["APN", TBD], ["Property owner", "{owner} (to be confirmed)"], ["Owner contact", "{owner_contact}, {owner}"],
                             ["Designer", "HiON EV"], ["Contractor of record", "TBD"], ["Jurisdiction (AHJ)", TBD], ["Electric utility", TBD],
                             ["Charging equipment", equip], ["Zoning", "[TBD AT CD90]"], ["Design stage", "CD50 · first revision, not sealed"]],
            "design_summary": summary + [["Connected load", "{TOT_KVA:,} kVA  ·  {TOT_A:,.0f} A @ 480Y/277 V, 3Ø"],
                               ["Utility transformer", "XR-1 {XFMR:,} kVA pad-mount ({TOT_KVA:,} x 1.25 = {XF_REQ:,.0f} kVA, next size up)"],
                               ["Service equipment", "SB-1 {SVC:,} A switchboard, 480Y/277 V, 3Ø 4W, utility metering section"],
                               ["Cabinet breakers", breakers + "  (125% of cabinet input)"],
                               ["Bollards", "{NB} total: {NBT} Tesla rebounding at posts, {NBF} fixed + {NBR} removable guard posts"]],
            "scope": scope + ["New utility {XFMR:,} kVA pad-mount transformer and new {SVC:,} A, 480Y/277 V switchboard, bollard protected.",
                              "Underground conduit, trenching, pads, foundations, bollards, striping, signage and accessible route improvements for the charging stalls."],
            "applicable_codes": [f"{'California Electrical Code (CEC)' if ca else 'National Electrical Code (NFPA 70) as adopted by the AHJ'}, incl. Art. 625, 230, 240, 250 and 110.",
                                 f"{'California Building Code (CBC) incl. Chapter 11B accessibility' if ca else 'International Building Code as adopted; ICC A117.1 and 2010 ADA Standards for accessibility'}.",
                                 "Local fire code and municipal code of the AHJ.", "Utility electric service requirements and metering standards.",
                                 f"Tesla {equip.replace('Tesla ', '').replace(' + ', ' and ')} installation manuals and templatized plan sets."],
            "project_team": [["Property owner", "{owner} (to be confirmed)", "{owner_address}"], ["Owner contact", "{owner_contact}", "{owner_email}"],
                             ["Designer", "HiON EV", "{designer_email}"], ["Contractor of record", "TBD", ""], ["Electrical engineer of record", "[TBD AT CD90]", ""],
                             ["Utility", TBD, ""], ["Charging equipment", "Tesla", ""]],
            "general_notes": ["This is a CD50 preliminary design for coordination and review only. It is not sealed and shall not be used for permit or construction. Dimensions and equipment locations will be verified at CD90 and CD100.",
                              "Base information is from the aerial / site sketch used in the Site Layout tool and is approximate. A boundary and topographic survey is required before CD90.",
                              "Property owner is shown as {owner} pending confirmation. APN shall be verified against title.",
                              "Contractor shall verify all existing conditions, utilities and dimensions in the field and report discrepancies before starting work.",
                              "Call 811 at least two working days before excavation. Pothole existing utilities at all crossings.",
                              "Restore all disturbed paving, curb, landscaping and irrigation to match existing or better."],
            "truck_notes": (["Megacharger truck stalls are a concept; the civil engineer shall confirm truck circulation with AutoTURN (WB-67) before CD90."] if mw
                            else ["No truck charging on this site; passenger vehicle circulation only."]),
            "electrical_notes": ["Service: utility {XFMR:,} kVA pad-mount transformer XR-1 to {SVC:,} A, 480Y/277 V, 3-phase, 4-wire switchboard SB-1 with utility metering. Final transformer size and primary voltage by the utility.",
                                 "Cabinet breakers are sized at 125% of cabinet input current, next standard size up.",
                                 f"Ground-fault protection of equipment on the main ({elec} 230.95) and arc energy reduction for breakers 1200 A and larger ({elec} 240.87).",
                                 "Cabinet feeders are 3-wire plus EGC with no neutral. Aluminum conductors compact AA-8000 series, XHHW-2.",
                                 "Available fault current, coordination and arc-flash studies at CD90 once the utility provides transformer impedance.",
                                 "Conduit lengths on E-301 are plan estimates plus 10 ft for stub-ups. Voltage drop calculations at CD90."],
            "bollard_notes": ["Provide vehicle impact protection at all electrical equipment: transformer, switchboard, charger cabinets and charger posts. Details on S-501.",
                              "V4 posts (Tesla templatized S-502): rebounding bollard each side of every post, 2'-3 3/4\" from post centerline on the 5'-11\" CIP post pad.",
                              "Cabinets and switchboard: guard posts 6\" dia., concrete filled, 4' above grade, max. 4' on center, 3' from the equipment; removable in front of doors.",
                              "Transformer XR-1: bollards per the utility; removable at the doors."],
            "accessibility_notes": [f"Accessible EV charging spaces per {acc} and the AHJ; see the parking layout on A-101.",
                                    "30\" x 48\" clear floor space at each accessible charge post; accessible route to the charger (Tesla G-104).",
                                    "Access aisle: 4\" border and cross striping, NO PARKING in 12\" letters. Accessible EVCS signs per AHJ."],
            "open_items": ["Confirm owner / lessee entity, verify APN, and name the contractor of record.", "Name the utility and AHJ; set the POC, primary voltage and transformer size with the utility.",
                           "Boundary / topo survey and utility locate.", "Confirm cabinet input settings.", "Geotechnical report for pad and post foundations.",
                           "Confirm accessible stall layout with the AHJ."],
            "a101_keynotes": ["Equipment: XR-1 transformer and SB-1 switchboard; location per the Site Layout tool, pending utility and owner review."]
                             + [f"Tesla V4 {'Megacharger' if k == 'MW' else 'Supercharger'} cabinet {g['tag']} and its posts." for k, g in (('MW', mw), ('V4', v4)) if g],
            "a101_site_data": [f"Address: {addr}."],
            "e101_notes": ["Conduit routes are schematic. Final routing, depth and crossings at CD90 after survey and utility locate.",
                           "Separate DC from AC per Tesla requirements.", "Shaded areas are working / door clearances.",
                           "Bollards protect all equipment; open circles are removable. See S-501.", "See E-201 for the single-line diagram and E-301 for feeder and conduit schedules."],
            "e102_notes": ["Cabinet 5'-0\" front clearance, 3' sides, 6\" back (Tesla). Transformer 3' sides, 8' at the doors.",
                           "Switchboard working space per code; bollards per S-501."],
            "sld_notes": ["Equipment ratings are preliminary and follow the CD50 sizing rules: transformer = total cabinet kVA x 1.25, next standard size up; breakers = 125% of cabinet input; service = 125% of summed cabinet amps.",
                          "Cabinet input settings are assumptions until confirmed.", "SB-1 AIC rating, coordination and arc-flash labels from studies at CD90."],
            "structural_notes": ["Foundations are placeholders until the geotechnical report and the Tesla templatized S-501/S-502 (wind speed and soil class) are applied at CD90.",
                                 "Concrete f'c = 3,000 psi min. at 28 days for pads and bollard footings unless Tesla or the utility require more."],
        }}


def main(argv=None):
    a = argparse.ArgumentParser(description=__doc__.split('\n')[0]); a.add_argument('layout'); a.add_argument('--site'); a.add_argument('--force', action='store_true')
    a = a.parse_args(argv)
    lay = json.load(open(a.layout, encoding='utf-8'))
    slug = a.site or slugify((lay.get('project') or {}).get('address') or '')
    if slug == 'site': sys.exit("the layout has no project address; pass --site <slug>")
    d = os.path.join(ROOT, 'sites', slug); os.makedirs(d, exist_ok=True)
    json.dump(lay, open(os.path.join(d, 'layout.json'), 'w', encoding='utf-8'), indent=1)
    sj = os.path.join(d, 'site.json')
    if os.path.exists(sj) and not a.force: print(f"kept {os.path.relpath(sj, ROOT)}")
    else: json.dump(site_json(lay, slug), open(sj, 'w', encoding='utf-8'), indent=2, ensure_ascii=False); print(f"wrote {os.path.relpath(sj, ROOT)}")
    print(f"sites/{slug}"); return slug


if __name__ == '__main__': main()

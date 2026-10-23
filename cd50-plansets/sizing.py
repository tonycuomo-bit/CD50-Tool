"""CD50 sizing: cabinets, breakers, transformer, service, feeders.

Rules come from rules/sizing_rules.json, the same table the Site Layout tool uses
(tools/sync_rules.py copies it into cd50-layout.html). This mirrors sizeGroups() in the
tool line for line; tests/test_sizing.py checks that the two agree.
"""
import json, math, os

RULES = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'rules', 'sizing_rules.json')))
SQ3 = math.sqrt(3)


def next_up(sizes, v):
    """Smallest standard size >= v. Past the largest size, returns the largest (caller checks the *_over flag)."""
    return next((x for x in sizes if x >= v - 1e-6), sizes[-1])


def feeder(amps):
    """(parallel sets, conductor) for a breaker or service rating."""
    f = next(f for f in RULES['feeders'] if f['max_amps'] is None or amps <= f['max_amps'])
    return math.ceil(amps / f['amps_per_set']), f['cond']


def egc_al(ocpd):
    """Aluminum equipment grounding conductor for an OCPD rating (NEC 250.122)."""
    return RULES['egc_al'][str(ocpd)]


def nameplate(kva):
    """Tesla nameplate a cabinet input setting falls under (499 kW sits under 625 kVA)."""
    plates = RULES['inputs'][1:]
    return next((i for i in plates if i['kva'] >= kva), plates[-1])


def size_groups(groups):
    """groups: [{kind: 'V4'|'MW', posts, kva, ...}] on one service. kva is the per-cabinet input setting.

    Returns the groups with cabinet count/amps/breaker/feeder added, plus service totals.
    """
    R = RULES
    G = []
    for g in groups:
        per_cab = R['posts_per_cabinet'][g['kind']]
        cabs = max(1, math.ceil(g['posts'] / per_cab))
        amps = g['kva'] * 1000 / (R['volts'] * SQ3)
        ocpd = next_up(R['std_ocpd'], amps * R['ocpd_factor'])
        plate = nameplate(g['kva'])
        G.append({**g, 'per_cab': per_cab, 'cabs': cabs, 'amps': amps, 'ocpd': ocpd, 'feeder': feeder(ocpd),
                  'nameplate': plate['kva'], 'derated': g['kva'] < plate['kva']})
    total_kva = sum(g['kva'] * g['cabs'] for g in G)
    total_amps = sum(g['amps'] * g['cabs'] for g in G)
    xf_req = total_kva * R['xfmr_factor']
    svc_req = max(max(g['ocpd'] for g in G), total_amps * R['service_factor'])
    svc = next_up(R['std_ocpd'], svc_req)
    panel = svc <= R['panelboard_max_amps']
    return {
        'groups': G, 'cabs': sum(g['cabs'] for g in G), 'total_kva': total_kva, 'total_amps': total_amps,
        'xf_req': xf_req, 'xfmr': next_up(R['std_xfmr'], xf_req), 'xf_over': xf_req > R['std_xfmr'][-1],
        'svc_req': svc_req, 'svc': svc, 'svc_over': svc_req > R['std_ocpd'][-1], 'svc_feeder': feeder(svc),
        'svc_type': 'Panelboard' if panel else 'Switchboard', 'svc_tag': 'PB1' if panel else 'SB-1',
        'derated': any(g['derated'] for g in G),
    }

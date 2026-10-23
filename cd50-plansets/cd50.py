# CD50 plan set generator: 299 E. San Ysidro Blvd. Writes cd50.html (36x24 in pages) for Chromium print-to-PDF.
import math, json, base64, re, html, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))  # inputs and outputs live next to this script
from shapely.geometry import box as sbox, Polygon
import numpy as np

F = 3.6                       # plan pts per ft (1"=20' at 72 pt/in)
W, H = 2592, 1728             # 36x24 in sheet in pt
DATE = "10/23/2026"
PENDING = "[PENDING · FROM EMAIL / MONDAY]"
# Owner / contact details are filled in only after Tony approves the layout, and are kept out of git:
# copy site_private.example.json to site_private.json (gitignored). Missing fields print as PENDING.
PRIV = json.load(open('site_private.json')) if os.path.exists('site_private.json') else {}
pv = lambda k: PRIV.get(k) or PENDING

# ---------------------------------------------------------------- sizing (sizing.py, same rules table as the Site Layout tool)
from sizing import size_groups, egc_al
groups = [dict(tag="MW-1", kind="MW", posts=2, kva=1247, name="V4 Megacharger cabinet (2 posts)"),
          dict(tag="V4-1", kind="V4", posts=8, kva=1247, name="V4 Supercharger cabinet (8 posts)")]
Z = size_groups(groups); groups = Z['groups']
TOT_KVA, TOT_A, XF_REQ, XFMR, SVC_REQ, SVC, SVCF = (Z[k] for k in ('total_kva', 'total_amps', 'xf_req', 'xfmr', 'svc_req', 'svc', 'svc_feeder'))
if Z['xf_over'] or Z['svc_over']: print(f"WARNING: load exceeds the largest standard size (xfmr {XF_REQ:,.0f} kVA, service {SVC_REQ:,.0f} A)")
MW, V4 = groups

# ---------------------------------------------------------------- equipment geometry (plan pts, svg frame of lines_mw.svg)
mwp = json.load(open('mw_pos.json')); TH = math.radians(mwp['rot'])
E = np.array([math.cos(TH), math.sin(TH)]); N = np.array([math.sin(TH), -math.cos(TH)])
# Equipment yard tucked against the west (I-805) property line (Tony, CD50 review): long side parallel to the PL,
# 3 ft off it, equipment backs to the PL. Drawn axis-aligned about pivot (yx, yy) and rotated by YROT; ROT() maps to plan.
PL_A, PL_B = np.array([260.7, 182.9]), np.array([446.1, 404.6])          # I-805 PL segment, display ft
_u = (PL_B-PL_A)/np.linalg.norm(PL_B-PL_A); _n = np.array([_u[1], -_u[0]])  # along PL (SE), inward normal (NE)
YROT = math.degrees(math.atan2(_u[1], _u[0]))
YARD_S, YARD_GAP = 100, 3                                                  # ft along the PL from its NW vertex, ft off the PL
_O = (PL_A + YARD_S*_u + (20+YARD_GAP)*_n)*F
YARD = (_O[0], _O[1], 42, 20)
yx, yy = YARD[0], YARD[1]
def ROT(p):
    c, s_ = math.cos(math.radians(YROT)), math.sin(math.radians(YROT)); dx, dy = p[0]-yx, p[1]-yy
    return (yx + dx*c - dy*s_, yy + dx*s_ + dy*c)
YG = f'transform="rotate({YROT:.3f} {yx:.2f} {yy:.2f})"'
SB = (yx+2*F, yy+11.8*F, 16.7, 6.2)                         # pad x,y,w,d (ft), local; back 2 ft off the PL-side yard edge
XR = (yx+24*F, yy+9*F, 9.0, 9.0)                            # >2500 kVA pad (tool xfmrDims); doors face local +x (SE)
V4C = (1608, 678, 5.6, 4.9)
POSTX = [1728.7, 1766.7, 1801.7, 1865.3, 1903.3, 1941.0, 1979.0, 2017.0]; POSTY = 711
POSTS = [(x, POSTY, "1"+"ABCDEFGH"[i]) for i, x in enumerate(POSTX)]
MWC = np.array(mwp['cab'])*F; MP = [(np.array(mwp['post1'])*F, "M1A"), (np.array(mwp['post2'])*F, "M1B")]

def rect_pts(x, y, w, d): return [(x, y), (x+w*F, y), (x+w*F, y+d*F), (x, y+d*F)]
def rot_rect(c, w, d):
    hw, hd = w*F/2, d*F/2
    return [tuple(c + a*E*hw + b*N*hd) for a, b in ((-1,-1),(1,-1),(1,1),(-1,1))]

# bollards: points along an offset ring around a polygon, sides chosen by index, spacing <= 4 ft
def ring(poly, off, sides, sp=4.0, removable=()):
    P = Polygon(poly).buffer(off*F, join_style=2).exterior.coords[:-1]
    P = [np.array(p) for p in P]
    # match each buffered corner to nearest original corner order
    out = []
    n = len(P)
    cen = np.mean(poly, axis=0); ang = lambda p: math.atan2(p[1]-cen[1], p[0]-cen[0])
    orig = [np.array(p) for p in poly]
    order = [min(range(n), key=lambda j: np.linalg.norm(P[j]-o)) for o in orig]
    Q = [P[j] for j in order]
    for s in sides:
        a, b = Q[s], Q[(s+1) % 4]; L = np.linalg.norm(b-a)/F; k = max(1, math.ceil(L/sp))
        for i in range(k+1):
            out.append((tuple(a+(b-a)*i/k), s in removable))
    # dedupe corners
    res = []
    for p, r in out:
        if all(np.hypot(p[0]-q[0], p[1]-q[1]) > 1.0 for q, _ in res): res.append((p, r))
    return res

yard_poly = rect_pts(yx, yy, YARD[2], YARD[3])
B_YARD = [(ROT(p), r) for p, r in ring(yard_poly, 1.0, [0,1,3], removable=(1,))]   # no posts on the PL side; SE end (XR-1 doors) removable
v4c_poly = rect_pts(*V4C)
B_V4C = ring(v4c_poly, 3.0, [1,2,3], removable=(2,))           # north side is landscape at PL
B_POST = []
for x, y, _ in POSTS:
    for dx in (-2.3125, 2.3125): B_POST.append(((x+dx*F, y), "rebound"))     # Tesla S-502: 2'-3 3/4" each side of post CL on 5'-11" CIP pad
mwc_poly = rot_rect(MWC, 6.2, 5.0)
B_MWC = ring(mwc_poly, 3.0, [1,2,3], removable=(2,))
B_MP = []
for p, _ in MP:
    B_MP.append((tuple(p - 5.583*E*F), "rebound"))                          # Tesla MW guide G-102 fig. 4: bollard 5'-7" from post, drive-thru
def kinds(b): return [(p, ("removable" if r else "fixed") if isinstance(r, bool) else r) for p, r in b]
# drop any bollard that would sit inside the WB-67 swept path (Tony: none in the path of traffic)
from shapely.geometry import Point as _Pt
_frag = open('mw_overlay.svgfrag').read()
SWEPT = Polygon([tuple(map(float, q.split(','))) for q in re.findall(r'<polygon points="([^"]+)"', _frag)[0].split()])
def clear_path(b): return [(p, r) for p, r in b if not SWEPT.buffer(0.5*F).contains(_Pt(p))]
B_YARD, B_V4C, B_MWC = [clear_path(kinds(b)) for b in (B_YARD, B_V4C, B_MWC)]
BOLLARDS = B_YARD + B_V4C + B_POST + B_MWC + B_MP
NB = len(BOLLARDS); NBR = sum(1 for _, r in BOLLARDS if r == "removable"); NBT = sum(1 for _, r in BOLLARDS if r == "rebound")

# ---------------------------------------------------------------- conduit routes (plan pts)
sbE = ROT((SB[0]+SB[2]*F, SB[1]+SB[3]*F/2)); xrW = ROT((XR[0], SB[1]+SB[3]*F/2))
_xrN = ROT((XR[0]+XR[2]*F/2, XR[1])); _pa = ROT((SB[0]+12*F, yy-4*F)); _pac = ROT((SB[0]+12*F, yy-3*F))
_sbW = ROT((SB[0], SB[1]+SB[3]*F/2)); _sbWo = ROT((yx-4*F, SB[1]+SB[3]*F/2)); _cnw = ROT((yx-3*F, yy-3*F)); _cw = ROT((yx-3*F, SB[1]+SB[3]*F/2-3))
V4cS = (V4C[0]+V4C[2]*F, V4C[1]+V4C[3]*F*0.6)
ROUTES = [
  dict(tag="P-1", kind="pri", pts=[_xrN, ROT((XR[0]+XR[2]*F/2, yy-6*F)), (ROT((XR[0]+XR[2]*F/2, yy-6*F))[0], 640)], n="(2) 5\"", size='5"',
       cond="SDG&E primary cable (by utility)", fr="SDG&E POC (Beyer Blvd, TBD)", to="XR-1", note="Trench/conduit by owner per SDG&E design"),
  dict(tag="SL-1", kind="ac", pts=[xrW, sbE], n=f"({SVCF[0]}) 4\"", size='4"',
       cond=f"{SVCF[0]} sets (3) {SVCF[1]} + (1) neutral per set", fr="XR-1", to="SB-1", note="Service lateral, customer-owned"),
  dict(tag="F-1", kind="ac", pts=[_sbW, _sbWo, (MWC[0]+12, MWC[1]+14)], n=f"({MW['feeder'][0]}) 4\"", size='4"',
       cond=f"{MW['feeder'][0]} sets (3) {MW['feeder'][1]} + (1) {egc_al(MW['ocpd'])} EGC", fr=f"SB-1 ({MW['ocpd']} A)", to="MW-1", note="No neutral"),
  dict(tag="F-2", kind="ac", pts=[ROT((SB[0]+12*F, SB[1])), _pa, (_pa[0], 852), (1592, 852), (1592, 700), (V4C[0], V4C[1]+V4C[3]*F/2)], n=f"({V4['feeder'][0]}) 4\"", size='4"',
       cond=f"{V4['feeder'][0]} sets (3) {V4['feeder'][1]} + (1) {egc_al(V4['ocpd'])} EGC", fr=f"SB-1 ({V4['ocpd']} A)", to="V4-1", note="No neutral"),
]
for i, (x, y, t) in enumerate(POSTS):
    ROUTES.append(dict(tag=f"DC-{t}", kind="dc", pts=[V4cS, (V4cS[0]+6, 703+0*i), (x, 703), (x, y)], n="(1) 4\"", size='4"',
        cond="(4) 600 kcmil AL (2+, 2-), #2/0 CU EGC, Tesla signal wire", fr="V4-1", to=f"POST {t}", note="Common trench in planter"))
for p, t in MP:
    ROUTES.append(dict(tag=f"DC-{t}", kind="dc", pts=[tuple(MWC), tuple(p)], n="(2) 4\"", size='4"',
        cond="2 sets (4) 750 kcmil AL, EGC, Tesla signal wire", fr="MW-1", to=f"POST {t}", note="Verify fill; upsize to 5\" if required"))
ROUTES.append(dict(tag="COM-1", kind="com", pts=[(V4C[0], V4C[1]+V4C[3]*F/2), (1588, 703), (1588, 848), (_pac[0]-4, 848), _pac, _cnw, _cw, (MWC[0]+8, MWC[1]+18)],
    n='(1) 1-1/4"', size='1-1/4"', cond="(2) CAT6 shielded (etherloop)", fr="V4-1", to="MW-1", note="Shares F-1/F-2 trench"))
def plen(p): return sum(math.hypot(p[i][0]-p[i-1][0], p[i][1]-p[i-1][1]) for i in range(1, len(p)))/F
for r in ROUTES: r['len'] = round(plen(r['pts']) + (0 if r['kind'] == 'pri' else 10))

# ---------------------------------------------------------------- svg helpers
esc = html.escape
def T(x, y, s, sz=12, a="start", w="normal", fill="#141817", rot=0, ff=None, extra=""):
    tr = f' transform="rotate({rot} {x} {y})"' if rot else ""
    f = f' font-family="{ff}"' if ff else ""
    return f'<text x="{x:.1f}" y="{y:.1f}" font-size="{sz}" text-anchor="{a}" font-weight="{w}" fill="{fill}"{tr}{f}{extra}>{esc(str(s))}</text>'
def R(x, y, w, h, fill="none", st="#141817", sw=1, extra=""): return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" fill="{fill}" stroke="{st}" stroke-width="{sw}"{extra}/>'
def L(x1, y1, x2, y2, st="#141817", sw=1, extra=""): return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{st}" stroke-width="{sw}"{extra}/>'
def PL(pts, st="#141817", sw=1, fill="none", extra=""): return f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" fill="{fill}" stroke="{st}" stroke-width="{sw}"{extra}/>'
def PG(pts, fill="none", st="#141817", sw=1, extra=""): return f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" fill="{fill}" stroke="{st}" stroke-width="{sw}"{extra}/>'
def wrap(s, n):
    out, cur = [], ""
    for wd in s.split():
        if len(cur) + len(wd) + 1 > n: out.append(cur); cur = wd
        else: cur = (cur + " " + wd).strip()
    if cur: out.append(cur)
    return out
def para(x, y, s, n, sz=11, lh=None, **k):
    lh = lh or sz*1.35; o = []
    for i, ln in enumerate(wrap(s, n)): o.append(T(x, y+i*lh, ln, sz, **k))
    return "".join(o), y + len(wrap(s, n))*lh
def notes(x, y, title, items, n=70, sz=11, num=True):
    o = [T(x, y, title, 14, w="bold"), L(x, y+5, x+n*sz*0.52, y+5, sw=1)]; y += 24
    for i, it in enumerate(items, 1):
        lab = f"{i}." if num else "•"
        o.append(T(x, y, lab, sz, w="bold"))
        s, y = para(x+24, y, it, n-4, sz); o.append(s); y += 4
    return "".join(o), y
def table(x, y, cols, rows, rh=20, sz=10.5, head="#e7ecea"):
    o = []; tw = sum(c[1] for c in cols)
    o.append(R(x, y, tw, rh, fill=head, sw=1))
    cx = x
    for c in cols: o.append(T(cx+5, y+rh-6, c[0], sz, w="bold")); cx += c[1]
    yy = y + rh
    for r in rows:
        bold = isinstance(r, dict); cells = r['c'] if bold else r
        o.append(R(x, yy, tw, rh, fill="#f6f8f7" if bold else "none", sw=0.7))
        cx = x
        for c, v in zip(cols, cells):
            o.append(T(cx+5, yy+rh-6, v, sz, w="bold" if bold else "normal")); cx += c[1]
        yy += rh
    cx = x
    for c in cols[:-1]: cx += c[1]; o.append(L(cx, y, cx, yy, sw=0.7))
    o.append(R(x, y, tw, yy-y, sw=1.2))
    return "".join(o), yy
def scalebar(x, y, ftper=20, label='1" = 20\'-0"'):
    k = 72/ftper; o = []
    segs = [(0,10),(10,20),(20,40),(40,80)] if ftper == 20 else [(0,5),(5,10),(10,20),(20,40)]
    for i, (a, b) in enumerate(segs): o.append(R(x+a*k, y, (b-a)*k, 7, fill="#141817" if i % 2 == 0 else "#fff", sw=0.8))
    for a in [0] + [b for _, b in segs]: o.append(T(x+a*k, y-4, f"{a}'", 10, a="middle"))
    o.append(T(x+segs[-1][1]*k+12, y+7, label, 11, w="bold"))
    return "".join(o)
def north(x, y, r=24):
    return (f'<g transform="rotate(-26.5 {x} {y})"><circle cx="{x}" cy="{y}" r="{r}" fill="#fff" stroke="#141817" stroke-width="1.4"/>'
            f'<path d="M{x} {y-r+3} L{x+9} {y+r-8} L{x} {y+r-15} L{x-9} {y+r-8} Z" fill="#141817"/>'
            f'<text x="{x}" y="{y-r-5}" font-size="15" text-anchor="middle" font-weight="bold">N</text></g>')
def view_title(x, y, num, title, scale):
    return (f'<circle cx="{x+20}" cy="{y}" r="20" fill="#fff" stroke="#141817" stroke-width="1.5"/>{L(x, y, x+40, y)}'
            + T(x+20, y-5, num, 13, a="middle", w="bold") + T(x+20, y+14, "", 9, a="middle")
            + T(x+52, y+2, title, 20, w="bold") + L(x+52, y+9, x+52+len(title)*11.5, y+9, sw=1.5) + T(x+52, y+26, scale, 12))

# ---------------------------------------------------------------- base linework
src = open('lines_mw2.svg').read()            # right-turn-only exit version
inner = src[src.index('>', src.index('<svg'))+1: src.rindex('</svg>')]
cut = inner.find('<g font-family="Arial, Helvetica, sans-serif" fill="#141817"><rect x="106.0"')
base = inner[:cut]
base = base.replace('<rect x="80.0" y="60.0" width="2275.0" height="1630.0" fill="#ffffff"/>', '')
mw_i = base.find('<g id="mw-truck"'); mw_end = base.find('</g>', base.rfind('WB-67 SWEPT PATHS')) + 4
site_lines, truck = base[:mw_i] + base[mw_end:], base[mw_i:mw_end]
# drop the dark equipment glyphs from the truck layer (redrawn as tagged equipment)
truck_plain = re.sub(r'<circle cx="[^"]+" cy="[^"]+" r="5" fill="#4c1d95"/><text[^>]*>MW 1[AB]</text>', '', truck)
truck_plain = re.sub(r'<rect x="[^"]+" y="[^"]+" width="20" height="16" fill="#6d28d9"[^>]*/><text[^>]*>MW CABINET \(2 POSTS\)</text>', '', truck_plain)

COL = dict(ac="#b42318", dc="#1d4ed8", pri="#6b7280", com="#047857", eq="#141817")
def equipment(scale=1.0, tags=True, clear=True):
    o = []; ts = 9*scale
    def pad(poly, fill, lab, lx, ly, sub=None, a="start"):
        o.append(PG(poly, fill="#ffffff", st="#141817", sw=0.8, extra=' stroke-dasharray="4 2"'))
        c = np.mean(poly, axis=0); sh = [tuple(c + (np.array(p)-c)*0.82) for p in poly]
        o.append(PG(sh, fill=fill, st="#141817", sw=1.1))
        if tags:
            o.append(T(lx, ly, lab + (f"  {sub}" if sub else ""), ts+1, w="bold", a=a))
    # equipment yard fence/curb (drawn local, rotated along the west PL)
    o.append(f'<g {YG}>')
    o.append(PG(yard_poly, fill="#f3f4f6", st="#374151", sw=1.2, extra=' stroke-dasharray="10 4"'))
    # yard location not fixed yet: flag it (Tony, CD50 review)
    tb = (yx+12*F, yy+4.5*F)
    o.append(R(tb[0]-34, tb[1]-8, 68, 12, fill="#fee2e2", st="#b42318", sw=0.8))
    o.append(T(tb[0], tb[1]+1.5, "LOCATION TBD", 7.5, a="middle", w="bold", fill="#b42318"))
    if clear:
        o.append(R(SB[0], SB[1]-4*F, SB[2]*F, 4*F, fill="#fde68a", st="#b45309", sw=0.6, extra=' fill-opacity="0.45" stroke-dasharray="3 2"'))
        o.append(R(XR[0]+XR[2]*F, XR[1], 8*F, XR[3]*F, fill="#fde68a", st="#b45309", sw=0.6, extra=' fill-opacity="0.45" stroke-dasharray="3 2"'))
    pad(rect_pts(*SB), "#99f6e4", "SB-1", SB[0], yy-9, f"{SVC} A SWBD")
    pad(rect_pts(*XR), "#cbd5e1", "XR-1", yx+YARD[2]*F+8, yy+12*F, f"{XFMR} kVA")
    o.append('</g>')
    if clear: o.append(R(V4C[0], V4C[1]+V4C[3]*F, V4C[2]*F, 4.5*F, fill="#fde68a", st="#b45309", sw=0.6, extra=' fill-opacity="0.45" stroke-dasharray="3 2"'))
    pad(v4c_poly, "#fdba74", "V4-1", V4C[0]-16, V4C[1]+12, f"{V4['kva']} kVA", a="end")
    pad(mwc_poly, "#c4b5fd", "MW-1", MWC[0]+24, MWC[1]-22, f"{MW['kva']} kVA")
    for x, y, t in POSTS:
        o.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{1.9*F/2:.1f}" ry="{0.9*F/2+0.6:.1f}" fill="#1f2937"/>')
        if tags: o.append(T(x, y-8*scale, t, ts, a="middle", w="bold"))
    for p, t in MP:
        o.append(f'<circle cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="4.2" fill="#4c1d95"/>')
        if tags: o.append(T(p[0]+8, p[1]-5, t, ts+1, w="bold", fill="#4c1d95"))
    for (x, y), rem in BOLLARDS:
        if rem == "rebound": o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="1.6" fill="#f97316" stroke="#141817" stroke-width="0.7"/>')
        else: o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="1.7" fill="{"#fff" if rem == "removable" else "#eab308"}" stroke="#141817" stroke-width="0.8"/>')
    return "".join(o)
def conduits(labels=True, sc=1.0):
    o = []; dash = dict(ac="", dc="", pri=' stroke-dasharray="12 4 2 4"', com=' stroke-dasharray="5 3"')
    for r in ROUTES:
        o.append(PL(r['pts'], st=COL[r['kind']], sw=2.0 if r['kind'] in ("ac", "pri") else 1.3, extra=dash[r['kind']]))
    if labels:
        def tag(x, y, s, c, rot=0): return (f'<g transform="rotate({rot} {x} {y})">' + R(x-len(s)*3.3*sc-3, y-8*sc, len(s)*6.6*sc+6, 12*sc, fill="#fff", st=c, sw=0.8) + T(x, y+1.5*sc, s, 9*sc, a="middle", w="bold", fill=c) + '</g>')
        rt = {r['tag']: r for r in ROUTES}
        mid = lambda a, b, t=0.5: (a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t)
        p1 = rt['P-1']['pts']; o.append(tag(p1[-1][0]+16, (p1[-2][1]+p1[-1][1])/2, "P-1", COL['pri']))
        f1 = rt['F-1']['pts']; q = mid(f1[1], f1[2], 0.55); ang = math.degrees(math.atan2(f1[2][1]-f1[1][1], f1[2][0]-f1[1][0])); ang = ang-180 if ang > 90 else ang+180 if ang < -90 else ang
        o.append(tag(q[0]-14, q[1], "F-1 / COM-1", COL['ac'], rot=ang))
        f2 = rt['F-2']['pts']; q = mid(f2[2], f2[3], 0.6); o.append(tag(q[0], q[1]-9, "F-2", COL['ac'])); o.append(tag(q[0]+70, q[1]-9, "COM-1", COL['com']))
        o.append(tag(1880, 662, "DC-1A…1H (8) 4\" COMMON TRENCH", COL['dc'])); o.append(L(1880, 666, 1880, 702, st=COL['dc'], sw=0.6))
        o.append(tag((MWC[0]+MP[0][0][0])/2+22, (MWC[1]+MP[0][0][1])/2, "DC-M1A", COL['dc']))
        o.append(tag((MWC[0]+MP[1][0][0])/2-26, (MWC[1]+MP[1][0][1])/2+4, "DC-M1B", COL['dc']))
    return "".join(o)
def plan(x, y, vb, scale, layers):
    vx, vy, vw, vh = vb
    return f'<svg x="{x}" y="{y}" width="{vw*scale}" height="{vh*scale}" viewBox="{vx} {vy} {vw} {vh}" overflow="hidden">{"".join(layers)}</svg>'

# ---------------------------------------------------------------- title block
SHEETS = [("G-001","COVER SHEET"),("G-002","GENERAL NOTES"),("A-101","SITE PLAN & TRUCK CIRCULATION"),
          ("E-101","ELECTRICAL SITE PLAN"),("E-102","ENLARGED ELECTRICAL PLANS"),("E-201","SINGLE-LINE DIAGRAM"),
          ("E-301","LOAD CALCULATIONS & SCHEDULES"),("S-501","PAD, FOUNDATION & BOLLARD DETAILS")]
def titleblock(num, title):
    x0, x1 = 2352, 2556; w = x1-x0; o = [R(x0, 36, w, H-72, sw=2)]
    y = 36
    o.append(T(x0+w/2, y+44, "HiON", 34, a="middle", w="bold")); o.append(T(x0+w/2, y+64, "EV CHARGING", 11, a="middle", w="bold"))
    y += 80; o.append(L(x0, y, x1, y, sw=1.5))
    def field(lbl, lines, y, sz=11):
        o.append(T(x0+8, y+14, lbl, 8.5, w="bold", fill="#555"))
        for i, ln in enumerate(lines): o.append(T(x0+8, y+30+i*(sz+3), ln, sz))
        y2 = y+30+len(lines)*(sz+3)
        o.append(L(x0, y2, x1, y2, sw=0.8)); return y2
    y = field("PROJECT", ["299 E. SAN YSIDRO BLVD", "EV CHARGING HUB", "SAN DIEGO, CA 92173"], y, 12)
    y = field("PROPERTY OWNER", [pv("owner").upper(), "(TO BE CONFIRMED)"], y)
    y = field("APN", ["666-100-12-00 (VERIFY)"], y)
    y = field("UTILITY", ["SDG&E"], y)
    y = field("AHJ", ["CITY OF SAN DIEGO DSD"], y)
    y = field("DESIGNER", ["HiON EV"], y)
    y = field("CONTRACTOR", ["TBD"], y)
    # revision block
    o.append(T(x0+8, y+16, "REVISIONS", 8.5, w="bold", fill="#555")); y += 22
    o.append(T(x0+8, y+12, "REV", 8.5, w="bold")); o.append(T(x0+40, y+12, "DATE", 8.5, w="bold")); o.append(T(x0+104, y+12, "DESCRIPTION", 8.5, w="bold"))
    y += 18
    for rv in [("CD50", DATE, "PRELIM. DESIGN"), ("", "", ""), ("", "", ""), ("", "", "")]:
        o.append(L(x0, y, x1, y, sw=0.5)); o.append(T(x0+6, y+13, rv[0], 9)); o.append(T(x0+40, y+13, rv[1], 9)); o.append(T(x0+104, y+13, rv[2], 9)); y += 18
    o.append(L(x0, y, x1, y, sw=0.8))
    # stamp
    o.append(R(x0+14, y+12, w-28, 170, st="#b42318", sw=1.5, extra=' stroke-dasharray="6 3"'))
    for i, s in enumerate(["PRELIMINARY", "NOT FOR", "CONSTRUCTION"]): o.append(T(x0+w/2, y+60+i*24, s, 17, a="middle", w="bold", fill="#b42318"))
    o.append(T(x0+w/2, y+140, "CD50 · NOT SEALED", 10, a="middle", fill="#b42318")); o.append(T(x0+w/2, y+156, "Engineer of record at CD100", 9, a="middle", fill="#b42318"))
    y += 196; o.append(L(x0, y, x1, y, sw=0.8))
    y = field("DESIGN STAGE", ["CD50 (first revision)"], y)
    y = field("DATE / SCALE", [DATE, "AS NOTED · 24\" x 36\""], y)
    # sheet title + number at bottom
    yb = H-36-150; o.append(L(x0, yb, x1, yb, sw=1.5))
    o.append(T(x0+8, yb+16, "SHEET TITLE", 8.5, w="bold", fill="#555"))
    for i, ln in enumerate(wrap(title, 18)): o.append(T(x0+w/2, yb+40+i*19, ln, 16, a="middle", w="bold"))
    o.append(L(x0, H-36-70, x1, H-36-70, sw=1))
    o.append(T(x0+w/2, H-36-20, num, 44, a="middle", w="bold"))
    return "".join(o)
def sheet(num, title, body):
    return (f'<section class="page"><svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Arial, Helvetica, sans-serif">'
            + R(18, 18, W-36, H-36, sw=1) + R(36, 36, 2316, H-72, sw=2) + body + titleblock(num, title) + '</svg></section>')

pages = []
# ================================================================ G-001
o = []
o.append(T(70, 110, "299 E. SAN YSIDRO BLVD · EV CHARGING HUB", 46, w="bold"))
o.append(T(70, 150, "CD50 PRELIMINARY CONSTRUCTION DESIGN · V4 MEGACHARGER (2 POSTS, PULL-THROUGH) + V4 SUPERCHARGER (8 POSTS) ON ONE SERVICE", 19))
o.append(T(70, 176, "SAN DIEGO, CALIFORNIA 92173 · SDG&E SERVICE TERRITORY", 15, fill="#444"))
o.append(L(70, 194, 2300, 194, sw=2))
# aerial
img = base64.b64encode(open('../cd50-layout/sites/san-ysidro-299e_0.5ftpx_700x525ft.jpg', 'rb').read()).decode()
ax, ay, aw, ah = 70, 240, 840, 630
o.append(T(ax, ay-14, "SITE AERIAL (USGS NAIP 2022, NORTH UP, APPROX. 700' x 525')", 13, w="bold"))
o.append(f'<image x="{ax}" y="{ay}" width="{aw}" height="{ah}" href="data:image/jpeg;base64,{img}" preserveAspectRatio="none"/>')
o.append(R(ax, ay, aw, ah, sw=1.2))
# project data
s, yb = table(960, 240, [("PROJECT DATA", 230), ("", 420)], [
    ["Site address", "299 E. San Ysidro Blvd, San Diego, CA 92173"],
    ["APN", "666-100-12-00 (per SANDAG parcel data; verify with title)"], ["Property owner", f"{pv('owner')} (to be confirmed)"],
    ["Owner contact", f"{pv('owner_contact')}, {pv('owner')}"], ["Designer", "HiON EV"], ["Contractor of record", "TBD"], ["Jurisdiction (AHJ)", "City of San Diego, Development Services"],
    ["Electric utility", "San Diego Gas & Electric (SDG&E)"], ["Charging equipment", "Tesla V4 Megacharger + V4 Supercharger"],
    ["Site area (approx.)", "56,050 sf (traced from SD1.1 site plan)"], ["Adjacent use", "Jack in the Box restaurant (by others)"],
    ["Zoning", "[TBD AT CD90]"], ["Design stage", "CD50 · first revision, not sealed"],
], rh=24, sz=11.5); o.append(s)
# design summary
s, yb2 = table(960, yb+30, [("DESIGN SUMMARY", 230), ("", 420)], [
    ["Megacharger posts", f"2 (pull-through, WB-67 semi)  ·  1 cabinet MW-1 @ {MW['kva']} kVA"],
    ["Supercharger posts", f"8 (passenger)  ·  1 cabinet V4-1 @ {V4['kva']} kVA (highest nameplate)"],
    ["Connected load", f"{TOT_KVA:,} kVA  ·  {TOT_A:,.0f} A @ 480Y/277 V, 3Ø"],
    ["Utility transformer", f"XR-1 {XFMR:,} kVA pad-mount ({TOT_KVA:,} x 1.25 = {XF_REQ:,.0f} kVA, next size up)"],
    ["Service equipment", f"SB-1 {SVC:,} A switchboard, 480Y/277 V, 3Ø 4W, utility metering section"],
    ["Cabinet breakers", f"MW-1 {MW['ocpd']} A  ·  V4-1 {V4['ocpd']} A  (125% of cabinet input)"],
    ["Truck access", "Right-in from EB Beyer Blvd; right-turn-only exit onto EB Beyer Blvd"],
    ["Bollards", f"{NB} total: {NBT} Tesla rebounding at posts, {NB-NBT-NBR} fixed + {NBR} removable guard posts"],
], rh=24, sz=11.5); o.append(s)
# scope
s, y = notes(1680, 240, "SCOPE OF WORK", [
    "Install (2) Tesla V4 Megacharger posts in two 15' x 80' pull-through truck stalls with (1) Megacharger cabinet, on the former coffee-pad area in the NW portion of the lot.",
    "Install (8) Tesla V4 Supercharger posts at the north parking row (former FUTURE EV / EVCS stalls), including the van-accessible EV stall, with (1) V4 cabinet in the planter behind the row.",
    f"New SDG&E {XFMR:,} kVA pad-mount transformer and new {SVC:,} A, 480Y/277 V switchboard in a new bollard-protected equipment yard. Both chargers are fed from this one service.",
    "New one-way truck entrance (right-in from EB Beyer Blvd) and right-turn-only truck exit onto eastbound E. Beyer Blvd with R3-2 signage and pavement arrows (by civil / traffic engineer, subject to City approval).",
    "Underground conduit, trenching, pads, foundations, bollards, striping, signage and accessible route improvements for the charging stalls.",
], n=62, sz=11.5); o.append(s)
# sheet index
rows = [[n, t] for n, t in SHEETS]
s, y2 = table(1680, y+20, [("SHEET", 90), ("SHEET INDEX", 520)], rows, rh=22, sz=11.5); o.append(s)
s, y3 = notes(1680, y2+40, "APPLICABLE CODES (VERIFY EDITION WITH AHJ AT CD90)", [
    "California Electrical Code (CEC), current adopted edition, incl. Art. 625 EV power transfer systems and Art. 230/240/250/110.",
    "California Building Code (CBC) incl. Chapter 11B accessibility (11B-228.3 EV charging stations, 11B-812).",
    "California Green Building Standards Code (CALGreen), California Fire Code, City of San Diego Municipal Code.",
    "SDG&E Electric Service Standards & Guide Manual (ESSGM); EUSERC metering requirements.",
    "Tesla V4 Supercharger and V4 Megacharger installation manuals and templatized plan sets.",
], n=62, sz=11); o.append(s)
# project team
s, y4 = table(70, 1000, [("PROJECT TEAM", 220), ("NAME / COMPANY", 340), ("CONTACT", 300)], [
    ["Property owner", f"{pv('owner')} (to be confirmed)", pv("owner_address")],
    ["Owner contact", pv("owner_contact"), pv("owner_email")],
    ["Designer", "HiON EV", PRIV.get("designer_email", "")], ["Contractor of record", "TBD", ""],
    ["Architect (site)", pv("architect"), PRIV.get("architect_phone", "")],
    ["Electrical engineer of record", "[TBD AT CD90]", ""], ["Civil / traffic engineer", "[TBD]", ""],
    ["Utility", "SDG&E (planner TBD)", ""], ["Charging equipment", "Tesla", ""],
], rh=24, sz=11.5); o.append(s)
s, y5 = table(70, y4+30, [("ABBREVIATIONS", 110), ("", 320), ("", 110), ("", 320)], [
    ["AFG", "Above finished grade", "MW", "V4 Megacharger"], ["AL / CU", "Aluminum / copper", "OCPD", "Overcurrent protective device"],
    ["EGC", "Equipment grounding conductor", "POC", "Point of connection"], ["EVCS", "EV charging station", "PL", "Property line"],
    ["FUT", "Future", "SB", "Switchboard"], ["kcmil", "Thousand circular mils", "TBD", "To be determined"],
    ["XR", "Utility transformer", "WB-67", "AASHTO interstate semi design vehicle"],
], rh=22, sz=11); o.append(s)
pages.append(sheet("G-001", "COVER SHEET", "".join(o)))

# ================================================================ G-002
o = []
cols = [70, 640, 1210, 1780]
s, y = notes(cols[0], 90, "GENERAL NOTES", [
    "This is a CD50 preliminary design for coordination and review only. It is not sealed and shall not be used for permit or construction. Dimensions and equipment locations will be verified at CD90 and CD100.",
    "Base site information is traced from Marks Architects SD1.1 Site Dimension Plan (Jack in the Box, dated 12-30-2025) at 1\"=20'. Aerial context is approximate. A boundary and topographic survey is required before CD90.",
    f"Property owner is shown as {pv('owner')} pending confirmation of the owner / lessee entity. APN is from SANDAG parcel data and shall be verified against title.",
    "Contractor shall verify all existing conditions, utilities and dimensions in the field and report discrepancies before starting work.",
    "Call DigAlert (811) at least two working days before excavation. Pothole existing utilities at all crossings.",
    "All work shall comply with the applicable codes on G-001, Tesla installation manuals, SDG&E requirements and City of San Diego standards.",
    "Restore all disturbed paving, curb, landscaping and irrigation to match existing or better.",
    "The adjacent Jack in the Box building, drive aisles and parking are by others; keep its operations and fire access open during construction.",
], n=62); o.append(s)
s, y = notes(cols[0], y+30, "TRUCK CIRCULATION NOTES", [
    "The Megacharger stalls are a concept checked with a simulated WB-67 swept path (R41' / R64' centerline). The civil engineer shall confirm with AutoTURN before CD90.",
    "The I-805-side swept path comes to about 0.5 ft of the property line near the NW corner. Provide a curb buffer or shift the lanes; Caltrans right-of-way coordination may be needed.",
    "No on-site truck queue fits behind the charging stalls (straight lengths about 100' and 86'). Queuing on E. Beyer Blvd is not allowed; operations plan TBD.",
    "Truck entrance is right-in only from eastbound E. Beyer Blvd. The truck exit is right-turn only onto eastbound E. Beyer Blvd (R3-2 No Left Turn sign, right-turn arrows). Simulated WB-67 right turns stay in the eastbound lanes, south of the Beyer centerline. Traffic study and City approval required; a signal is not assumed.",
], n=62); o.append(s)
s, y = notes(cols[1], 90, "ELECTRICAL NOTES", [
    f"Service: SDG&E {XFMR:,} kVA pad-mount transformer XR-1 to {SVC:,} A, 480Y/277 V, 3-phase, 4-wire switchboard SB-1 with EUSERC utility metering section. Final transformer size and primary voltage by SDG&E.",
    f"Cabinet breakers are sized at 125% of cabinet input current: MW-1 {MW['kva']} kVA = {MW['amps']:,.0f} A, {MW['ocpd']} A breaker; V4-1 {V4['kva']} kVA = {V4['amps']:,.0f} A, {V4['ocpd']} A breaker.",
    f"V4-1 is commissioned at its highest nameplate rating, {V4['kva']} kVA (1500 A). No derate table is needed.",
    "Ground-fault protection of equipment is required on the main (CEC 230.95, 1000 A and larger, 480Y/277 V). Arc energy reduction is required for breakers rated 1200 A and larger (CEC 240.87).",
    "Cabinet feeders are 3-wire plus EGC with no neutral. Parallel conductors per CEC 310.10(G). Aluminum conductors shall be compact AA-8000 series, XHHW-2.",
    "Conduit below grade: Schedule 40 PVC, Schedule 80 PVC or RMC where exposed and at stub-ups. Minimum cover 24\" (36\" under truck paving). Provide pull ropes in spare conduits.",
    "Available fault current, coordination and arc-flash studies at CD90 once SDG&E provides transformer impedance.",
    "Grounding electrode system at SB-1 per CEC 250.50; bond cabinets and posts per Tesla requirements.",
    "Conduit lengths on E-301 are plan estimates plus 10 ft for stub-ups. Voltage drop calculations at CD90.",
], n=62); o.append(s)
s, y = notes(cols[2], 90, "BOLLARD & EQUIPMENT PROTECTION NOTES", [
    "Provide vehicle impact protection at all electrical equipment: transformer, switchboard, charger cabinets and charger posts. Locations on E-101 and E-102; details on S-501.",
    "V4 posts (Tesla templatized S-502): recommended rebounding bollard each side of every post, 2'-3 3/4\" from post centerline on the 5'-11\" CIP post pad, 6\" dia., min. 4.5\" from pad edge, (3) 3/8\" SS Hilti Kwik-Bolt TZ2 with 2.5\" min. embedment. Optional rear bollard where the back of the post faces traffic.",
    "Megacharger posts (Tesla MW Design Guide G-102, fig. 4, drive-thru stalls): rebounding bollard on the island 5'-7\" from each post on the entry side. Confirm with Tesla for 15' truck stalls.",
    "Cabinets and switchboard: guard posts per California Fire Code 312: steel pipe min. 4\" dia. (6\" shown), concrete filled, 3' min. above grade (4' shown), 3' deep in 15\" min. dia. footing (18\" shown), max. 4' on center, 3' from the equipment.",
    "Keep Tesla cabinet clearances clear of fixed posts: 5' front, 3' sides, 6\" back (V4 Design Manual / MW Design Guide). Posts within the front clearance are removable (sleeve-mounted).",
    "Transformer XR-1: bollards per SDG&E requirements (Tesla G-001 utility note 4); 3' clear all sides and 8' at the doors, removable at the doors. Verify with the executed SDG&E design.",
], n=62); o.append(s)
s, y = notes(cols[2], y+30, "ACCESSIBILITY NOTES (CBC 11B)", [
    "With 10 EV charging spaces (5 to 25 range), provide at least 1 van-accessible and 1 standard-accessible EV space (CBC 11B-228.3.2.1). Posts 1C (van) and 1D (standard) serve the existing accessible EV / EVCS stalls.",
    "Accessible EV spaces need an accessible route to the charger; operable parts at 48\" max. reach; access aisle striping and signage per CBC 11B-812.",
    "Megacharger truck stalls are not counted toward passenger accessible spaces; confirm with AHJ.",
], n=62); o.append(s)
s, y = notes(cols[3], 90, "OPEN ITEMS FOR CD90", [
    "Confirm owner / lessee entity, verify APN, and name the contractor of record.",
    "Boundary / topo survey and utility locate.",
    "Set the equipment yard location (currently TBD) with SDG&E and the owner: POC, primary voltage, transformer size; then update feeder routes and lengths.",
    "Confirm MW cabinet input setting (1247 kVA assumed) and V4 cabinet at 1247 kVA nameplate.",
    "AutoTURN truck check and traffic study for the right-turn-only truck exit (City approval).",
    "Caltrans / I-805 right-of-way buffer at the NW corner.",
    "Tesla post pad and foundation option from templatized S-502 by wind speed (107 / 135 mph) and soils; SDG&E bollard layout.",
    "Geotechnical report for pad and post foundations.",
    "Confirm accessible stall layout with the AHJ.",
    "Lighting, signage and stormwater by civil.",
], n=40); o.append(s)
pages.append(sheet("G-002", "GENERAL NOTES", "".join(o)))

# ================================================================ A-101
VB = (440, 60, 1720, 1460); TX, TY = 590, 80
o = [plan(TX, TY, VB, 1.0, [site_lines, truck_plain, equipment(tags=True, clear=False)])]
o.append(view_title(TX, 1620, "1", "SITE PLAN & TRUCK CIRCULATION", 'SCALE: 1" = 20\'-0"'))
o.append(scalebar(TX+520, 1622)); o.append(north(TX+1640, 1610))
kn = [
    "New one-way truck entrance, right-in only from eastbound E. Beyer Blvd.",
    "Megacharger stalls 1 and 2, 15' x 80' pull-through (WB-67).",
    "Megacharger posts M1A and M1B on raised islands with bollards.",
    "Megacharger cabinet MW-1 on concrete pad.",
    "Truck exit: RIGHT TURN ONLY onto eastbound E. Beyer Blvd. R3-2 No Left Turn sign and right-turn pavement arrows.",
    "WB-67 swept paths (simulated). Civil to confirm with AutoTURN.",
    "Equipment yard: XR-1 transformer and SB-1 switchboard, tucked 3' off the west (I-805) property line to keep the interior open for traffic. LOCATION TBD, pending SDG&E design and owner review; shown for sizing and routing only.",
    "V4 Supercharger posts 1A-1H at the north parking row.",
    "V4 cabinet V4-1 in the planter behind the row.",
    "Existing Jack in the Box building, parking and drive aisles (by others).",
    "Former coffee pad, parking row and drive-thru removed from the design.",
]
s, y = notes(70, 90, "KEYNOTES", kn, n=40, sz=11.5); o.append(s)
leg = [("#0b5f8a", "WB-67 swept path / truck lanes"), ("#c4b5fd", "Megacharger cabinet"), ("#fdba74", "V4 cabinet"),
       ("#99f6e4", "Switchboard"), ("#cbd5e1", "Utility transformer"), ("#eab308", "Guard post (fixed)"), ("#ffffff", "Guard post (removable)"), ("#f97316", "Tesla rebounding bollard")]
o.append(T(70, y+30, "LEGEND", 14, w="bold")); y += 50
for c, t in leg:
    o.append(R(70, y-10, 22, 12, fill=c, sw=0.8) if "Bollard" not in t else f'<circle cx="81" cy="{y-4}" r="5" fill="{c}" stroke="#141817" stroke-width="1"/>'); o.append(T(102, y, t, 11.5)); y += 22
s, y = notes(70, y+30, "SITE DATA", [
    "Site area about 56,050 sf; cleared west area about 22,600 sf after removing the coffee pad.",
    "Parking: 10 EV spaces (8 V4 + 2 MW truck). Passenger EV row keeps 3 FUTURE EV stalls.",
    "North arrow is 26.5° from sheet up (plan rotated to the SD1.1 orientation).",
], n=40, sz=11, num=False); o.append(s)
pages.append(sheet("A-101", "SITE PLAN & TRUCK CIRCULATION", "".join(o)))

# ================================================================ E-101
faded = f'<g opacity="0.42">{site_lines}{truck_plain}</g>'
o = [plan(TX, TY, VB, 1.0, [faded, conduits(), equipment(tags=True, clear=True)])]
o.append(view_title(TX, 1620, "1", "ELECTRICAL SITE PLAN", 'SCALE: 1" = 20\'-0"'))
o.append(scalebar(TX+520, 1622)); o.append(north(TX+1640, 1610))
s, y = notes(70, 90, "SHEET NOTES", [
    "Conduit routes are schematic. Final routing, depth and crossings at CD90 after survey and utility locate.",
    "Feeders F-1 and F-2 and comms COM-1 share a common trench from SB-1. Separate DC from AC per Tesla requirements.",
    "DC runs to posts 1A-1H share one trench in the planter behind the stall heads.",
    "Equipment yard (XR-1, SB-1) LOCATION TBD. SDG&E primary P-1 route, POC and all feeder lengths from the yard will change when it is set.",
    "Shaded areas are working / door clearances (SB-1 4', XR-1 8', V4-1 front).",
    "Bollards protect all equipment; open circles are removable. See S-501.",
    "See E-201 for the single-line diagram and E-301 for feeder and conduit schedules.",
], n=40, sz=11.5); o.append(s)
o.append(T(70, y+30, "LEGEND", 14, w="bold")); y += 52
for c, t, d in [(COL['pri'], "SDG&E primary (by utility)", ' stroke-dasharray="12 4 2 4"'), (COL['ac'], "AC service / cabinet feeder", ""),
                (COL['dc'], "DC cabinet-to-post", ""), (COL['com'], "Comms (CAT6 etherloop)", ' stroke-dasharray="5 3"')]:
    o.append(L(70, y-4, 110, y-4, st=c, sw=2.4, extra=d)); o.append(T(120, y, t, 11.5)); y += 22
for c, t in [("#eab308", "Guard post, fixed (CFC 312)"), ("#ffffff", "Guard post, removable"), ("#f97316", "Tesla rebounding bollard")]:
    o.append(f'<circle cx="90" cy="{y-4}" r="5" fill="{c}" stroke="#141817" stroke-width="1"/>'); o.append(T(120, y, t, 11.5)); y += 22
o.append(R(78, y-12, 24, 12, fill="#fde68a", st="#b45309", sw=0.6, extra=' fill-opacity="0.45"')); o.append(T(120, y, "Working / door clearance", 11.5)); y += 34
s, y = table(70, y, [("TAG", 70), ("EQUIPMENT", 200), ("RATING", 140)], [
    ["XR-1", "Utility pad-mount transformer", f"{XFMR:,} kVA"], ["SB-1", "Service switchboard", f"{SVC:,} A, 480Y/277"],
    ["MW-1", "V4 Megacharger cabinet", f"{MW['kva']} kVA"], ["V4-1", "V4 Supercharger cabinet", f"{V4['kva']} kVA"],
    ["M1A-B", "Megacharger posts", "2"], ["1A-1H", "V4 Supercharger posts", "8"],
], rh=21, sz=10.5); o.append(s)
pages.append(sheet("E-101", "ELECTRICAL SITE PLAN", "".join(o)))

# ================================================================ E-102 (1"=10')
o = []
eq = equipment(scale=0.6, tags=True, clear=True); cd = conduits(labels=False)
def dims(x, y, x2, y2, txt, off=0, vert=False):
    if vert: return L(x, y, x, y2, sw=0.6) + L(x-4, y, x+4, y, sw=0.6) + L(x-4, y2, x+4, y2, sw=0.6) + T(x-5, (y+y2)/2, txt, 5.5, a="middle", rot=-90)
    return L(x, y, x2, y, sw=0.6) + L(x, y-4, x, y+4, sw=0.6) + L(x2, y-4, x2, y+4, sw=0.6) + T((x+x2)/2, y-3, txt, 5.5, a="middle")
dyard = (dims(yx, yy-22, yx+42*F, 0, "42'-0\" YARD, 3'-0\" OFF I-805 PL") + dims(yx-14, yy, 0, yy+20*F, "20'-0\"", vert=True)
         + dims(SB[0], SB[1]+SB[3]*F+5, SB[0]+SB[2]*F, 0, f"{SB[2]}' PAD") + dims(XR[0], XR[1]+XR[3]*F+5, XR[0]+XR[2]*F, 0, f"{XR[2]}' PAD")
         + T(XR[0]+XR[2]*F+15, XR[1]+XR[3]*F/2, "8' DOOR CLEAR", 5, rot=90, a="middle")
         + T(SB[0]+SB[2]*F/2, SB[1]-4*F+9, "4' WORKING SPACE", 5, a="middle"))
dyard = f'<g {YG}>' + dyard + '</g>'
# view 1: equipment yard + MW cabinet area
VB1 = (960, 490, 560, 580)
o.append(plan(70, 90, VB1, 2.0, [f'<g opacity="0.35">{site_lines}{truck_plain}</g>', cd, eq, dyard]))
o.append(R(70, 90, VB1[2]*2, VB1[3]*2, sw=1))
o.append(view_title(70, 90+VB1[3]*2+50, "1", "ENLARGED PLAN · EQUIPMENT YARD & MEGACHARGER", 'SCALE: 1" = 10\'-0"'))
o.append(scalebar(760, 90+VB1[3]*2+52, 10, '1" = 10\'-0"'))
# view 2: V4 row
VB2 = (1530, 650, 510, 130)
drow = (dims(POSTX[0], 735, POSTX[1], 0, "10'-6\"") + T(1620, 670, "PL", 6, w="bold")
        + T(1700, 727, "WHEEL STOP (TYP.)", 5) + T(1610, 718, "CURB", 5))
ws = "".join(R(x-3*F, POSTY+9*F/3.6*3.6/3.6+10, 6*F, 0.5*F, fill="#9ca3af", sw=0.4) for x in POSTX)
o.append(plan(1250, 90, VB2, 2.0, [f'<g opacity="0.45">{site_lines}</g>', ws, cd, eq, drow]))
o.append(R(1250, 90, VB2[2]*2.0, VB2[3]*2.0, sw=1))
o.append(view_title(1250, 90+VB2[3]*2.0+50, "2", "ENLARGED PLAN · V4 SUPERCHARGER ROW", 'SCALE: 1" = 10\'-0"'))
s, y = notes(1250, 520, "ENLARGED PLAN NOTES", [
    "Equipment yard runs parallel to the west (I-805) property line, 3'-0\" off it, with equipment backs toward the PL and fronts facing the site. Guard posts 1'-0\" outside the yard on the three open sides at 4'-0\" max. on center (CFC 312; SDG&E governs at XR-1). Removable posts at the SE end for transformer door access.",
    "SB-1 front faces into the site (NE) with 4'-0\" min. working space; two egress paths required for 1200 A and larger equipment over 6' wide (CEC 110.26(C)(3)).",
    "XR-1 doors face the SE end of the yard with 8'-0\" clear. Transformer pad, grounding and bollards per SDG&E ESSGM.",
    "V4-1 sits in the planter behind the stall heads, 5'-0\" front clearance toward the curb. Removable bollards in front, fixed bollards on the sides.",
    "Each V4 post is centred on its stall head on a 5'-11\" x 2'-0\" CIP pad, with a Tesla rebounding bollard 2'-3 3/4\" each side (S-502). Wheel stop in each stall.",
    "Posts 1C and 1D serve the van-accessible and standard-accessible EV stalls; keep the access aisle and route clear.",
    "MW-1 pad is set 3'-6\" min. from the truck swept path; guard posts on the sides clear of the truck path (none inside the swept path). Each Megacharger post has a rebounding bollard 5'-7\" upstream on its island (Tesla G-102).",
], n=95, sz=11.5); o.append(s)
pages.append(sheet("E-102", "ENLARGED ELECTRICAL PLANS", "".join(o)))

# ================================================================ E-201 SLD
o = []
cx = 900
def brk(x, y, a, lab=None):
    s = f'<path d="M{x} {y} q 14 14 0 28" fill="none" stroke="#141817" stroke-width="2"/>' + L(x, y-10, x, y, sw=2) + L(x, y+28, x, y+38, sw=2)
    return s + (T(x+16, y+18, lab or f"{a} A", 13, w="bold") if a else "")
o.append(T(cx, 120, "SDG&E PRIMARY (VOLTAGE TBD, TYP. 12 kV)", 14, a="middle", w="bold")); o.append(L(cx, 130, cx, 180, sw=2.4, extra=' stroke-dasharray="12 4 2 4"'))
o.append(T(cx+14, 160, "P-1: (2) 5\" PVC, CABLE BY SDG&E", 11))
o.append(f'<circle cx="{cx}" cy="205" r="26" fill="none" stroke="#141817" stroke-width="2"/><circle cx="{cx}" cy="245" r="26" fill="none" stroke="#141817" stroke-width="2"/>')
o.append(T(cx+44, 210, f"XR-1  {XFMR:,} kVA PAD-MOUNT (SDG&E)", 15, w="bold")); o.append(T(cx+44, 230, "PRIMARY TBD - 480Y/277 V, 3Ø 4W, %Z TBD", 12))
o.append(T(cx+44, 250, f"REQUIRED {TOT_KVA:,} kVA x 1.25 = {XF_REQ:,.0f} kVA -> {XFMR:,} kVA", 12))
o.append(L(cx, 271, cx, 330, sw=2.4)); o.append(T(cx+14, 300, f"SL-1: {SVCF[0]} SETS (3) {SVCF[1]} + (1) N, ({SVCF[0]}) 4\" PVC", 11))
# switchboard box
o.append(R(cx-420, 330, 1000, 520, st="#0f766e", sw=2, extra=' stroke-dasharray="14 5"'))
o.append(T(cx-410, 352, f"SB-1  {SVC:,} A SWITCHBOARD · 480Y/277 V · 3Ø 4W · NEMA 3R · AIC RATING TBD (FAULT STUDY)", 14, w="bold", fill="#0f766e"))
o.append(R(cx-60, 370, 120, 70, sw=1.2)); o.append(T(cx, 395, "UTILITY CT /", 10, a="middle")); o.append(T(cx, 410, "METER SECTION", 10, a="middle")); o.append(T(cx, 425, "(EUSERC)", 10, a="middle"))
o.append(L(cx, 330, cx, 370, sw=2.4)); o.append(f'<circle cx="{cx+90}" cy="405" r="13" fill="none" stroke="#141817" stroke-width="1.5"/>' + T(cx+90, 409, "M", 11, a="middle", w="bold"))
o.append(L(cx, 440, cx, 470, sw=2.4)); o.append(brk(cx, 480, SVC, f"{SVC:,} A MAIN, 3P, LSIG (GFP)  · ARC ENERGY REDUCTION")); o.append(L(cx, 518, cx, 560, sw=2.4))
o.append(L(cx-340, 560, cx+480, 560, sw=4)); o.append(T(cx+490, 565, f"{SVC:,} A BUS", 12, w="bold"))
# SPD + ground
o.append(L(cx+380, 560, cx+380, 600, sw=1.5)); o.append(R(cx+360, 600, 40, 30, sw=1.2)); o.append(T(cx+380, 620, "SPD", 10, a="middle", w="bold"))
o.append(L(cx-380, 470, cx-380, 900, sw=1.5, extra=' stroke-dasharray="6 3"')); o.append(L(cx-380, 470, cx-60, 470, sw=1.5, extra=' stroke-dasharray="6 3"'))
gx, gy = cx-380, 900
o.append(L(gx-18, gy, gx+18, gy, sw=2) + L(gx-12, gy+6, gx+12, gy+6, sw=2) + L(gx-6, gy+12, gx+6, gy+12, sw=2))
o.append(T(gx+14, gy-20, "GROUNDING ELECTRODE SYSTEM PER CEC 250.50 (GEC 3/0 CU MIN.)", 11))
branches = [(cx-300, MW, "F-1", "MW-1", "M1A", "M1B"), (cx+130, V4, "F-2", "V4-1", None, None)]
for bx, g, ft, tag, *_ in branches:
    o.append(L(bx, 560, bx, 600, sw=2.4)); o.append(brk(bx, 610, g['ocpd'], f"{g['ocpd']} A, 3P"))
    o.append(L(bx, 648, bx, 960, sw=2.4))
    s, n = g['feeder']; o.append(T(bx+14, 700, f"{ft}: {s} SETS (3) {n}", 11)); o.append(T(bx+14, 715, f"+ (1) {egc_al(g['ocpd'])} EGC, ({s}) 4\" PVC, NO NEUTRAL", 11))
o.append(L(cx+300, 560, cx+300, 610, sw=1.5)); o.append(brk(cx+300, 620, None)); o.append(T(cx+316, 640, "SPACE (FUTURE)", 11))
# cabinets
for bx, g, ft, tag, *_ in branches:
    o.append(R(bx-110, 960, 220, 90, fill="#c4b5fd" if g['kind'] == "MW" else "#fdba74", sw=1.8))
    o.append(T(bx, 990, tag, 17, a="middle", w="bold")); o.append(T(bx, 1010, g['name'].upper(), 10, a="middle"))
    o.append(T(bx, 1028, f"{g['kva']} kVA INPUT · {g['amps']:,.0f} A @ 480 V", 10.5, a="middle"))
    o.append(T(bx, 1043, "HIGHEST NAMEPLATE" if g['kind'] == "V4" else "NAMEPLATE (ASSUMED)", 9, a="middle", fill="#555"))
# posts
mwx = cx-300
for i, t in enumerate(["M1A", "M1B"]):
    px = mwx-70+i*140; o.append(L(mwx, 1050, mwx, 1090, sw=2, st=COL['dc'])); o.append(L(mwx, 1090, px, 1090, sw=2, st=COL['dc'])); o.append(L(px, 1090, px, 1170, sw=2, st=COL['dc']))
    o.append(R(px-26, 1170, 52, 70, sw=1.5, fill="#ede9fe")); o.append(T(px, 1210, t, 13, a="middle", w="bold"))
    o.append(T(px, 1260, f"DC-{t}", 10, a="middle", fill=COL['dc']))
o.append(T(mwx-110, 1290, "DC: 2 SETS (4) 750 kcmil AL + EGC + TESLA SIGNAL, (2) 4\" PER POST", 10.5))
v4x = cx+130
xs = [v4x-240+i*85 for i in range(8)]
o.append(L(v4x, 1050, v4x, 1090, sw=2, st=COL['dc'])); o.append(L(xs[0], 1090, xs[-1], 1090, sw=2, st=COL['dc']))
for x, (_, _, t) in zip(xs, POSTS):
    o.append(L(x, 1090, x, 1170, sw=2, st=COL['dc'])); o.append(R(x-24, 1170, 48, 70, sw=1.5, fill="#ffedd5")); o.append(T(x, 1210, t, 13, a="middle", w="bold"))
    o.append(T(x, 1260, f"DC-{t}", 10, a="middle", fill=COL['dc']))
o.append(T(xs[0]-20, 1312, "DC: (4) 600 kcmil AL (2+, 2-) + #2/0 CU EGC + TESLA SIGNAL, (1) 4\" PER POST", 10.5))
o.append(L(mwx+110, 1000, v4x-110, 1000, st=COL['com'], sw=2, extra=' stroke-dasharray="6 4"')); o.append(T((mwx+v4x)/2, 992, "COM-1: (2) CAT6 ETHERLOOP, 1-1/4\"", 10.5, a="middle", fill=COL['com']))
o.append(view_title(70, 1620, "1", "SINGLE-LINE DIAGRAM", "NOT TO SCALE"))
s, y = notes(1640, 120, "SLD NOTES", [
    "Equipment ratings are preliminary and follow the CD50 sizing rules: transformer = total cabinet kVA x 1.25, next standard size up; breakers = 125% of cabinet input, next standard size up; service = 125% of summed cabinet amps.",
    "Cabinet input settings are assumptions until confirmed: MW-1 1247 kVA nameplate, V4-1 1247 kVA (highest V4 nameplate).",
    "Main breaker requires ground-fault protection of equipment (CEC 230.95) and arc energy reduction (CEC 240.87).",
    "SB-1 AIC rating, coordination and arc-flash labels from studies at CD90.",
    "Feeders to Tesla cabinets are 3-wire plus EGC. Confirm conductor counts and terminations with the Tesla cabinet lug data.",
    "Spare space in SB-1 for a future cabinet; future load requires recheck of XR-1 and SB-1.",
], n=58, sz=11.5); o.append(s)
s, y = table(1640, y+30, [("LOAD SUMMARY", 300), ("", 300)], [
    ["MW-1 (2 MW posts)", f"{MW['kva']:,} kVA · {MW['amps']:,.1f} A"], ["V4-1 (8 V4 posts)", f"{V4['kva']:,} kVA · {V4['amps']:,.1f} A"],
    {"c": ["TOTAL CONNECTED", f"{TOT_KVA:,} kVA · {TOT_A:,.1f} A"]}, ["Service @ 125%", f"{TOT_A*1.25:,.1f} A -> {SVC:,} A"],
    ["Transformer @ 125%", f"{XF_REQ:,.1f} kVA -> {XFMR:,} kVA"],
], rh=24, sz=11.5); o.append(s)
pages.append(sheet("E-201", "SINGLE-LINE DIAGRAM", "".join(o)))

# ================================================================ E-301
o = []
s, y = table(70, 110, [("CABINET", 110), ("POSTS", 70), ("INPUT kVA", 100), ("AMPS @ 480 V 3Ø", 140), ("x 1.25", 100), ("BREAKER", 100), ("FEEDER SETS", 120), ("CONDUCTOR", 140), ("EGC", 130)],
    [[g['tag'], str(g['posts']), f"{g['kva']:,}", f"{g['amps']:,.1f}", f"{g['amps']*1.25:,.1f}", f"{g['ocpd']} A", str(g['feeder'][0]), g['feeder'][1], egc_al(g['ocpd'])] for g in groups]
    + [{"c": ["TOTAL", "10", f"{TOT_KVA:,}", f"{TOT_A:,.1f}", f"{TOT_A*1.25:,.1f}", f"{SVC:,} A MAIN", str(SVCF[0]), SVCF[1], "(neutral)"]}], rh=24, sz=11.5)
o.append(T(70, 96, "TABLE 1 · LOAD CALCULATION & OCPD SIZING", 15, w="bold")); o.append(s)
s, y2 = para(70, y+22, f"Amps = kVA x 1000 / (480 x 1.732). Breaker = next standard size at or above 125% of cabinet amps (CEC 240.6). Service = next standard size at or above the larger of the biggest breaker and 125% of summed cabinet amps: {TOT_A:,.1f} x 1.25 = {TOT_A*1.25:,.1f} A -> {SVC:,} A. Transformer = {TOT_KVA:,} kVA x 1.25 = {XF_REQ:,.1f} kVA -> {XFMR:,} kVA (next standard size up; never undersized). Feeder sets: up to 800 A, 500 kcmil AL at 310 A per set; above 800 A, 750 kcmil AL at 385 A per set (75°C).", 190, 11)
o.append(s)
eqrows = [
    ["XR-1", "Utility pad-mount transformer", f"{XFMR:,} kVA, primary TBD - 480Y/277 V", "9.0' x 9.0'", f"{sum(1 for _ in B_YARD)} (yard)", "By SDG&E; doors east, 8' clear"],
    ["SB-1", "Service switchboard, utility metering section", f"{SVC:,} A, 480Y/277 V, 3Ø 4W", "16.7' x 6.2'", "(yard)", "NEMA 3R; GFP + arc energy reduction"],
    ["MW-1", "Tesla V4 Megacharger cabinet", f"{MW['kva']} kVA input, {MW['ocpd']} A feeder", "6.2' x 5.0'", str(len(B_MWC)), "Serves M1A, M1B"],
    ["V4-1", "Tesla V4 Supercharger cabinet", f"{V4['kva']} kVA (nameplate), {V4['ocpd']} A", "5.6' x 4.9'", str(len(B_V4C)), "Serves 1A-1H"],
    ["M1A, M1B", "Tesla V4 Megacharger posts", "MW DC", "Island", str(len(B_MP)), "Pull-through truck stalls"],
    ["1A-1H", "Tesla V4 Supercharger posts", "V4 DC", "4.67' x 2.5'", str(len(B_POST)), "1C van-accessible, 1D accessible"],
]
o.append(T(70, y2+40, "TABLE 2 · EQUIPMENT SCHEDULE", 15, w="bold"))
s, y3 = table(70, y2+54, [("TAG", 90), ("DESCRIPTION", 290), ("RATING", 270), ("PAD (APPROX.)", 120), ("BOLLARDS", 90), ("NOTES", 270)], eqrows, rh=24, sz=11.5); o.append(s)
o.append(T(70, y3+40, "TABLE 3 · FEEDER & CONDUIT SCHEDULE", 15, w="bold"))
crow = [[r['tag'], r['fr'], r['to'], r['n'] + (" PVC" if r['kind'] != "com" else ""), r['cond'], f"{r['len']}'", r['note']] for r in ROUTES]
s, y4 = table(70, y3+54, [("TAG", 80), ("FROM", 190), ("TO", 90), ("CONDUIT", 120), ("CONDUCTORS", 420), ("EST. LENGTH", 100), ("NOTES", 300)], crow, rh=22, sz=11); o.append(s)
tot_tr = round(sum(r['len'] for r in ROUTES if r['kind'] == "dc" and r['to'].startswith("POST 1")) )
s, y5 = para(70, y4+20, f"Equipment yard location is TBD, so P-1, SL-1, F-1, F-2 and COM-1 lengths are placeholders. Lengths are measured on plan plus 10 ft for stub-ups (P-1 to PL only). DC runs to posts 1A-1H share one trench; total DC conduit about {tot_tr:,} ft. Verify the maximum cabinet-to-post DC run against the Tesla V4 Installation Manual. Conduit fill to be verified at CD90 with final conductor types.", 190, 11); o.append(s)
# panel schedule SB-1
o.append(T(1700, 96, "TABLE 4 · SB-1 DISTRIBUTION", 15, w="bold"))
s, y6 = table(1700, 110, [("CKT", 50), ("LOAD", 200), ("BREAKER", 100), ("kVA", 90)], [
    ["MAIN", "Service main (LSIG)", f"{SVC:,} A 3P", f"{TOT_KVA:,}"], ["1", "MW-1 Megacharger cab.", f"{MW['ocpd']} A 3P", f"{MW['kva']:,}"],
    ["2", "V4-1 Supercharger cab.", f"{V4['ocpd']} A 3P", f"{V4['kva']:,}"], ["3", "SPD", "Per mfr.", "-"], ["4", "Space (future)", "-", "-"],
], rh=24, sz=11.5); o.append(s)
o.append(T(1700, y6+40, "TABLE 5 · BOLLARD COUNT", 15, w="bold"))
s, y7 = table(1700, y6+54, [("LOCATION", 230), ("FIXED", 70), ("REMOVABLE", 90), ("REBOUNDING", 100)], [
    [n, str(sum(1 for _, r in b if r == "fixed")), str(sum(1 for _, r in b if r == "removable")), str(sum(1 for _, r in b if r == "rebound"))] for n, b in
    [("Equipment yard (XR-1, SB-1)", B_YARD), ("V4-1 cabinet", B_V4C), ("V4 posts 1A-1H", B_POST), ("MW-1 cabinet", B_MWC), ("MW posts M1A, M1B", B_MP)]]
    + [{"c": ["TOTAL", str(NB-NBR-NBT), str(NBR), str(NBT)]}], rh=24, sz=11.5); o.append(s)
pages.append(sheet("E-301", "LOAD CALCULATIONS & SCHEDULES", "".join(o)))

# ================================================================ S-501
o = []
def detail_box(x, y, w, h, num, title, scale="NOT TO SCALE"):
    return R(x, y, w, h, sw=1) + view_title(x+16, y+h-40, num, title, scale)
# bollard detail
bx, by = 70, 80
o.append(detail_box(bx, by, 700, 720, "1", "EQUIPMENT GUARD POST (CFC 312)"))
g0 = by+400; px = bx+300
o.append(L(bx+60, g0, bx+640, g0, sw=2)); o.append(T(bx+70, g0-8, "FINISHED GRADE / PAVING", 11))
o.append(R(px-50, g0, 100, 216, fill="#e5e7eb", sw=1.2)); o.append(R(px-18, g0-192, 36, 192+150, fill="#fde047", sw=1.6))
o.append(f'<path d="M{px-18} {g0-192} Q {px} {g0-215} {px+18} {g0-192}" fill="#fde047" stroke="#141817" stroke-width="1.6"/>')
o.append(L(px+60, g0-192, px+60, g0, sw=0.8) + T(px+70, g0-90, "4'-0\" ABOVE GRADE", 12))
o.append(L(px+60, g0, px+60, g0+150, sw=0.8) + T(px+70, g0+80, "3'-0\" MIN. EMBED", 12))
o.append(T(px-260, g0-200, "6\" DIA. SCH. 40 STEEL PIPE,", 12)); o.append(T(px-260, g0-184, "CONCRETE FILLED, DOMED TOP,", 12)); o.append(T(px-260, g0-168, "SAFETY YELLOW", 12))
o.append(T(px-260, g0+120, "18\" DIA. CONCRETE", 12)); o.append(T(px-260, g0+136, "FOOTING", 12))
o.append(T(bx+40, by+40, "REMOVABLE TYPE: same pipe in a sleeve cast in the footing, with locking pin.", 11))
o.append(T(bx+40, by+58, "For cabinets and switchboard. Transformer bollards per SDG&E. Posts use Tesla rebounding bollards (detail 2B, 2C).", 11, fill="#b42318"))
# bollard layout typical
o.append(detail_box(bx+730, by, 760, 720, "2", "TYPICAL BOLLARD LAYOUTS"))
ox, oy = bx+800, by+100
o.append(R(ox, oy, 150, 110, fill="#cbd5e1", sw=1.5)); o.append(T(ox+75, oy+60, "XR-1", 14, a="middle", w="bold"))
for i in range(6): o.append(f'<circle cx="{ox-36+i*44:.0f}" cy="{oy-36}" r="7" fill="#eab308" stroke="#141817"/>')
for i in range(4): o.append(f'<circle cx="{ox-36}" cy="{oy+8+i*36:.0f}" r="7" fill="#eab308" stroke="#141817"/>')
for i in range(4): o.append(f'<circle cx="{ox+186}" cy="{oy+8+i*36:.0f}" r="7" fill="#fff" stroke="#141817"/>')
o.append(T(ox+200, oy+60, "REMOVABLE AT DOORS", 11)); o.append(T(ox-36, oy-52, "3'-0\" MIN. FROM PAD, 4'-0\" MAX. CLEAR", 11))
o.append(T(ox, oy+200, "A. TRANSFORMER / SWITCHBOARD", 12, w="bold"))
ox2, oy2 = bx+830, by+390
o.append(L(ox2-30, oy2+60, ox2+560, oy2+60, sw=2)); o.append(T(ox2+580, oy2+64, "CURB", 10))
for k in range(3):
    xx = ox2+40+k*180
    o.append(f'<ellipse cx="{xx}" cy="{oy2+40}" rx="20" ry="10" fill="#1f2937"/>')
    o.append(R(xx-60, oy2+30, 120, 22, fill="#e5e7eb", sw=0.8))
    for dx in (-46, 46): o.append(f'<circle cx="{xx+dx}" cy="{oy2+41}" r="7" fill="#f97316" stroke="#141817"/>')
    o.append(R(xx-55, oy2+150, 110, 9, fill="#9ca3af", sw=0.6))
    if k < 2: o.append(L(xx+90, oy2+60, xx+90, oy2+200, sw=1))
o.append(T(ox2, oy2+230, "B. V4 POSTS: REBOUNDING BOLLARD EACH SIDE, 2'-3 3/4\" FROM POST CL (TESLA S-502)", 12, w="bold"))
o.append(T(ox2, oy2+248, "6\" dia., on 5'-11\" CIP pad, min. 4.5\" from pad edge, (3) 3/8\" SS Hilti KB-TZ2, 2.5\" embed. Wheel stop in stall.", 11))
# pad schedule
o.append(T(1580, 96, "PAD & FOUNDATION SCHEDULE (PRELIMINARY)", 15, w="bold"))
s, y = table(1580, 110, [("ITEM", 150), ("PAD SIZE", 120), ("THICKNESS", 110), ("NOTES", 340)], [
    ["XR-1 pad", "9.0' x 9.0'", "Per SDG&E", "SDG&E standard pad, grounding ring"],
    ["SB-1 pad", "16.7' x 6.2'", "8\" min.", "#4 @ 12\" EW; conduit window per mfr."],
    ["Equipment yard slab", "42' x 20'", "6\" min.", "Curbed; slope to drain"],
    ["MW-1 pad", "6.2' x 5.0'", "Per Tesla", "Tesla MW templatized S-sheets"],
    ["V4-1 pad", "5.6' x 4.9'", "Per Tesla", "Tesla V4 S-501 / S-502 by wind speed"],
    ["V4 post foundation", "Per Tesla", "Per Tesla", "Precast or cast-in-place per Tesla"],
    ["MW post islands", "Per civil", "6\" curb", "Rebounding bollard 5'-7\" upstream of post"],
    ["V4 post CIP pad", "5'-11\" x 2'-0\"", "Per Tesla S-502", "107 / 135 mph options; rebounding bollards"],
    ["Bollard footing", "18\" dia.", "3'-0\" deep", "See detail 1"],
], rh=24, sz=11.5); o.append(s)
s, y = notes(1580, y+40, "STRUCTURAL NOTES", [
    "Foundations are placeholders until the geotechnical report and the Tesla templatized S-501/S-502 (wind speed and soil class) are applied at CD90.",
    "Concrete f'c = 3,000 psi min. at 28 days for pads and bollard footings unless Tesla or SDG&E require more.",
    "Wind speed, seismic design category and soil class per ASCE 7 for the site; confirm at CD90.",
], n=62, sz=11.5); o.append(s)
pages.append(sheet("S-501", "PAD, FOUNDATION & BOLLARD DETAILS", "".join(o)))

css = "@page{size:36in 24in;margin:0}html,body{margin:0;padding:0}.page{width:36in;height:24in;page-break-after:always;overflow:hidden}.page>svg{width:36in;height:24in;display:block}"
open('cd50.html', 'w').write(f'<!doctype html><html><head><meta charset="utf-8"><title>CD50 San Ysidro</title><style>{css}</style></head><body>{"".join(pages)}</body></html>')
json.dump(dict(bollards=[[p[0], p[1], r] for p, r in BOLLARDS], routes=[{k: r[k] for k in ('tag', 'len', 'n', 'cond')} for r in ROUTES],
               xfmr=XFMR, svc=SVC, tot_kva=TOT_KVA), open('cd50_data.json', 'w'), indent=1)
print("bollards", NB, "removable", NBR); [print(r['tag'], r['len']) for r in ROUTES]

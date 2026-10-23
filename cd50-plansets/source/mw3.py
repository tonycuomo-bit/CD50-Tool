exec(open('truck.py').read())
import json, math, numpy as np
from shapely.geometry import LineString, Polygon, Point
cfg=json.load(open('cF.json')); K=3.6; C="#0b5f8a"
lanes=[]
for ln in cfg['lanes']:
    segs=[tuple(s) for s in ln['segs']]
    pts=build(tuple(ln['start']),ln['heading'],segs)
    # straight = 4th seg (index 3) for lane1, 5th (index 4) for lane2
    si=max((i for i,s in enumerate(segs) if s[0]=='L'),key=lambda i:segs[i][1])
    pre=build(tuple(ln['start']),ln['heading'],segs[:si])[-1]; post=build(tuple(ln['start']),ln['heading'],segs[:si+1])[-1]
    sw,_=sweep(pts)
    lanes.append(dict(pts=pts,a=np.array(pre[:2]),b=np.array(post[:2]),th=post[2],sw=sw))
pav=unary_union([l['sw'] for l in lanes]).buffer(1.5).buffer(-0.5)
P=lambda q:" ".join(f"{x*K:.1f},{y*K:.1f}" for x,y in q)
o=['<g id="mw-truck" font-family="Arial, Helvetica, sans-serif">']
gs=[pav] if pav.geom_type=='Polygon' else list(pav.geoms)
for gg in gs: o.append(f'<polygon points="{P(gg.exterior.coords)}" fill="{C}" fill-opacity="0.08" stroke="{C}" stroke-width="1.8"/>')
for l in lanes:
    o.append(f'<polyline points="{P([p[:2] for p in l["pts"][10:]])}" fill="none" stroke="{C}" stroke-width="1.1" stroke-dasharray="10 6"/>')
pos={}
for i,l in enumerate(lanes):
    e=np.array([math.cos(l['th']),math.sin(l['th'])]); nL=np.array([math.sin(l['th']),-math.cos(l['th'])])  # left (NE) normal
    f=l['b']; r=f-80*e     # stall = last 80 ft of straight
    for s in (-7.5,7.5): o.append(f'<polyline points="{P([r+s*nL,f+s*nL])}" stroke="#141817" stroke-width="1.3" fill="none"/>')
    o.append(f'<polyline points="{P([f-7.5*nL,f+7.5*nL])}" stroke="#141817" stroke-width="2.4" fill="none"/>')
    l['e'],l['nL'],l['front'],l['rear']=e,nL,f,r
l1,l2=lanes
e,nL=l1['e'],l1['nL']
# centre island between lanes (lane2 driver side faces it), north island on lane1 driver side
def isl(base,a0,a1,w0,w1): return [base+a0*e+w0*nL,base+a1*e+w0*nL,base+a1*e+w1*nL,base+a0*e+w1*nL]
I1=isl(l2['front'],-62,-4,7.5,15.5); I2=isl(l1['front'],-62,-4,7.5,13.5)
for I in (I1,I2): o.append(f'<polygon points="{P(I)}" fill="#ffffff" stroke="#141817" stroke-width="1.4"/>')
p2=l2['front']-18*e+11.5*nL; p1=l1['front']-18*e+10.5*nL; cab=l1['front']-45*e+10.5*nL
pos=dict(post1=p1.tolist(),post2=p2.tolist(),cab=cab.tolist(),rot=math.degrees(l1['th']))
for pp,lab in ((p1,"MW 1A"),(p2,"MW 1B")):
    q=pp*K; o.append(f'<circle cx="{q[0]:.1f}" cy="{q[1]:.1f}" r="5" fill="#4c1d95"/><text x="{q[0]+8:.1f}" y="{q[1]-4:.1f}" font-size="11" fill="#4c1d95" font-weight="bold">{lab}</text>')
q=cab*K; o.append(f'<rect x="{q[0]-10:.1f}" y="{q[1]-8:.1f}" width="20" height="16" fill="#6d28d9" transform="rotate({pos["rot"]:.1f} {q[0]:.1f} {q[1]:.1f})"/><text x="{q[0]+14:.1f}" y="{q[1]-10:.1f}" font-size="11" fill="#4c1d95" font-weight="bold">MW CABINET (2 POSTS)</text>')
def lab(p,txt,size=11,rot=None,anchor="middle",col=C):
    q=np.array(p)*K; r=pos['rot'] if rot is None else rot
    return f'<text x="{q[0]:.1f}" y="{q[1]:.1f}" font-size="{size}" fill="{col}" font-weight="bold" text-anchor="{anchor}" transform="rotate({r:.1f} {q[0]:.1f} {q[1]:.1f})">{txt}</text>'
m1=(l1['front']+l1['rear'])/2; m2=(l2['front']+l2['rear'])/2
o.append(lab(m1+1.5*nL,"MW STALL 1 · 15' x 80' PULL-THRU",9))
o.append(lab(m2+1.5*nL,"MW STALL 2 · 15' x 80' PULL-THRU",9))
o.append(lab((150,14),"ONE-WAY TRUCK ENTRANCE · RIGHT-IN FROM EB BEYER",11,rot=37,anchor="start"))
# right-turn-only exit: label, right-turn arrows at the throat, R3-2 "no left turn" sign at the driveway
o.append(lab((420,128),"TRUCK EXIT · RIGHT TURN ONLY",11,rot=0,anchor="start"))
o.append(lab((420,139),"ONTO EASTBOUND E. BEYER BLVD (NO LEFT TURN)",9,rot=0,anchor="start"))
def rarrow(x,y,th):
    # right-turn pavement arrow in ft, pointing along heading th (deg), hook to the right
    c,sn=math.cos(math.radians(th)),math.sin(math.radians(th)); P=lambda a,b:((x+a*c-b*sn)*K,(y+a*sn+b*c)*K)
    pts=[P(-6,0),P(2,0),P(5,3),P(5,5)]
    return (f'<polyline points="{" ".join(f"{u:.1f},{v:.1f}" for u,v in pts)}" fill="none" stroke="{C}" stroke-width="2.2"/>'
            f'<polygon points="{" ".join(f"{u:.1f},{v:.1f}" for u,v in (P(3.2,5),P(6.8,5),P(5,8)))}" fill="{C}"/>')
for ln,l in zip(cfg['lanes'],(l1,l2)):
    # arrow on the lane centreline 12 ft before the right-turn arc, pointing along travel
    sg=[tuple(v) for v in ln['segs']]; q=build(tuple(ln['start']),ln['heading'],sg[:-3])[-1]
    th=q[2]; o.append(rarrow(q[0]-12*math.cos(th),q[1]-12*math.sin(th),math.degrees(th)))
sx,sy=(l1['pts'][-1][0]*0+372),178
o.append(f'<g transform="translate({sx*K:.1f} {sy*K:.1f})"><rect x="-7" y="-7" width="14" height="14" fill="#fff" stroke="#b42318" stroke-width="1.2"/><path d="M3 4 V-1 H-3 M-1 -3 L-3 -1 L-1 1" fill="none" stroke="#141817" stroke-width="1.2"/><circle r="5.5" fill="none" stroke="#b42318" stroke-width="1.2"/><line x1="-4" y1="4" x2="4" y2="-4" stroke="#b42318" stroke-width="1.2"/></g>')
o.append(lab((sx-3,sy+12),"R3-2 NO LEFT TURN SIGN",7,rot=0,anchor="end"))
o.append(lab((330,236),"WB-67 SWEPT PATHS (R41' / R64' CL)",9,rot=0))
o.append('</g>')
open('mw_overlay.svgfrag','w').write("".join(o)); json.dump(pos,open('mw_pos.json','w'))
print(pos, 'straights', [round(np.linalg.norm(l['b']-l['a']),1) for l in lanes])
# min clearance of swept path to west property line
west=LineString([(177.7,50.8),(193.8,95.5),(260.7,182.9),(446.1,404.6)])
print('min dist swept->I-805 PL', round(min(l['sw'].difference(box(0,-100,190,60)).exterior.distance(west) if l['sw'].geom_type=='Polygon' else 0 for l in lanes),2))

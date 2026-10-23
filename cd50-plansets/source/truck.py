import numpy as np, math
from shapely.geometry import Polygon, LineString, Point, box
from shapely.ops import unary_union
k=20/72
S=Polygon(np.load('site_poly.npy'))
NPL=[(x*k,y*k) for x,y in [(560,140),(639.7,182.8),(680,217),(740,262),(800,314),(860,342),(920,381),(980,421),(1040,460),(1100,501),(1160,536),(1220,567),(1280,588),(1340,611),(1400,628),(1460,645),(1520,655),(1580,663),(1640,669),(1700,671),(2000,672)]]
# street side: band north of the frontage PL, ~70 ft deep (Beyer ROW), east of the apex
street=Polygon(NPL+[(p[0],p[1]-75) for p in NPL[::-1]]).buffer(0)
hyp=LineString([(193.8,95.5),(193.8-(260.7-193.8)*3,95.5-(182.9-95.5)*3)])  # extend apex-side west boundary up/left
caltrans=Polygon([(193.8,95.5),(260.7,182.9),(446.1,404.6),(0,404.6),(0,0),(150,0)]).buffer(0)   # west of I-805 line
jib=box(415,0,700,500).difference(box(0,0,700,0))   # JIB lot east of the old aisle line
ALLOWED=unary_union([S,street]).difference(caltrans)
JIBZ=S.intersection(box(415,0,700,500))
# ---- WB-67 kinematics
L1,L2=19.5,45.5      # tractor wheelbase, kingpin->trailer axle
W=8.5
def path_pts(segs,step=0.5):
    """segs: list of ('L',length) or ('A',radius,deg[+ right/- left in screen coords]) from start pose"""
    return segs
def build(start,heading,segs,step=0.5):
    x,y=start; th=math.radians(heading); pts=[(x,y,th)]
    for s in segs:
        if s[0]=='L':
            n=int(s[1]/step)
            for i in range(n): x+=step*math.cos(th); y+=step*math.sin(th); pts.append((x,y,th))
        else:
            R,deg=s[1],s[2]; n=int(abs(math.radians(deg))*R/step); dth=math.radians(deg)/max(n,1)
            for i in range(n):
                th+=dth/2; x+=R*abs(dth)*math.cos(th); y+=R*abs(dth)*math.sin(th); th+=dth/2; pts.append((x,y,th))
    return pts
def rect(cx,cy,th,front,back,w=W):
    c,s=math.cos(th),math.sin(th); nx,ny=-s,c
    P=[(cx+front*c+w/2*nx,cy+front*s+w/2*ny),(cx+front*c-w/2*nx,cy+front*s-w/2*ny),(cx-back*c-w/2*nx,cy-back*s-w/2*ny),(cx-back*c+w/2*nx,cy-back*s+w/2*ny)]
    return Polygon(P)
def sweep(pts,init_straight=True):
    F=np.array(pts[0][:2]); th=pts[0][2]
    R1=F-L1*np.array([math.cos(th),math.sin(th)]); R2=R1-L2*np.array([math.cos(th),math.sin(th)])
    bodies=[]; poses=[]
    for i,(x,y,_) in enumerate(pts):
        F=np.array([x,y])
        d=F-R1; R1=F-L1*d/np.linalg.norm(d)
        d=R1-R2; R2=R1-L2*d/np.linalg.norm(d)
        t1=math.atan2(*(F-R1)[::-1]); t2=math.atan2(*(R1-R2)[::-1])
        if i%4==0:
            bodies.append(rect(F[0],F[1],t1,4.0,L1+3))
            bodies.append(rect(R1[0],R1[1],t2,4.0,L2+3.5))
        poses.append((F,R1,R2,t1,t2))
    return unary_union(bodies),poses
def report(name,sw):
    out=sw.difference(ALLOWED.buffer(0.01)); jz=sw.intersection(JIBZ)
    print(f"{name}: outside allowed {out.area:.0f} sf, in JIB lot {jz.area:.0f} sf")
    return out,jz

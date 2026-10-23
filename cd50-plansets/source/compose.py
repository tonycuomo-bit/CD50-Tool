import numpy as np, cv2, pymupdf as fitz, os
TAG=os.environ.get('TAG','')
PPF=4.0                       # output px per ft
k=PPF*20/72                   # px per pt
dpi=72*k
d=fitz.open(os.environ.get('SVG','lines.svg')); pdf=fitz.open('pdf',d.convert_to_pdf()); pg=pdf[0]
pdf.save('sketch_lines'+TAG+'.pdf')
pix=pg.get_pixmap(matrix=fitz.Matrix(2*k,2*k),alpha=False)
img=np.frombuffer(pix.samples,np.uint8).reshape(pix.h,pix.w,3)
img=cv2.resize(img,(pix.w//2,pix.h//2),interpolation=cv2.INTER_AREA)
h,w=img.shape[:2]
T=np.load('T.npy')            # plan pts -> aerial px
A=np.array([[1/k,0,80],[0,1/k,60],[0,0,1]])
Mm=T@A                        # out px -> aerial px
ae=cv2.imread('f018804d-San_Ysidro_Overhead.png')
m=np.zeros(ae.shape[:2],np.uint8)
for x0,y0,x1,y1 in [(432,560,765,600),(636,560,666,590),(585,300,710,345),(718,470,762,550),(715,235,755,280),(840,685,910,720),(960,700,997,730),(530,812,720,832),(338,0,360,20)]:
    m[y0:y1,x0:x1]=255
hsv=cv2.cvtColor(ae,cv2.COLOR_BGR2HSV)
lab=((hsv[...,2]>200)&(hsv[...,1]<60))|(hsv[...,2]<70)
mm=((m>0)&lab).astype(np.uint8)*255
mm=cv2.dilate(mm,np.ones((5,5),np.uint8))
ae=cv2.inpaint(ae,mm,7,cv2.INPAINT_TELEA)
cv2.imwrite('aerial_clean.png',ae)
bg=cv2.warpAffine(ae,Mm,(w,h),flags=cv2.WARP_INVERSE_MAP|cv2.INTER_CUBIC,borderValue=(255,255,255))
g=cv2.cvtColor(bg,cv2.COLOR_BGR2GRAY).astype(np.float32)
light=255-(255-g)*0.24
light=np.dstack([light]*3)
lines=cv2.cvtColor(img,cv2.COLOR_RGB2BGR).astype(np.float32)/255
out=(light*lines).clip(0,255).astype(np.uint8)
cv2.imwrite('sketch_merged'+TAG+'.jpg',out,[cv2.IMWRITE_JPEG_QUALITY,86])
cv2.imwrite('sketch_lines'+TAG+'.png',cv2.cvtColor(img,cv2.COLOR_RGB2BGR))
print(w,h, w/PPF, h/PPF)

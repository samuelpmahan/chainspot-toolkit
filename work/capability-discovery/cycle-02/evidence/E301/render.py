from pathlib import Path
import json,hashlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from matplotlib.lines import Line2D
from PIL import Image
import numpy as np
p=Path(__file__).resolve().parent
r=json.loads((p/'native-receipt.json').read_text())
im=Image.open(p/'provider/artifacts/replay/source/IMG_5641.jpg').convert('RGB')
# Display original JPEG through explicit source→canonical y translation; all native points unchanged.
x0,x1,y0,y1=405,525,930,1020
crop=np.asarray(im.crop((x0,y0+4,x1,y1+4)))
fig,axes=plt.subplots(2,5,figsize=(21,9),layout='constrained')
for idx,(ax,o) in enumerate(zip(axes.flat,r['outcomes'])):
 ax.imshow(crop,extent=(x0,x1,y1,y0),interpolation='nearest')
 b=r['badge']['bbox'];ax.add_patch(Rectangle(b[:2],b[2],b[3],fill=False,edgecolor='white',linestyle='--',linewidth=2));ax.add_patch(Rectangle(b[:2],b[2],b[3],fill=False,edgecolor='black',linestyle=':',linewidth=1))
 pts=np.asarray(o['rawtrace']['points'])
 if len(pts)>1:
  ax.plot(pts[:,0],pts[:,1],color='black',linewidth=4,zorder=4)
  ax.plot(pts[:,0],pts[:,1],'-o',color='#00f3ff',linewidth=2,markersize=4,markerfacecolor='#00f3ff',zorder=5)
 ax.scatter(*o['startPx'],c='#ff36d2',s=90,marker='*',edgecolors='black',zorder=6)
 if o['seedType']=='explicit-bbox-exit':
  e=o['exitGeometry'];a=np.asarray(r['badge']['center']);b=np.asarray(o['startPx'])
  ax.plot([a[0],b[0]],[a[1],b[1]],':',color='#ff36d2',linewidth=1.2,zorder=3)
  ax.scatter(*e['bboxExitCanonical'],c='yellow',s=25,marker='x',zorder=7)
 label=o['name'].replace('center-','center / ').replace('exit-','exit / ').replace('-minus15',' −15°').replace('-plus15',' +15°').replace('-plus1step',' +9.25 px').replace('-plus2step',' +18.5 px')
 t=o['rawtrace'];ax.set_title(f"{label}\nL={t['lengthPx']:g} px; outside-seg={o['geometry']['outsideBadgeSegmentsLengthPx']:.2f} px\nUNKNOWN / {t['reason']}; noBasket",fontsize=10.5)
 ax.set_xlim(x0,x1);ax.set_ylim(y1,y0);ax.set_xticks([420,460,500]);ax.set_yticks([940,980,1020]);ax.tick_params(labelsize=9)
 ax.set_xlabel('canonical x px (= source x)',fontsize=9)
 if idx%5==0:ax.set_ylabel('canonical y px',fontsize=10)
 if idx%5==4:
  sec=ax.secondary_yaxis('right',functions=(lambda y:y+4,lambda y:y-4));sec.set_ylabel('original JPEG y px',fontsize=10);sec.tick_params(labelsize=9)
fig.suptitle('IMG_5641 / badge-9: ten native rawtraces on one unchanged gateway field\nCoordinates: canonical pixels; original JPEG = canonical + [0, 4] px. All results UNKNOWN, no basket claim.\nOutside-seg counts only segments with both endpoints outside the badge bbox; crossing segments excluded.',fontsize=14)
legend=[Line2D([0],[0],color='#00b2c0',marker='o',label='native emitted rawtrace points'),Line2D([0],[0],color='#ff36d2',marker='*',linestyle='None',label='counterfactual start seed'),Line2D([0],[0],color='#ff36d2',linestyle=':',label='seed construction only (not traced)'),Line2D([0],[0],color='black',linestyle=':',label='detected start badge bbox')]
fig.legend(handles=legend,loc='outside lower center',ncol=4,fontsize=10)
fig.savefig(p/'rawtraces.png',dpi=160)
fig.savefig(p/'rawtraces.pdf')
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
(p/'render-receipt.json').write_text(json.dumps({'schema':'c1-render-receipt@1','nativeReceiptSha256':sha(p/'native-receipt.json'),'sourceJpegSha256':sha(p/'provider/artifacts/replay/source/IMG_5641.jpg'),'pngSha256':sha(p/'rawtraces.png'),'renderCodeSha256':sha(Path(__file__)),'displayDecoder':'Pillow RGB JPEG only; not native decode identity','displayCropCanonical':[x0,y0,x1,y1],'displayCropOriginalJPEG':[x0,y0+4,x1,y1+4],'all10VariantsShown':True,'coordinates':'Raw native points unchanged canonical; source backdrop shifted y −4 px. Original source y secondary axis +4.','interpretation':'Counterfactual seeds and traces, no ground truth or route/basket ownership labels.'},indent=2)+'\n')

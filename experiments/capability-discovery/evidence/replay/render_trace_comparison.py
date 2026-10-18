#!/usr/bin/env python3
"""Render fresh native trace receipts over the original JPEG; no CV is executed.
Requires Python 3, Pillow, NumPy and Matplotlib. Run with --source original.jpg.
"""
from pathlib import Path
import argparse, hashlib, json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import Rectangle
from PIL import Image
import numpy as np

SOURCE_SHA = 'e6616738640eee1d05d8cc2b59dd657f24b4a5a01dc2f68571b7e44c6f372b8a'
EXPECTED = {'baseline': 'bf0ca6a66866c53fe9ad58b55a231e4beb483b66189a5a7ffc46701031cb8ac1',
            'heading': '1b9fd087d8532f7dfd0c06e25f212733de24e8c5e6fde5db1ae5fa037b8c6160'}
def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def require(condition, message):
    if not condition: raise ValueError(message)
def main():
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--baseline', type=Path, default=here/'input/baseline-native.json')
    parser.add_argument('--heading', type=Path, default=here/'input/heading-native.json')
    parser.add_argument('--out', type=Path, default=here/'output')
    args = parser.parse_args()
    require(digest(args.source) == SOURCE_SHA, 'Original JPEG hash mismatch')
    documents = {}
    for name, file in [('baseline', args.baseline), ('heading', args.heading)]:
        require(digest(file) == EXPECTED[name], f'{name} fresh receipt hash mismatch')
        documents[name] = json.loads(file.read_text())
    base, head = documents['baseline'], documents['heading']
    for name, d in documents.items():
        require(d['source']['sha256'] == SOURCE_SHA, f'{name} source mismatch')
        require(d['source']['frame']['canonicalToSource'] == [0,4], 'Unexpected canonical-to-source transform')
        require(d['badgeId'] == 'badge-9' and d['teeId'] == 'tee-7', 'Unexpected native target')
        require(d['outcomes'][0]['name'] == 'baseline', 'Unexpected primary width bank')
        require(d['outcomes'][0]['traced']['outcome'] == 'unknown', 'This figure is bounded to the unknown traces')
    require(base['paramsHash'] == head['paramsHash'], 'Baseline parameters differ')
    require(base['outcomes'][0]['field'] == head['outcomes'][0]['field'], 'Field differs between heading trials')
    # The S6 row supplies an independent original-frame badge center in the heading receipt.
    # This confirms the declared translation on the badge anchor; no endpoint geometry is inferred.
    translated_center = np.array(head['badge']['center']) + np.array([0,4])
    require(np.allclose(translated_center, head['s5AxisEvidence']['badgeCenterSource'], rtol=0, atol=1e-9),
            'Source/canonical badge-anchor check failed')
    image = Image.open(args.source).convert('RGB')
    require(image.size == (base['source']['frame']['widthPx'], base['source']['frame']['heightPx']), 'Source dimensions mismatch')
    points = {name: np.asarray(d['outcomes'][0]['traced']['points'],dtype=float) + np.array([0,4]) for name,d in documents.items()}
    bx,by,bw,bh = base['badge']['bbox']; bx += 0; by += 4
    # One shared integer source crop, chosen from the actual trace and model bbox extents.
    allp = np.concatenate([*points.values(),np.array([[bx,by],[bx+bw,by+bh]])])
    x0=max(0,int(np.floor(allp[:,0].min()/10)*10-40)); x1=min(image.width,int(np.ceil(allp[:,0].max()/10)*10+40))
    y0=max(0,int(np.floor(allp[:,1].min()/10)*10-40)); y1=min(image.height,int(np.ceil(allp[:,1].max()/10)*10+40))
    crop=np.asarray(image.crop((x0,y0,x1,y1)))
    plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11,'svg.hashsalt':'E205-native-trace-v1','svg.fonttype':'none'})
    fig=plt.figure(figsize=(12,8.5),layout=None,facecolor='white')
    gs=fig.add_gridspec(2,2,height_ratios=[4.5,1.7],left=.075,right=.98,bottom=.07,top=.84,wspace=.18,hspace=.25)
    colors={'baseline':'#24b8ff','heading':'#ff7043'}
    for col,(name,d) in enumerate(documents.items()):
        ax=fig.add_subplot(gs[0,col]); ax.imshow(crop,extent=(x0-.5,x1-.5,y1-.5,y0-.5),interpolation='nearest')
        pts=points[name]; color=colors[name]
        ax.add_patch(Rectangle((bx,by),bw,bh,fill=False,edgecolor='#ffd54f',linestyle='--',linewidth=1.7))
        ax.plot(pts[:,0],pts[:,1],color='black',linewidth=4.6,zorder=4)
        ax.plot(pts[:,0],pts[:,1],color=color,linewidth=2.6,marker='.',markersize=5,zorder=5)
        ax.scatter(*pts[0],s=65,facecolor='white',edgecolor='black',linewidth=1,zorder=6)
        ax.scatter(*pts[-1],s=95,marker='X',color=color,edgecolor='black',linewidth=.8,zorder=6)
        traced=d['outcomes'][0]['traced']
        title='Baseline: legacy tee-leg heading' if name=='baseline' else 'Heading overlay: fixed S5 axis'
        ax.set_title(title+'\n'+f"{traced['lengthPx']:g} px  |  {traced['bendCount']} bend phase{'s' if traced['bendCount']!=1 else ''}  |  UNKNOWN",fontsize=12,pad=12)
        ax.set(xlim=(x0-.5,x1-.5),ylim=(y1-.5,y0-.5),xlabel='Original-source x (px)')
        if col==0: ax.set_ylabel('Original-source y (px)')
        ax.set_aspect('equal'); ax.tick_params(labelsize=9)
        ax.text(.025,.025,'badge-9 · displayed numeral '+d['badge']['label'],transform=ax.transAxes,fontsize=9,color='white',bbox={'facecolor':'black','alpha':.7,'pad':4})
    fig.suptitle('IMG_5641 — fresh baseline / heading comparison',fontsize=18,fontweight='bold',x=.075,ha='left',y=.975)
    delta_px = head['outcomes'][0]['traced']['lengthPx'] - base['outcomes'][0]['traced']['lengthPx']
    fig.text(.075,.92,f'Changing the heading extends the retained trace by {delta_px:g} px; both runs stop unknown / petered-out.',fontsize=12)
    legend=[Line2D([0],[0],color='#ffd54f',ls='--',lw=1.7,label='Model badge bbox'),Line2D([0],[0],marker='o',markerfacecolor='white',markeredgecolor='black',ls='',label='Trace start'),Line2D([0],[0],marker='X',color='#555',ls='',label='Last retained point (unknown)')]
    fig.legend(handles=legend,loc='upper left',bbox_to_anchor=(.067,.895),ncol=3,frameon=False,fontsize=10)
    foot=fig.add_subplot(gs[1,:]); foot.axis('off')
    rows=[]
    for name,d in documents.items():
        t=d['outcomes'][0]['traced']; rows.append([name.capitalize(),f"{d['headingRad']*180/np.pi:.6f}",f"{t['lengthPx']:g}",str(t['bendCount']),t['outcome']+' / '+t['reason']])
    table=foot.table(cellText=rows,colLabels=['Invocation','Heading (deg)','Length (px)','Bend phases','Native status'],colWidths=[.17,.18,.14,.14,.37],cellLoc='left',colLoc='left',bbox=[0,.54,1,.4])
    table.auto_set_font_size(False); table.set_fontsize(10)
    for (r,c),cell in table.get_celld().items():
        cell.set_edgecolor('#d2d7de'); cell.set_facecolor('#edf1f5' if r==0 else 'white')
    params = base['parameters']
    foot.text(0,.39,f"Frame: trace canonical (x, y) → source (x, y + 4 px); field scale {params['fieldScale']:g} px/cell; τ = {params['supportTau']:g}; corridor tolerance = {params['corridorWidthPx']:g} px.",fontsize=10)
    foot.text(0,.22,'Same source, canonical raster, parameters, support and theta fields. Badge bbox is model geometry, not pixel ownership.',fontsize=10)
    foot.text(0,.05,'Arrival, basket ownership and human geometry acceptance: UNKNOWN. No basket or ground-truth overlay is drawn.',fontsize=10)
    fig.text(.075,.025,'Fresh receipts: baseline '+EXPECTED['baseline'][:12]+'…  /  heading '+EXPECTED['heading'][:12]+'…  ·  source '+SOURCE_SHA[:12]+'…',fontsize=9,color='#4a5568')
    args.out.mkdir(parents=True,exist_ok=True)
    outputs=[]
    for suffix in ['png','svg']:
        file=args.out/f'baseline-vs-heading.{suffix}'
        metadata={'Software':'E205 standalone trace renderer'} if suffix=='png' else {'Date':None,'Creator':'E205 standalone trace renderer'}
        fig.savefig(file,dpi=180,metadata=metadata)
        outputs.append({'path':file.name,'sha256':digest(file),'bytes':file.stat().st_size})
    plt.close(fig)
    receipt={'schema':'fresh-native-trace-render@1','source':{'sha256':SOURCE_SHA,'widthPx':image.width,'heightPx':image.height,'logicalPath':'source/provider/artifacts/replay/source/IMG_5641.jpg','gitRef':'49255331791b1245cf0f9cd699816175f94e70f2','gitBlob':'ffdd790992dbb0f971e72204c440c0e4c4559216'},'sourceDisplayDecoder':'Pillow RGB JPEG decode; display background only, not a claim of byte equality with native jpeg-js canonical RGBA','coordinates':{'traceFrame':'native canonical','displayFrame':'original JPEG source pixels','canonicalToSource':[0,4],'yOffsetPx':4,'transformAuthority':'source.frame.canonicalToSource in both exact native receipts','badgeAnchorSourceMatch':True,'sourceCropXYXY':[x0,y0,x1,y1],'pixelDisplay':'nearest; source pixel centers at integer coordinates'},'runs':[{ 'name':name,'input':name+'-native.json','sha256':EXPECTED[name],'variantIdentitySha256':d['outcomes'][0]['variantIdentitySha256'],'headingRad':d['headingRad'],'lengthPx':d['outcomes'][0]['traced']['lengthPx'],'bendPhases':d['outcomes'][0]['traced']['bendCount'],'status':d['outcomes'][0]['traced']['outcome'],'reason':d['outcomes'][0]['traced']['reason']}for name,d in documents.items()],'rendererSha256':digest(Path(__file__)),'figures':outputs,'geometryAcceptance':'UNKNOWN','cvExecuted':False}
    (args.out/'render-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt,indent=2))
if __name__=='__main__': main()

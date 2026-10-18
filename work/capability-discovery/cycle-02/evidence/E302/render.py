from pathlib import Path
import json, numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import Normalize
root=Path(__file__).resolve().parent
r=json.loads((root/'receipt.json').read_text())
fig,axes=plt.subplots(7,3,figsize=(17,15),gridspec_kw={'width_ratios':[1.55,1.35,1.05]})
xs=np.array([84,117,150,183,211.6])
for k,case in enumerate(r['cases']):
    ax=axes[k,0]; image=np.frombuffer((root/(case['id']+'.rgba')).read_bytes(),dtype=np.uint8).reshape(200,320,4)
    ax.imshow(image); ax.set_xlim(20,280);ax.set_ylim(155,45)
    ax.axhline(100,color='#b91c1c',lw=.8,ls='--',label='asserted centerline')
    for x in xs: ax.plot([x,x],[70,130],color='#2563eb',lw=.7,alpha=.65)
    ax.set_title(case['id'],fontsize=11,loc='left',fontweight='bold'); ax.set_ylabel('image y (source px)',fontsize=8)
    ax.set_xticks([40,100,160,220,260]); ax.tick_params(labelsize=8)
    if k==6:ax.set_xlabel('image x (source px)')
    ax=axes[k,1]
    for name,col,m in [('wPx','#2563eb','o'),('cPx','#b91c1c','s')]:
        vals=[s['wideFit'][name] if s['wideFit'] else np.nan for s in case['stationRows']]
        ax.plot(xs,vals,color=col,marker=m,lw=1.3,label='width w' if name=='wPx' else 'midpoint c')
    ax.axhline(0,color='#777777',lw=.5); ax.set_ylim(-5,58);ax.set_xlim(75,220); ax.set_xticks(xs,[str(x) for x in xs],fontsize=8);ax.tick_params(axis='y',labelsize=8);ax.grid(alpha=.2)
    fit=case['global']['wideFit']; learned=case['global']['widthLearned']
    label='global: no pair' if fit is None else f"global: w={fit['wPx']:.3f}, c={fit['cPx']:.3f} px"
    ax.set_title(label,loc='left',fontsize=9)
    widths=['∅' if s['wideFit'] is None else f"{s['wideFit']['wPx']:.2f}" for s in case['stationRows']]
    ax.text(.02,.04,'station widths: '+', '.join(widths),transform=ax.transAxes,fontsize=8,backgroundcolor='white')
    ax.set_ylabel('source px',fontsize=8)
    if k==0:ax.legend(fontsize=7,loc='upper right')
    if k==6:ax.set_xlabel('station x (source px)')
    ax=axes[k,2]; channels=['leftRail','innerLeft','innerRight','rightRail']
    mat=np.array([[s['rawChannels']['atWidth40'][ch] for s in case['stationRows']] for ch in channels],float)
    ax.imshow(mat,vmin=0,vmax=1,cmap='Blues',aspect='auto')
    for i in range(4):
      for j in range(5):ax.text(j,i,f'{mat[i,j]:.1f}',ha='center',va='center',fontsize=9,color='white' if mat[i,j]>.6 else '#111111')
    ax.set_yticks(range(4),['L rail','inner L','inner R','R rail'],fontsize=8);ax.set_xticks(range(5),[str(x) for x in xs],fontsize=8)
    ax.set_title(f'Dev72 channels at W=40 px; selected W={learned["widthPx"]}',fontsize=9,loc='left')
    if k==6:ax.set_xlabel('station x (source px)')
fig.suptitle('Existing bilateral/centerline composition exposes local mismatch, but cannot identify a path',fontsize=16,x=.03,ha='left',y=.995)
fig.text(.03,.969,'7 exposed synthetic fixtures. Bright foreground RGB145 on RGB100; all operations unchanged. Blue raster ticks: ±30px profile reach. Red dashed: asserted centerline y=100.',fontsize=10)
fig.text(.03,.949,'Independent 16px profile windows; wide diagnostic center gate12px. Edge w/c are bilinear fit measurements. Channel values are source-normalized lifts, not confidence.',fontsize=10)
fig.text(.03,.015,'Counterexample: corridor40 and capsule-patch have identical global + station profiles, fitted edges, and Dev72 channels. No endpoint/path identity follows. No production thresholds or meter scale.',fontsize=10,fontweight='bold')
plt.tight_layout(rect=[.02,.035,.99,.94],h_pad=1.15,w_pad=2.0)
fig.savefig(root/'bilateral-composition.png',dpi=160)
fig.savefig(root/'bilateral-composition.svg')
print(json.dumps({'figure':'bilateral-composition.png','sizePx':[2720,2400],'data':'receipt.json','AIImagery':False}))

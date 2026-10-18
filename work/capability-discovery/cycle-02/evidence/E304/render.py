from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
root=Path(__file__).resolve().parent;d=json.loads((root/'measurements.json').read_text());prepared=json.loads((root/'prepared.json').read_text())
fig,axes=plt.subplots(2,2,figsize=(15,10),dpi=160)
colors=['#007a78','#d64e31']
for ax,scene in zip(axes.ravel(),prepared['scenes']):
 ax.imshow(np.array(scene['image']['gray']).reshape(200,300),cmap='gray',vmin=60,vmax=200,origin='upper')
 rows=[c for c in d['cases'] if c['scene']==scene['id']]
 lines=[]
 for i,row in enumerate(rows):
  points=np.array([row['geometry']['segments'][0] and row['sourceSamples'][0]['point']]+[s['point'] for s in row['sourceSamples'][1:]])
  # All shown candidate coordinates and observations come from the measured receipt.
  ax.plot(points[:,0],points[:,1],color=colors[i],ls='-' if i==0 else '--',lw=2.2,alpha=.9)
  for station,obs in zip(row['sourceSamples'],row['observations']):
   p=station['point'];ax.scatter(*p,s=8,c='#ecf16a' if obs['score'] is not None and obs['score']>=.5 else '#8f2898',zorder=4)
   if station['pairedEdges'] is not None:
    e=station['pairedEdges'];a,b=np.array(e['left']),np.array(e['right']);m=(a+b)/2
    ax.plot([a[0],b[0]],[a[1],b[1]],color=colors[i],lw=.5,alpha=.18);ax.plot([p[0],m[0]],[p[1],m[1]],color=colors[i],lw=.9)
  s=row['summary'];sf=s['supportSampling'];off=s['meanMidpointOffsetPx'];off='UNKNOWN' if off is None else f'{off:.1f}px'
  lines.append(f"{row['candidate']}: {s['lengthPx']:.0f}px, turns={s['turnCountOverOneDegree']}, "
               f"support={sf['supportedSamples']}/{sf['observedSamples']}, pairs={s['sampleCount']-s['edgeUnknownCount']}/{s['sampleCount']}, offset={off}")
 ax.set_title(scene['id']+'\n'+'\n'.join(lines),fontsize=9,loc='left',pad=8)
 ax.set_xlim(0,300);ax.set_ylim(200,0);ax.set_aspect('equal');ax.set_xlabel('source x (px)');ax.set_ylabel('source y (px)')
handles=[Line2D([0],[0],color=colors[0],lw=2,label='Designated construction / width hypothesis'),Line2D([0],[0],color=colors[1],lw=2,ls='--',label='Competing construction / width hypothesis'),Line2D([0],[0],marker='o',color='w',markerfacecolor='#ecf16a',label='Source sensor score ≥ .5'),Line2D([0],[0],marker='o',color='w',markerfacecolor='#8f2898',label='Source sensor score < .5')]
fig.legend(handles=handles,loc='lower center',ncol=2,fontsize=10)
fig.suptitle('E304 exposed synthetic composition probes — construction correspondence only',fontsize=15)
fig.text(.5,.065,'Cross-section lines: measured source edge pairs only. Missing pairs remain UNKNOWN. Turn cutoff 1° is exploratory; no ranking weights or course acceptance.',ha='center',fontsize=9)
fig.tight_layout(rect=(0,.1,1,.94));fig.savefig(root/'route-composition.png');plt.close(fig)
print(root/'route-composition.png')

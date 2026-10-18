from pathlib import Path
import csv, hashlib, json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

OUT = Path(__file__).parent
PIN = Path('/workspace/scratch/8528bb251845/discovery-cycle03/seam-figure-input.json')
pin = json.loads(PIN.read_text())
source = Path(pin['path']).read_bytes()
sha = lambda b: hashlib.sha256(b).hexdigest()
assert sha(source) == pin['sha256']
(OUT/'numeric-seam-input.json').write_bytes(source)
r = json.loads(source)
assert [row['widthArgPx'] for row in r['rows']] == [24, 30, 36]
fields = ['widthArgPx','frame','lPx','rPx','cPx','wPx','score','gl','gr','sensorEqual']
table = []
for row in r['rows']:
    for frame, key in [('Full source','fullFit'),('Crop','croppedFit')]:
        table.append({'widthArgPx':row['widthArgPx'],'frame':frame,**row[key], 'sensorEqual':row['sensorEqual']})
(OUT/'fit-table.json').write_text(json.dumps({'schema':'E510-receipt-value-table@1','inputSha256':sha(source),'rows':table}, indent=2)+'\n')
with (OUT/'fit-table.csv').open('w', newline='') as f:
    w=csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(table)

plt.rcParams.update({'font.family':'DejaVu Sans','font.size':12,'axes.spines.top':False,'axes.spines.right':False})
fig=plt.figure(figsize=(14,8.8), facecolor='#fbfcfe')
fig.text(.055,.95,'Recorded numeric seam under integer crop translation', fontsize=23, weight='bold', color='#16283c')
fig.text(.055,.91,'Fitted left/right edges and midpoint change despite the reported exact source-pixel copy.',fontsize=13,color='#42566b')
fig.text(.055,.856,'Raw profile max |Δ| = 2.55795 × 10⁻¹³',fontsize=15,weight='bold',color='#193c60')
fig.text(.54,.856,'Visible counts equal  •  Sensor channels equal at all 3 widths',fontsize=12,color='#193c60')
ax=fig.add_axes([.085,.30,.52,.48],facecolor='#fbfcfe')
colors={'Full source':'#14547e','Crop':'#d56525'}
centers={24:5,30:3,36:1}
for row in table:
    y=centers[row['widthArgPx']]+(.20 if row['frame']=='Full source' else -.20)
    color=colors[row['frame']]
    ax.plot([row['lPx'],row['rPx']],[y,y],color=color,lw=3,solid_capstyle='round')
    ax.scatter([row['lPx'],row['rPx']],[y,y],marker='|',s=220,color=color,linewidths=2.2,zorder=3)
    ax.scatter([row['cPx']],[y],s=80,marker='o',color=color,edgecolor='white',linewidth=1,zorder=4)
    ax.text(row['rPx']+.7,y,f"c = {row['cPx']:.3f}",fontsize=10,color=color,va='center')
ax.axvline(0,color='#8b9ba9',lw=1,ls='--',zorder=0)
ax.set_xlim(-24,26);ax.set_ylim(.3,5.7)
ax.set_yticks([5,3,1],['24 px','30 px','36 px'])
ax.set_ylabel('Explicit requested width',labelpad=15)
ax.set_xlabel('Normal offset from supplied center (pixels)',labelpad=12)
ax.set_xticks([-20,-10,0,10,20]);ax.grid(axis='x',alpha=.18)
ax.spines['left'].set_visible(False)
ax.legend(handles=[Line2D([0],[0],color=colors['Full source'],lw=3,label='Full source'),Line2D([0],[0],color=colors['Crop'],lw=3,label='Crop'),Line2D([0],[0],marker='o',color='#4f606e',linestyle='none',label='Fitted midpoint')],loc='upper left',bbox_to_anchor=(0,1.15),ncol=3,frameon=False,fontsize=11,handlelength=1.7)
ax.text(0,-.22,'End ticks = fitted left/right edges; dots = fitted midpoints.',transform=ax.transAxes,fontsize=10,color='#53687c')

tax=fig.add_axes([.65,.31,.31,.45]);tax.axis('off')
tax.text(0,1.065,'Recorded fit values (pixels)',fontsize=14,weight='bold',color='#16283c')
cells=[]
for row in table:
    cells.append([str(row['widthArgPx']), 'Full' if row['frame']=='Full source' else 'Crop',f"{row['lPx']:.3f}",f"{row['rPx']:.3f}",f"{row['cPx']:.3f}"])
t=tax.table(cellText=cells,colLabels=['Width','Frame','Left','Right','Mid'],cellLoc='right',colLoc='right',loc='upper left',bbox=[0,.10,1,.85],colWidths=[.17,.17,.22,.22,.22])
t.auto_set_font_size(False);t.set_fontsize(10.5)
for (rr,cc),cell in t.get_celld().items():
    cell.set_edgecolor('#d7dfe7');cell.set_linewidth(.5)
    if rr==0:cell.set_facecolor('#e8eef5');cell.set_text_props(weight='bold',color='#263d54')
    else:
        cell.set_facecolor('#f3f7fb' if rr%2 else '#fff6ef')
        cell.set_text_props(color=colors['Full source'] if rr%2 else colors['Crop'])
tax.text(0,-.035,'Display rounded to 0.001 px. JSON/CSV retain\nall numeric values from the pinned receipt.',fontsize=9.5,color='#53687c',linespacing=1.5)

fig.text(.055,.17,'Large discrete fit jumps coexist with a tiny recorded profile difference.',fontsize=15,weight='bold',color='#16283c')
fig.text(.055,.127,'Producer hypothesis: floating addition order changes roundoff; strict score comparison can select different tied peaks.',fontsize=11,color='#42566b')
fig.text(.055,.087,'Reproducible recorded counterexample; independent source validation R506 pending. No acceptance.',fontsize=11,weight='bold',color='#8f3c28')
fig.text(.055,.05,'Equivalence UNKNOWN  •  Scientific validity UNKNOWN  •  Semantic / route identity UNKNOWN',fontsize=11,color='#42566b')
fig.text(.055,.018,f"Input SHA256  {sha(source)}   |   E510: receipt rendering only; no candidate or CV execution",fontsize=8,color='#687b8e')
fig.savefig(OUT/'numeric-seam-figure.png',dpi=180,facecolor=fig.get_facecolor())
plt.close(fig)
assert (OUT/'numeric-seam-input.json').read_bytes()==source
print(json.dumps({'inputSha256':sha(source),'rowCount':len(table),'figureSha256':sha((OUT/'numeric-seam-figure.png').read_bytes()),'widths':[row['widthArgPx'] for row in r['rows']],'profileMaximumAbsoluteDifference':r['profileMaximumAbsoluteDifference'],'visibleCountsEqual':r['visibleCountsEqual'],'sensorEqual':[row['sensorEqual'] for row in r['rows']]},indent=2))

from pathlib import Path
from types import SimpleNamespace
import ast, json, hashlib, math
import numpy as np
from scipy.ndimage import map_coordinates
root=Path(__file__).resolve().parent
protocol=json.loads((root/'protocol.json').read_text())
assert hashlib.sha256((root/'protocol.json').read_bytes()).hexdigest()==(root/'protocol.sha256').read_text().strip()
for s in protocol['sources']: assert hashlib.sha256((root/s['file']).read_bytes()).hexdigest()==s['sha256']
# Exact source functions; only caller's raster adapter and sampler are supplied.
raw=(root/'vendor/hallway-track.py').read_bytes();tree=ast.parse(raw)
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['unit','profile','edge_pair']]
def samp(image,x,y): return map_coordinates(image,[y,x],order=1,mode='nearest')
space={'np':np,'math':math,'OFFS':np.arange(-30,30.01,.25),'samp':samp}
exec(compile(ast.Module(body=nodes,type_ignores=[]),'source-bound-hallway-track.py','exec'),space)
def raster(scene):
 y,x=np.mgrid[:200,:300]; d=np.full(x.shape,np.inf)
 for ribbon in scene['ribbons']:
  dd=np.full(x.shape,np.inf)
  for a,b in zip(ribbon['points'],ribbon['points'][1:]):
   a=np.array(a);v=np.array(b)-a;t=np.clip(((x-a[0])*v[0]+(y-a[1])*v[1])/float(v@v),0,1)
   dd=np.minimum(dd,np.hypot(x-a[0]-t*v[0],y-a[1]-t*v[1]))
  d=np.minimum(d,dd-ribbon['width']/2)
 return np.where(d<0,145.,100.)
def samples(points):
 result=[]
 for i,(a,b) in enumerate(zip(points,points[1:])):
  a=np.array(a,float);v=np.array(b,float)-a;L=np.linalg.norm(v);n=max(1,math.ceil(L/6));h=math.atan2(v[1],v[0])
  for k in range(n):result.append({'point':(a+v*k/n).tolist(),'headingRad':h,'sourceSegment':i})
 result.append({'point':list(points[-1]),'headingRad':h,'sourceSegment':len(points)-2})
 return result
out=[]
for scene in protocol['scenes']:
 lum=raster(scene);image={'width':300,'height':200,'gray':lum.astype('uint8').ravel().tolist()};C=SimpleNamespace(W=300,H=200,lum=lum,MASK=np.zeros_like(lum))
 candidates=[]
 for candidate in scene['candidates']:
  ss=samples(candidate['points'])
  for s in ss:
   p=np.array(s['point']);prof,ok,nT=space['profile'](C,p,s['headingRad'],-5,6)
   e=space['edge_pair'](prof,ok,nT,candidate['width'],tolW=3,lat_lim=12)
   s['edgeMeasurement']=e
   if e is None:s['pairedEdges']=None
   else:
    normal=np.array([-math.sin(s['headingRad']),math.cos(s['headingRad'])]);s['pairedEdges']={'left':(p+e['l']*normal).tolist(),'right':(p+e['r']*normal).tolist()}
  candidates.append({**candidate,'samples':ss})
 out.append({**scene,'candidates':candidates,'image':image})
(root/'prepared.json').write_text(json.dumps({'protocolSha256':(root/'protocol.sha256').read_text().strip(),'scenes':out},separators=(',',':'))+'\n')
print(json.dumps({'status':'executed','scenes':len(out),'candidateCases':sum(len(s['candidates']) for s in out),'sourceFunctions':['unit','profile','edge_pair']}))

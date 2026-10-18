from pathlib import Path
import ast,json,hashlib,numpy as np
root=Path(__file__).resolve().parent.parent
catalog=json.loads((root/'catalog.json').read_text());s=next(s for s in catalog['sources'] if s['id']=='hallway-track');raw=(root/s['file']).read_bytes()
assert hashlib.sha256(raw).hexdigest()==s['sha256']
# Execute exact edge_pair AST only. Do not import historical Course or its hardcoded files.
tree=ast.parse(raw);node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='edge_pair')
space={'np':np,'OFFS':np.arange(-30,30.01,.25)}
exec(compile(ast.Module(body=[node],type_ignores=[]),s['path'],'exec'),space)
offs=space['OFFS'];profile=np.where(abs(offs)<=20,145.,100.);visible=np.full(len(offs),40)
edge=space['edge_pair'](profile,visible,40,40)
assert edge is not None and abs(edge['w']-40)<1 and abs(edge['c'])<1 and edge['score']>0
assert space['edge_pair'](profile,np.zeros(len(offs)),40,40) is None
print(json.dumps({'status':'PASS','operation':'edge.pair','edge':edge,'zeroVisibility':'None','acceptance':'not_assessed','limits':'Exact function AST on synthetic profile only; full Course adapter/fit/refine not executed.'},indent=2))

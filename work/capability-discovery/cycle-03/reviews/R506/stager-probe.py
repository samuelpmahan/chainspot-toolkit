from pathlib import Path
import json,hashlib,struct,zlib,importlib.util,subprocess,sys
sys.dont_write_bytecode=True
from PIL import Image
P=Path(__file__).parent;D=P.parent;R=D.parent.parent/'chainspot-discovery-lab'
module=R/'experiments/capability-discovery/source-pixels/stage-png.py'
spec=importlib.util.spec_from_file_location('candidate_stager',module);stage=importlib.util.module_from_spec(spec);spec.loader.exec_module(stage)
sha=lambda b:hashlib.sha256(b).hexdigest()
checks=[]
def passed(name):checks.append({'name':name,'pass':True})
def rejected(path,expected,match):
 try:stage.stage(path,expected,'D5 probe','original')
 except Exception as e:
  assert match in str(e),(str(e),match);return str(e)
 raise AssertionError('unexpected accepted '+str(path))
o=json.loads((D/'oracles.json').read_text())
for file in o['fixture']['sourceFiles']:
 path=D/file['path'];assert sha(path.read_bytes())==file['sourceFileSha256']
 s=stage.stage(path,file['sourceFileSha256'],'D5 literal RGBA','original');assert s['image']['data']==o['fixture']['rgba'];assert s['provenance']['rgbaSha256']==o['fixture']['decodedRgbaSha256'];assert s['provenance']['sourcePngSha256']==file['sourceFileSha256'];assert s['provenance']['decoder']['version']==stage.PIL.__version__;passed('frozen '+file['path']+' source/decoded hashes and alpha0 RGB exact')
rejected(D/o['fixture']['sourceFiles'][1]['path'],o['fixture']['sourceFiles'][0]['sourceFileSha256'],'source PNG SHA256 mismatch');passed('same decoded RGBA alternate encoding fails expected encoded hash')
chunk=lambda t,b:struct.pack('>I',len(b))+t+b+struct.pack('>I',zlib.crc32(t+b)&0xffffffff)
for ctype,channels in [(2,3),(6,4)]:
 path=P/f'16bit-{ctype}.png';encoded=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,16,ctype,0,0,0))+chunk(b'IDAT',zlib.compress(b'\0'+b'\x12\x34'*channels))+chunk(b'IEND',b'');path.write_bytes(encoded)
 rejected(path,sha(encoded),'no bit-depth reduction');passed(f'16bit type{ctype} refused before quantization')
for mode in ['L','P']:
 path=P/f'unsupported-{mode}.png';Image.new(mode,(1,1)).save(path);rejected(path,sha(path.read_bytes()),'unsupported');passed(mode+' refused')
path=P/'rgb-transparency.png';Image.new('RGB',(1,1)).save(path,transparency=(0,0,0));rejected(path,sha(path.read_bytes()),'transparency');passed('RGB transparency metadata refused')
path=P/'corrupt.png';path.write_bytes(b'not PNG');rejected(path,sha(path.read_bytes()),'IHDR');passed('corrupt image refused with matching source hash')
path=P/'rgb.png';Image.frombytes('RGB',(1,1),bytes([7,17,27])).save(path);s=stage.stage(path,sha(path.read_bytes()),'D5 RGB','original');assert s['image']['data']==[7,17,27,255];passed('RGB native8 appends alpha255')
cmd=[sys.executable,str(module),'--source',str(D/'oracle-rgba-level9.png'),'--expected-sha256',o['fixture']['sourceFiles'][1]['sourceFileSha256'],'--image-id','D5 actual CLI file control','--frame','original','--out',str(P/'staged-source.json')]
r=subprocess.run(cmd,text=True,capture_output=True);assert r.returncode==0,(r.stdout,r.stderr);assert json.loads((P/'staged-source.json').read_text())['image']['data']==o['fixture']['rgba'];passed('actual staging CLI exact file read/hash/decode/output')
r2=subprocess.run(cmd,text=True,capture_output=True);assert r2.returncode!=0 and 'FileExistsError' in r2.stderr;passed('CLI does not overwrite existing output')
(P/'stager-probe-result.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'cli':{'command':cmd,'first':{'code':r.returncode,'stdout':r.stdout,'stderr':r.stderr},'second':{'code':r2.returncode,'stdout':r2.stdout,'stderr':r2.stderr}},'Pillow':stage.PIL.__version__},indent=2)+'\n')
print(json.dumps({'passed':len(checks),'Pillow':stage.PIL.__version__}))

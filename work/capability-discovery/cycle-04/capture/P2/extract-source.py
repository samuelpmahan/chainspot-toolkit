#!/usr/bin/env python3
"""Extract an exact read-only platform blob; staging only, no CV."""
import hashlib
import io
import json
import subprocess
from pathlib import Path
import PIL
from PIL import Image

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1] / 'chainspot-discovery-lab'
REF = '49255331791b1245cf0f9cd699816175f94e70f2'
SOURCE = 'specimens/dev/Lenard-1.png'
def git(*args):
    return subprocess.check_output(['git', '-C', str(REPO), *args])
blob = git('rev-parse', f'{REF}:{SOURCE}').decode().strip()
encoded = git('cat-file', 'blob', blob)
out = HERE / 'Lenard-1.original.png'
with out.open('xb') as f:
    f.write(encoded)
with Image.open(io.BytesIO(encoded)) as im:
    im.load()
    mode, size = im.mode, im.size
    rgba = im.tobytes() if mode == 'RGBA' else im.convert('RGBA').tobytes()
record = {
    'schema': 'cycle04-source-integrity@1', 'job_id': 'E802', 'worker': 'P2',
    'sourceRef': REF, 'sourcePath': SOURCE, 'gitBlob': blob,
    'pngSha256': hashlib.sha256(encoded).hexdigest(), 'pngBytes': len(encoded),
    'fullRgbaSha256': hashlib.sha256(rgba).hexdigest(), 'fullRgbaBytes': len(rgba),
    'originalFrame': 'Lenard-1.original-source-pixel-centers',
    'imageSizePx': {'width': size[0], 'height': size[1]},
    'decoder': {'name': 'Pillow', 'version': PIL.__version__, 'sourceMode': mode,
        'outputMode': 'RGBA', 'orientation': 'stored PNG pixel order; no EXIF transform',
        'colorTransform': 'none; stored RGB channels, no ICC/gamma transform',
        'alpha': 'preserved RGBA; RGB appends 255'},
    'extraction': 'git cat-file blob of resolved exact platform object; no checkout or repo mutation',
    'cvMeasurementsExecuted': 0,
    'sourcePngPath': str(out),
    'algorithmReferenceReadOnly': 'e3e11fab5de1e4562487472585259435694d88bc',
}
with (HERE / 'source-integrity.json').open('x') as f:
    json.dump(record, f, indent=2)
    f.write('\n')
print(json.dumps(record, indent=2))

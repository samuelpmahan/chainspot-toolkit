from pathlib import Path
import hashlib
import json
import PIL
from PIL import Image

base = Path(__file__).resolve().parent
source = base / 'source/Lenard-2.png'
encoded = source.read_bytes()
with Image.open(source) as im:
    im.load()
    rgba = im.convert('RGBA').tobytes()
    record = {'widthPx': im.width, 'heightPx': im.height, 'sourceMode': im.mode,
              'pngSha256': hashlib.sha256(encoded).hexdigest(),
              'rgbaSha256': hashlib.sha256(rgba).hexdigest(),
              'decoder': {'name': 'Pillow', 'version': PIL.__version__, 'outputMode': 'RGBA',
                          'sourceMode': im.mode, 'orientation': 'stored PNG pixel order; no EXIF transform',
                          'colorTransform': 'none; stored RGB channels, no ICC/gamma transform',
                          'alpha': 'preserved RGBA; RGB appends 255'}}
    # Exact source row/column extraction for visual inspection only, no resampling.
    im.crop((480, 1240, 1210, 1840)).save(base / 'inspection-source-region.png')
print(json.dumps(record, indent=2))

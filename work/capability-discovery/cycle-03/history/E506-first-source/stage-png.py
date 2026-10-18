#!/usr/bin/env python3
"""Explicit caller staging only; verifies an existing PNG before decoding RGB/RGBA."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import PIL
from PIL import Image


def stage(path, expected_sha256, image_id, frame):
    if len(expected_sha256) != 64 or any(c not in '0123456789abcdef' for c in expected_sha256):
        raise ValueError('expected lowercase source PNG SHA256 required')
    encoded = Path(path).read_bytes()
    actual = hashlib.sha256(encoded).hexdigest()
    if actual != expected_sha256:
        raise ValueError('integrity failure: source PNG SHA256 mismatch')
    with Image.open(io.BytesIO(encoded)) as image:
        if image.format != 'PNG' or image.mode not in ('RGB', 'RGBA') or getattr(image, 'n_frames', 1) != 1:
            raise ValueError('unsupported: single-frame RGB/RGBA PNG required')
        mode = image.mode
        if mode == 'RGB' and 'transparency' in image.info:
            raise ValueError('unsupported: RGB PNG with transparency metadata; supply explicit RGBA PNG')
        image.load()
        # No ImageOps.exif_transpose, ImageCms, profile/gamma operation, or resize.
        rgba = image.tobytes() if mode == 'RGBA' else image.convert('RGBA').tobytes()
        width, height = image.size
    if not image_id.strip() or not frame.strip():
        raise ValueError('explicit image identifier and pixel frame required')
    return {'image': {'width': width, 'height': height, 'frame': frame, 'data': list(rgba)},
            'provenance': {'imageId': image_id, 'sourcePngSha256': actual,
                           'rgbaSha256': hashlib.sha256(rgba).hexdigest(),
                           'decoder': {'name': 'Pillow', 'version': PIL.__version__, 'outputMode': 'RGBA',
                                       'sourceMode': mode, 'orientation': 'stored PNG pixel order; no EXIF transform',
                                       'colorTransform': 'none; stored RGB channels, no ICC/gamma transform',
                                       'alpha': 'preserved RGBA; RGB appends 255'}}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--image-id', required=True)
    parser.add_argument('--frame', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    source = stage(args.source, args.expected_sha256, args.image_id, args.frame)
    with Path(args.out).open('x') as handle:
        json.dump(source, handle, separators=(',', ':'))
        handle.write('\n')

"""Exposed synthetic file-contract controls; no course source is opened."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from PIL import Image
spec = importlib.util.spec_from_file_location('stager', Path(__file__).with_name('stage-png.py'))
stager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stager)

class StagingContract(unittest.TestCase):
    def test_exact_rgba_alpha_and_hashes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'control.png'
            pixels = bytes([3, 7, 11, 0, 13, 17, 19, 73, 23, 29, 31, 255, 37, 41, 43, 1])
            Image.frombytes('RGBA', (2, 2), pixels).save(path)
            expected = hashlib.sha256(path.read_bytes()).hexdigest()
            source = stager.stage(path, expected, 'synthetic fixture', 'original')
            self.assertEqual(bytes(source['image']['data']), pixels)
            self.assertEqual(source['provenance']['rgbaSha256'], hashlib.sha256(pixels).hexdigest())
            self.assertEqual(source['provenance']['decoder']['version'], stager.PIL.__version__)
            with self.assertRaisesRegex(ValueError, 'integrity failure'):
                stager.stage(path, '0' * 64, 'synthetic fixture', 'original')
    def test_rgb_append_alpha_and_unsupported_modes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'control.png'
            Image.frombytes('RGB', (1, 1), bytes([7, 17, 27])).save(path)
            staged = stager.stage(path, hashlib.sha256(path.read_bytes()).hexdigest(), 'synthetic', 'original')
            self.assertEqual(staged['image']['data'], [7, 17, 27, 255])
            Image.new('P', (1, 1)).save(path)
            with self.assertRaisesRegex(ValueError, 'unsupported'):
                stager.stage(path, hashlib.sha256(path.read_bytes()).hexdigest(), 'synthetic', 'original')
            Image.new('RGB', (1, 1)).save(path, transparency=(0, 0, 0))
            with self.assertRaisesRegex(ValueError, 'unsupported'):
                stager.stage(path, hashlib.sha256(path.read_bytes()).hexdigest(), 'synthetic', 'original')

if __name__ == '__main__':
    unittest.main()

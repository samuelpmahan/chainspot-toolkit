#!/usr/bin/env python3
"""Exact, unresampled original-pixel inspection crops; no CV."""
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parent
with Image.open(root / 'Lenard-1.original.png') as im:
    im.crop((300, 950, 1100, 1750)).save(root / 'inspection-original-pixels-x300-y950.png')

# Fresh native trace comparison (E205)

This portable renderer plots the two actual W2 native receipts. It performs no CV and needs no provider repository, node_modules, or previous Attempt directory. The two input JSON files and original JPEG are hash checked before rendering.

Requirements: Python 3, Pillow, NumPy, Matplotlib. Verified with Pillow 12.3.0 and Matplotlib 3.10.8. From this directory:

```sh
python render_trace_comparison.py --source /path/to/IMG_5641.jpg
```

The JPEG is a separate input, SHA-256 `e6616738640eee1d05d8cc2b59dd657f24b4a5a01dc2f68571b7e44c6f372b8a` (627609 bytes). It is the original development image tracked at `source/provider/artifacts/replay/source/IMG_5641.jpg` in ref `49255331791b1245cf0f9cd699816175f94e70f2`, Git blob `ffdd790992dbb0f971e72204c440c0e4c4559216`. An owner with the object can recover it without checking out another branch:

```sh
git show ffdd790992dbb0f971e72204c440c0e4c4559216 > /path/to/IMG_5641.jpg
```

Outputs: `output/baseline-vs-heading.png`, `.svg`, and `render-receipt.json`. Both figures repeated byte-for-byte in the verified runtime. Other Matplotlib/font versions may change render bytes; input identities and metrics remain checked.

Coordinates: native retained trace and badge coordinates are canonical. Both native receipts declare `canonicalToSource=[0,4]`, hence source `(x,y) = canonical (x,y) + (0,4 px)`. The independent source badge center recorded in the heading receipt matches the translated native badge center. The plotted JPEG background uses Pillow decoding for display; this is not a byte-equality claim against the native jpeg-js canonical RGBA. Image pixel centers are plotted at integer source coordinates with nearest display interpolation.

The baseline primary width bank retains 27.75 px and zero bend phases. The heading overlay retains 64.75 px and one bend phase. Both return `unknown/petered-out`, without a basket. `bendCount` counts contiguous turning phases, not physical bend vertices. The figure shows model badge geometry and actual retained trace points; it supplies no ground truth, basket ownership, endpoint arrival, or human geometry acceptance.

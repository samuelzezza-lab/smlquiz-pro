#!/usr/bin/env python3
"""Generate standard PNG icons for Android and iOS PWA installation."""
import math, struct, zlib
from pathlib import Path

def inside_polygon(x, y, points):
    inside = False
    j = len(points) - 1
    for i, (xi, yi) in enumerate(points):
        xj, yj = points[j]
        if ((yi > y) != (yj > y)) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi:
            inside = not inside
        j = i
    return inside

def png(size, path):
    scale = size / 512
    bg = (16, 26, 50, 255)
    purple = (167, 139, 250, 255)
    mint = (72, 224, 187, 255)
    # Stylized M, matching the existing SMLQUIZ SVG logo.
    m = [(120,116),(184,116),(256,297),(328,116),(392,116),(392,396),
         (336,396),(336,218),(256,400),(176,218),(176,396),(120,396)]
    rows = []
    for py in range(size):
        y = (py + 0.5) / scale
        row = bytearray([0])
        for px in range(size):
            x = (px + 0.5) / scale
            # Rounded-square background, with transparent corners.
            dx = max(128 - x, 0, x - 384)
            dy = max(128 - y, 0, y - 384)
            if dx*dx + dy*dy > 128*128:
                row.extend((0,0,0,0)); continue
            color = bg
            if inside_polygon(x, y, m):
                color = purple
            if (x - 396)**2 + (y - 388)**2 <= 36**2:
                color = mint
            row.extend(color)
        rows.append(bytes(row))
    raw = b"".join(rows)
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    data = b"\x89PNG\r\n\x1a\n"
    data += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 9))
    data += chunk(b"IEND", b"")
    Path(path).write_bytes(data)

for n in (192, 512):
    png(n, Path("public") / f"icon-{n}.png")
print("Generated public/icon-192.png and public/icon-512.png")

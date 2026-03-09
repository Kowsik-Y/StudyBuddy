#!/usr/bin/env python3
"""
generate_icons.py — create PNG icons for the Chrome extension.

Run once before loading the extension:
    python3 generate_icons.py

Produces:
    icons/icon16.png
    icons/icon48.png
    icons/icon128.png
"""

import struct
import zlib
import os
import math


def make_png(size: int) -> bytes:
    """
    Draw a rounded-rectangle badge with a mic symbol.
    Pure Python — no Pillow required.
    """
    # Palette
    bg_r, bg_g, bg_b         = 15,  15,  26   # #0f0f1a
    acc_r, acc_g, acc_b      = 99, 102, 241   # #6366f1  indigo
    mic_r, mic_g, mic_b      = 226, 232, 240  # #e2e8f0  light text

    cx, cy   = size / 2.0, size / 2.0
    r_badge  = size * 0.42   # circle radius for the badge

    rows = []
    for y in range(size):
        row_bytes = [0]  # filter byte
        for x in range(size):
            dx = x - cx
            dy = y - cy
            dist = math.hypot(dx, dy)

            # Rounded badge circle
            in_badge = dist <= r_badge

            # Microphone body: narrow tall rectangle, upper 55% of badge
            mic_w = size * 0.14
            mic_h = size * 0.28
            mic_x = cx - mic_w / 2
            mic_y = cy - size * 0.30
            in_mic_body = (mic_x <= x <= mic_x + mic_w and
                           mic_y <= y <= mic_y + mic_h)

            # Mic stand arc: just a thin horizontal line at ~60% height
            stand_y     = cy + size * 0.04
            stand_thick = max(1, int(size * 0.06))
            stand_w     = size * 0.22
            in_stand    = (abs(y - stand_y) <= stand_thick / 2 and
                           abs(x - cx) <= stand_w / 2)

            # Vertical pole below arc
            pole_w     = max(1, int(size * 0.04))
            pole_top   = stand_y + stand_thick / 2
            pole_bot   = cy + size * 0.20
            in_pole    = (abs(x - cx) <= pole_w / 2 and pole_top <= y <= pole_bot)

            # Base horizontal bar
            base_y     = pole_bot
            base_w     = size * 0.26
            base_thick = max(1, int(size * 0.05))
            in_base    = (abs(y - base_y) <= base_thick / 2 and
                          abs(x - cx) <= base_w / 2)

            is_mic = in_mic_body or in_stand or in_pole or in_base

            if in_badge:
                r, g, b, a = (acc_r, acc_g, acc_b, 255) if not is_mic else (mic_r, mic_g, mic_b, 255)
            else:
                r, g, b, a = (bg_r, bg_g, bg_b, 0)   # transparent outside

            row_bytes += [r, g, b, a]
        rows.append(bytes(row_bytes))

    raw   = b''.join(rows)
    idat  = zlib.compress(raw)

    def chunk(name: bytes, data: bytes) -> bytes:
        length  = struct.pack('>I', len(data))
        crc_val = struct.pack('>I', zlib.crc32(name + data) & 0xFFFFFFFF)
        return length + name + data + crc_val

    ihdr = struct.pack('>II', size, size) + bytes([8, 6, 0, 0, 0])  # RGBA 8-bit

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', idat)
        + chunk(b'IEND', b'')
    )


def main() -> None:
    icons_dir = os.path.join(os.path.dirname(__file__), 'icons')
    os.makedirs(icons_dir, exist_ok=True)

    for size in (16, 48, 128):
        path = os.path.join(icons_dir, f'icon{size}.png')
        with open(path, 'wb') as fh:
            fh.write(make_png(size))
        print(f'  ✓ {path}')

    print('\nIcons generated successfully.')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Builds the name banner at the top of README.md.

Run:  python3 scripts/render-name.py <font.ttf> [--cap 106] [--out name]
Out:  <out>-dark.svg, <out>-light.svg

Look: a black-and-white hologram. Slanted outlined letters with a see-through
face, and a stack of fading copies trailing down and to the left to give depth.

The letters are converted to outlines, because an SVG shown through <img> can
only use fonts already installed on the visitor's machine. Tracking (the space
between letters) is solved so the name runs edge to edge at the chosen cap
height. Two files because the ink has to flip with GitHub's theme; the README
picks between them with <picture>.

Needs fonttools (pip install fonttools). The font is not committed; it was
drawn with Archivo Black (open licence), and any .ttf works.
"""
import argparse
import math
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

TEXT = "BRYCE KALLIO"
VIEW_W = 1280  # matches the ticker so the two line up at width="100%"
PAD_TOP = 16
PAD_BOTTOM = 76  # breathing room between the name and the ticker below it
WORD_GAP = 0.5  # extra space between the two words, as a multiple of cap height
SLANT = 12  # degrees
LAYERS = 16  # copies in the depth stack
STEP = (-1.15, 2.5)  # each copy moves this far left and down
INKS = {"dark": "#ffffff", "light": "#0a0a0a"}


def build(font_path: str, cap: float, out: str) -> None:
    font = TTFont(font_path)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    scale = cap / (getattr(font["OS/2"], "sCapHeight", 0) or 700)

    letters = []  # (glyph name or None for the space, ink left, ink width)
    for ch in TEXT:
        if ch == " ":
            letters.append((None, 0, 0))
            continue
        name = cmap[ord(ch)]
        pen = BoundsPen(glyphs)
        glyphs[name].draw(pen)
        x0, _, x1, _ = pen.bounds
        letters.append((name, x0, x1 - x0))

    # The slant pushes the tops right and the depth stack runs left, so the
    # word itself gets a little less than the full width.
    lean = cap * math.tan(math.radians(SLANT))
    depth_x, depth_y = -STEP[0] * LAYERS, STEP[1] * LAYERS
    left = depth_x + 4
    inner = VIEW_W - left - lean - 4

    # Lay out by ink width, not advance width, so one tracking value sets every gap.
    ink = sum(w for n, _, w in letters if n) * scale
    gaps = sum(1 for a, b in zip(letters, letters[1:]) if a[0] and b[0])
    track = (inner - ink - WORD_GAP * cap) / (gaps + 1)
    if track < 0:
        raise SystemExit(f"cap {cap} is too tall to fit; lower --cap")

    base = PAD_TOP + cap
    paths, x = [], 0.0
    for name, gl, width in letters:
        if name is None:
            x += WORD_GAP * cap
            continue
        pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
        # Flip y (fonts are y-up), scale to the cap height, slide into place.
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x - gl * scale, base)))
        paths.append(f'<path d="{pen.getCommands()}"/>')
        x += width * scale + track

    stack = []
    for i in range(LAYERS, 0, -1):
        dx, dy = STEP[0] * i, STEP[1] * i
        # Every fourth copy keeps a faint outline, which reads as the ribs of light
        # in a projected hologram; the rest are only a thin wash that builds up.
        rib = ' stroke="currentColor" stroke-width="1" stroke-opacity=".14"' if i % 4 == 0 else ""
        stack.append(f'<use href="#w" x="{dx:.2f}" y="{dy:.2f}" fill-opacity=".035"{rib}/>')

    height = round(PAD_TOP + cap + depth_y + PAD_BOTTOM)
    for theme, colour in INKS.items():
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEW_W} {height}" width="{VIEW_W}" height="{height}" role="img" aria-label="Bryce Kallio" color="{colour}">
<title>Bryce Kallio</title>
<defs>
  <g id="w">
{chr(10).join(paths)}
  </g>
  <filter id="glow" x="-5%" y="-40%" width="110%" height="180%"><feGaussianBlur stdDeviation="3"/></filter>
</defs>
<g transform="translate({left:.1f} 0) translate(0 {base}) skewX(-{SLANT}) translate(0 -{base})" fill="currentColor" stroke-linejoin="round">
  {chr(10).join("  " + s for s in stack).strip()}
  <use href="#w" fill="none" stroke="currentColor" stroke-width="4" opacity=".18" filter="url(#glow)"/>
  <use href="#w" fill-opacity=".16" stroke="currentColor" stroke-width="2.4"/>
</g>
</svg>
"""
        Path(f"{out}-{theme}.svg").write_text(svg)
    print(f"{out}: cap {cap}px, tracking {track:.1f}px, height {height}px")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("font")
    ap.add_argument("--cap", type=float, default=106)
    ap.add_argument("--out", default="name")
    a = ap.parse_args()
    build(a.font, a.cap, a.out)

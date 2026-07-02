"""
Generate Sherset brand asset variants from the source logo PNG.

Source: ./Sherset logo.png  (blue SHERSET wordmark + grey «электротовары» tagline)
Outputs (written to apps/web + apps/marketing public/brand + app icons):
  - sherset-wordmark.png        blue «SHERSET», tagline cropped, trimmed, transparent
  - sherset-wordmark-white.png  white «SHERSET» (for the blue navbar)
  - sherset-mark.png            square blue «S» mark (transparent), for tight spaces
  - icon.png                    512x512 app icon: white «S» on a Sherset-blue square

Idempotent: re-run any time from the source PNG.
"""

import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "Sherset logo.png")

BRAND_BLUE = (6, 82, 255)  # #0652FF, measured from the logo wordmark


def is_blue(px):
    r, g, b, a = px
    return a > 100 and b > 120 and b > r + 40 and b > g + 30 and r < 130


def blue_bbox(im):
    """Bounding box of the blue wordmark pixels (excludes the grey tagline)."""
    w, h = im.size
    px = im.load()
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            if is_blue(px[x, y]):
                minx = min(minx, x); miny = min(miny, y)
                maxx = max(maxx, x); maxy = max(maxy, y)
    return (minx, miny, maxx + 1, maxy + 1)


def keep_only_blue(im):
    """Return a copy where non-blue pixels are made transparent (drops tagline + AA grey)."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not is_blue(px[x, y]):
                # keep blue antialias edges (bluish but lighter); drop clearly-grey/transparent
                if a < 40 or (abs(r - g) < 30 and abs(g - b) < 40 and b < 170):
                    px[x, y] = (r, g, b, 0)
    return im


def recolor(im, rgb):
    """Recolor every visible pixel to `rgb`, preserving alpha (for the white variant)."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0:
                px[x, y] = (rgb[0], rgb[1], rgb[2], a)
    return im


def first_glyph_bbox(im):
    """Isolate the first glyph (S) by finding the first column gap after the initial run."""
    w, h = im.size
    px = im.load()
    col_has = []
    for x in range(w):
        c = 0
        for y in range(h):
            if px[x, y][3] > 60:
                c += 1
        col_has.append(c)
    # first non-empty column
    x0 = next((x for x, c in enumerate(col_has) if c > 2), 0)
    # first gap (<=1 px) after the glyph starts
    x1 = w
    started = False
    for x in range(x0, w):
        if col_has[x] > 2:
            started = True
        elif started and col_has[x] <= 1:
            x1 = x
            break
    # vertical bbox within that x-range
    ys = [y for y in range(h) for x in range(x0, x1) if px[x, y][3] > 60]
    y0, y1 = (min(ys), max(ys) + 1) if ys else (0, h)
    return (x0, y0, x1, y1)


def square_pad(im, pad_ratio=0.16):
    w, h = im.size
    side = int(max(w, h) * (1 + pad_ratio * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2), im)
    return canvas


def main():
    im = Image.open(SRC).convert("RGBA")

    # 1. wordmark (blue, tagline removed)
    blue = keep_only_blue(im)
    wm = blue.crop(blue_bbox(im))
    # 2. white wordmark
    wm_white = recolor(wm, (255, 255, 255))
    # 3. square S mark (from the wordmark's first glyph)
    s_bbox = first_glyph_bbox(wm)
    mark = square_pad(wm.crop(s_bbox))
    mark_white = recolor(mark, (255, 255, 255))
    # 4. app icon: white S on a Sherset-blue rounded square (512)
    icon = Image.new("RGBA", (512, 512), BRAND_BLUE + (255,))
    s_for_icon = wm.crop(s_bbox)
    scale = int(512 * 0.62) / max(s_for_icon.size)
    s_resized = s_for_icon.resize(
        (max(1, int(s_for_icon.width * scale)), max(1, int(s_for_icon.height * scale))),
        Image.LANCZOS,
    )
    s_white = recolor(s_resized, (255, 255, 255))
    icon.paste(
        s_white,
        ((512 - s_white.width) // 2, (512 - s_white.height) // 2),
        s_white,
    )

    targets_brand = [
        os.path.join(ROOT, "apps", "web", "public", "brand"),
        os.path.join(ROOT, "apps", "marketing", "public", "brand"),
    ]
    for d in targets_brand:
        os.makedirs(d, exist_ok=True)
        wm.save(os.path.join(d, "sherset-wordmark.png"))
        wm_white.save(os.path.join(d, "sherset-wordmark-white.png"))
        mark.save(os.path.join(d, "sherset-mark.png"))
        mark_white.save(os.path.join(d, "sherset-mark-white.png"))

    # app icons (Next.js App Router auto-favicon)
    for app in ("web", "marketing"):
        appdir = os.path.join(ROOT, "apps", app, "src", "app")
        os.makedirs(appdir, exist_ok=True)
        icon.save(os.path.join(appdir, "icon.png"))

    print("wordmark size:", wm.size)
    print("mark size:", mark.size, " S bbox:", s_bbox)
    print("icon size:", icon.size)
    print("written to web+marketing /public/brand and src/app/icon.png")


if __name__ == "__main__":
    main()

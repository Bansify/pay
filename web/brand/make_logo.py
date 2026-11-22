"""Bansify logo generator.

Draws the mark, the lockups, app icons and the social card from one geometry, so every
export stays consistent. Blue is #0494f4 (the product accent), the mark is white.

Everything is drawn at 4x and downsampled, which gives clean edges without an SVG renderer.
"""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

BLUE = (4, 148, 244)
WHITE = (255, 255, 255)
INK = (13, 15, 19)
MUTED = (154, 161, 173)
SS = 4  # supersampling factor

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

OUT = Path("brand")
OUT.mkdir(exist_ok=True)


def rounded(size: int, radius_ratio: float = 0.235) -> Image.Image:
    """Transparent canvas with the rounded-square plate."""
    img = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    r = int(size * SS * radius_ratio)
    draw.rounded_rectangle([0, 0, size * SS - 1, size * SS - 1], radius=r, fill=BLUE)
    return img


def draw_mark(size: int, plate: bool = True, ink=WHITE) -> Image.Image:
    """The B: rounded stem plus two right half-discs, with the counters punched out."""
    s = size * SS
    canvas = rounded(size) if plate else Image.new("RGBA", (s, s), (0, 0, 0, 0))

    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    stem_l, stem_r = 0.295 * s, 0.410 * s
    top, bottom = 0.220 * s, 0.780 * s
    d.rounded_rectangle([stem_l, top, stem_r, bottom], radius=(stem_r - stem_l) / 2, fill=ink)

    up_cy, up_r = 0.370 * s, 0.150 * s
    lo_cy, lo_r = 0.630 * s, 0.150 * s
    for cy, r in ((up_cy, up_r), (lo_cy, lo_r)):
        # right half-disc only: the flat edge sits on the stem, so the left side stays straight
        d.pieslice([stem_r - r, cy - r, stem_r + r, cy + r], start=-90, end=90, fill=ink)

    holes = Image.new("L", (s, s), 0)
    hd = ImageDraw.Draw(holes)
    for cy, r in ((up_cy, 0.060 * s), (lo_cy, 0.066 * s)):
        cx = stem_r + 0.470 * (up_r)
        hd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)

    layer.putalpha(ImageChops.subtract(layer.getchannel("A"), holes))
    canvas.alpha_composite(layer)
    return canvas.resize((size, size), Image.LANCZOS)


def text_size(text: str, font: ImageFont.FreeTypeFont) -> tuple[int, int]:
    box = font.getbbox(text)
    return box[2] - box[0], box[3] - box[1]


def lockup(height: int, ink=INK, mark_plate=True) -> Image.Image:
    """Horizontal lockup: mark + 'bansify', measured so nothing clips."""
    mark = draw_mark(height, plate=mark_plate)
    font = ImageFont.truetype(FONT_BOLD, int(height * 0.60))
    word = "bansify"
    left, top_b, right, bottom_b = font.getbbox(word)
    tw, th = right - left, bottom_b - top_b

    gap = int(height * 0.26)
    pad = int(height * 0.10)
    width = pad + height + gap + tw + pad
    canvas_h = height + pad * 2

    img = Image.new("RGBA", (width, canvas_h), (0, 0, 0, 0))
    img.alpha_composite(mark, (pad, pad))
    draw = ImageDraw.Draw(img)
    baseline_y = pad + (height - th) // 2 - top_b
    draw.text((pad + height + gap - left, baseline_y), word, font=font, fill=ink)
    return img


def social_card() -> Image.Image:
    w, h = 1200, 630
    img = Image.new("RGBA", (w, h), INK)
    draw = ImageDraw.Draw(img)

    # soft brand glow
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([w - 520, -260, w + 260, 520], fill=(4, 148, 244, 38))
    gd.ellipse([-260, h - 420, 420, h + 260], fill=(4, 148, 244, 26))
    img.alpha_composite(glow)

    mark = draw_mark(148)
    img.alpha_composite(mark, (96, 92))

    font_big = ImageFont.truetype(FONT_BOLD, 86)
    font_mid = ImageFont.truetype(FONT_REG, 34)
    font_small = ImageFont.truetype(FONT_BOLD, 26)

    draw.text((96, 288), "Bansify", font=font_big, fill=WHITE)
    draw.text((96, 400), "One account for every Bansify product.", font=font_mid, fill=MUTED)
    draw.text((96, 470), "Mail · Drive · Accounts · Pay · Store · Meet", font=font_mid, fill=(120, 128, 140))
    draw.text((96, 552), "bansify.com", font=font_small, fill=BLUE)
    return img


def save(img: Image.Image, name: str, *, flatten: tuple[int, int, int] | None = None) -> None:
    path = OUT / name
    if flatten:
        base = Image.new("RGB", img.size, flatten)
        base.paste(img, mask=img.split()[3])
        base.save(path, optimize=True)
    else:
        img.save(path, optimize=True)
    print(f"{name:38} {img.size[0]}x{img.size[1]}")


def write_svgs() -> None:
    mark_path = (
        '<rect x="29.5" y="22" width="11.5" height="56" rx="5.75" fill="#fff"/>'
        '<path fill="#fff" fill-rule="evenodd" d="'
        'M41 22a15 15 0 0 1 0 30Z'
        'M41 48a15 15 0 0 1 0 30Z'
        'M48.05 31a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z'
        'M48.05 56.4a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2Z'
        '"/>'
    )
    (OUT / "bansify-mark.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Bansify">'
        f'<rect width="100" height="100" rx="23.5" fill="#0494f4"/>{mark_path}</svg>\n',
        encoding="utf-8",
    )
    (OUT / "bansify-mark-mono.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Bansify">'
        f'{mark_path.replace("#fff", "#0d0f13")}</svg>\n',
        encoding="utf-8",
    )
    (OUT / "bansify-logo.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 100" role="img" aria-label="Bansify">'
        '<rect width="100" height="100" rx="23.5" fill="#0494f4"/>'
        f'{mark_path}'
        '<text x="124" y="66" font-family="DejaVu Sans, Inter, system-ui, sans-serif" '
        'font-size="52" font-weight="700" letter-spacing="-1" fill="#0d0f13">bansify</text></svg>\n',
        encoding="utf-8",
    )
    print("3 svg files written")


def main() -> None:
    save(draw_mark(1024), "bansify-mark-1024.png")
    save(draw_mark(512), "bansify-mark-512.png")
    save(draw_mark(192), "bansify-mark-192.png")
    save(draw_mark(180), "apple-touch-icon.png")
    save(draw_mark(32), "favicon-32.png")
    save(draw_mark(16), "favicon-16.png")

    # Android adaptive / maskable: extra padding so the system mask never clips the mark
    maskable = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    inner = draw_mark(360)
    maskable.alpha_composite(inner, (76, 76))
    ImageDraw.Draw(maskable).rounded_rectangle([0, 0, 511, 511], radius=256, fill=None)
    save(maskable, "bansify-mark-maskable-512.png")

    save(lockup(96, ink=INK, mark_plate=True), "bansify-logo-light-96h.png")
    save(lockup(96, ink=WHITE, mark_plate=True), "bansify-logo-dark-96h.png")
    save(lockup(240, ink=INK, mark_plate=True), "bansify-logo-light-240h.png")
    save(social_card(), "bansify-og-1200x630.png")
    write_svgs()


if __name__ == "__main__":
    main()

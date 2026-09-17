"""Rasterise a PDF into an image-only PDF (no text layer).

Usage: rasterize.py <source.pdf> <target.pdf>

Used for the scanned fixture, so that it is a photo of the baseline PDF rather than a
separately laid out document - the only thing that changes is the presence of the text
layer. 150 DPI is a realistic phone-scan / "print then scan" resolution.
"""

import sys

import pymupdf as fitz

DPI = 150


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: rasterize.py <source.pdf> <target.pdf>", file=sys.stderr)
        return 2

    source_path, target_path = sys.argv[1], sys.argv[2]

    source = fitz.open(source_path)
    target = fitz.open()
    for page in source:
        pixmap = page.get_pixmap(dpi=DPI)
        new_page = target.new_page(width=page.rect.width, height=page.rect.height)
        new_page.insert_image(new_page.rect, pixmap=pixmap)
    source.close()
    target.save(target_path)
    target.close()

    # Confirm the text layer is actually gone, so a silent failure cannot pass as a fixture.
    check = fitz.open(target_path)
    residual = "".join(page.get_text() for page in check).strip()
    pages = check.page_count
    check.close()
    if residual:
        print(f"rasterised PDF still has a text layer: {residual[:80]!r}", file=sys.stderr)
        return 1

    print(f"rasterised to image-only PDF at {DPI} DPI, {pages} page(s), no text layer")
    return 0


if __name__ == "__main__":
    sys.exit(main())

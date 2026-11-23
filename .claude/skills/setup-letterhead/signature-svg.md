# Getting your signature (and logo) as an SVG

An SVG stays sharp at any size (full block, stamp, small mark on every page) and is a tiny file. Preferred over PNG.

## Option A: ask a free AI tool (fastest)
Upload a photo or scan of the signature to any free multimodal assistant (e.g. Gemini Flash) and send:

> Convert this signature into a clean SVG. Requirements: one `<svg>` with a `viewBox`; transparent background (no
> background rectangle); only black `stroke` paths with `fill="none"`, round line caps and joins; a few smooth
> `<path>` strokes; no embedded raster image, no text, no scripts. Return only the SVG code.

Then:
1. Save it as `company/assets/signature.svg`.
2. Crop the canvas tightly: `npm run trim-svg -- company/assets/signature.svg company/assets/signature.svg`
3. If it prints too light, raise the `stroke-width` values a little (e.g. 1.8 to 2.4).
4. `npm run doctor` (checks the SVG) and make a test letter with `sign: true` to see it in place.
5. Point the signatory at it in `company/config.json`: `"signature": "assets/signature.svg"`.

## Option B: trace the real scan (most faithful)
Open a clean scan in Inkscape (free): Path → Trace Bitmap, then delete any background shape and save as SVG.
`potrace` does the same from the command line. Then do steps 2 to 5 above.

## Be aware
An AI redraw is an **approximation** of your signature, not your exact pen strokes. If the signature must match a
specimen held by a bank, authority or counterparty, use Option B or a clean PNG of the real scan, and check with them.
Keep the original scan in `company/assets/source/`.

## Logo
Same idea: SVG with a transparent background, then `npm run trim-svg -- company/assets/logo.svg company/assets/logo.svg`
to remove empty space around the mark.

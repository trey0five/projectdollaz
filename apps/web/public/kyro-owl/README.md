# KYRO the owl — in-app mascot assets

Photoreal **snowy owl** sprites for the app mascot (owner decision 2026-09-10: move away from the dove; this
directory replaces `/kyro-dove/` with the SAME manifest schema and file names). Everything here has alpha,
faces **right**, and is our own generated output. Mirror with `transform: scaleX(-1)`.

| File | What | Size |
|---|---|---|
| `fly.webp` | sprite sheet, one wingbeat, 42 cells of 384x139 in a 7x6 grid (2688x834), lossless | 1,141 KB |
| `glide.webp` | one wings-spread frame (source frame 61, bottom of the downstroke), same crop/scale as a fly cell, 384x139 | 33 KB |
| `perched.webp` | perched still, branch removed, alpha-trimmed + 4 % padding, 507x512 | 160 KB |
| `perched@256.webp` | same at 254x256 | 41 KB |
| `manifest.json` | frames/grid/fps/anchors for the app (same schema as kyro-dove) | |
| `preview.html` / `preview.png` | self-check: plays the sheet with CSS `steps()` on the light app ground and on navy | |

## Playing `fly.webp`

42 cells, 24 fps = 1.75 s per wingbeat. Cell `k` is at column `k % 7`, row `k / 7`. Play 0..41 forward and
repeat. Unlike the dove this is a NATURAL cycle (no ping-pong): bottom of the downstroke -> upstroke (wings
level, thin but visible, cells ~18-24) -> downstroke -> bottom. The seam (cell 41 = frame 143 -> cell 0 = frame 61)
is a 2-source-frame step like every other cell (silhouette diff 0.073 vs mean step 0.080).

```css
.fly { width:384px; height:139px; background:url(fly.webp) 0 0/2688px 834px;
       animation: fx .29167s steps(7) infinite, fy 1.75s steps(6) infinite; }
@keyframes fx { to { background-position-x:-2688px } }
@keyframes fy { to { background-position-y:-834px } }
```

Anchors (fraction of the cell, from the alpha): `fly`/`glide` = centroid of the body (pixels opaque in every
frame of the cycle = body+head+tail, not wings) = (0.3342, 0.4001); `perched` = feet (x = centroid of the
black talon pixels, y = lowest claw pixel) = (0.6549, 0.962).

## Numbers for `kyroDoveManifest.js` (measured by the build, see `measurements.json` next to the build script)

The owl's side profile is much wider than the dove's (cell aspect 2.76 vs 1.25) and the body sits low-left in
the cell, so BOTH app constants need re-deriving — do not reuse the dove values:

| | value |
|---|---|
| glide alpha centroid, fraction of cell | (0.4515, 0.4945) |
| perched alpha centroid, fraction of image | (0.5733, 0.5274) |
| body height in a fly cell (always-opaque pixels) | 0.445 of cell height (62 px) |
| body height in the perched image | 0.924 of image height |
| `FLY_SCALE` if the flying body should match the perched body height | **2.07** (dove: 1.22) |
| `PERCHED_PLACEMENT_OFFSET` at FLY_SCALE 1.22 | (-0.4806, -0.5497) |
| `PERCHED_PLACEMENT_OFFSET` at FLY_SCALE 2.07 | (-0.760, -0.6303) |

Offset formula (same one the dove comment describes): place the perched still so its alpha centroid lands on
the glide centroid: `A.x = pc.x - (gc.x - fly.anchor.x) * FLY_SCALE * glideAspect / perchedAspect`,
`A.y = pc.y - (gc.y - fly.anchor.y) * FLY_SCALE`, offset = A - perched.anchor. Note that at FLY_SCALE 2.07 the
fly layer is 2.07 x 2.76 = 5.7 perched-heights WIDE (a real owl's wingspan is ~3.5x its body length), which
makes the mascot box very wide; 1.22 keeps the flying owl's body ~60 % of the perched size (reads as
"further away"). Engineer's call — both offsets are given.

## Sources and licence

* Flight: `demo-video/owl-candidates/sora/sprite/frames/` — Sora (sora-2-pro) 12 s clip `keyable-owl.mp4`
  (job in `jobs.json`), keyed by `key_owl.py` (silhouette key, LO=8 HI=90, 2 px luma ring) into 360 RGBA
  PNGs. `sprite/audit.json` = edge-contact + loop audit; `sprite-luma/` = the plain `key.sh` luma key kept for
  comparison (it turns the barring semi-transparent — do not use).
* Perched: `demo-video/owl-candidates/still/perched-owl-1.png` — gpt-image-1 (high, 1536x1024, transparent).
  `perched-owl-2.png` is the alternate (branch runs diagonally behind the toes; unused).
* Both are our own generated output (OpenAI Sora / gpt-image-1, generated under our account). No third-party
  stock or licensed imagery.

## Why these frames

Sora honoured the framing (zero frames with alpha within 4 px of an edge across all 360; bird bbox
x 250-1198, y 173-613) and the black background (corner luma 1-3), but NOT "wingbeats about once per
second": there is one crisp full flap (top ~12 -> bottom ~54 -> top ~96 -> bottom ~146, ~2.8 s) and then the
amplitude decays into a bobbing glide (frames ~186-359, wings never rise above the body). Scale is stable
(wings-down area 137k px @54 vs 135k px @264 — no drift toward camera). `audit.py`'s best loop is 61 -> 145/146
(score 2.16x the consecutive-frame diff — the same tier as the dove's 2.2x), so the sheet is frames 61..143
every 2nd frame. The head is turned slightly toward camera throughout (3/4 face, both eyes visible) — that is
the source, not the key.

## Edge fix / key (why the cells are not a straight crop)

A pure luma key (key.sh) is wrong for a barred owl: the black barring (source luma 8-40) becomes
semi-transparent and un-premultiplies to washed-out brown. `key_owl.py` keys on the SILHOUETTE instead:
sil = luma > 8, closed 1 px, enclosed holes filled, specks < 60 px dropped; the interior (sil eroded 2 px) is
fully opaque with the untouched source colour; only the 2 px ring uses the luma ramp + un-premultiply so
feather tips stay soft and bright. The build's `refine_keyed` (unchanged from the dove) then re-derives
coverage in a 4 px ring so the render's soft edge does not read as a dark outline on `#f6f7fb`. Mean
luminance of semi-transparent sheet pixels: 157/255 (dove: 170; the owl's edge pixels include real barring).
Perched: the gpt-image-1 still had a thin perch stick under the feet running to the canvas bottom; the build
keeps only talon pixels inside the stick's columns and zeroes everything below the lowest claw. A ~12 px
(at 512) dark remnant of the stick's shadowed side survives under the front claw and reads as a claw tip.

## Regenerate

```
python3 demo-video/owl-candidates/sora/key_owl.py raw sprite/frames 8 90   # from raw/ (ffmpeg png dump of the clip)
python3 demo-video/owl-candidates/sora/build_kyro_owl.py                   # Pillow + numpy + scipy; ~10 s
node demo-video/owl-candidates/sora/preview_kyro_owl.mjs                   # preview.png via village-finder's playwright
```

Knobs at the top of the build script: `FWD`/`SEQ`/`RANGE` (source frames), `GLIDE`, `FPS`, `COLS`, `PAD`,
`CELL_LONG` (384 here, not 256: a 256-wide cell would be only ~97 px tall for this aspect, under-sampled at
the app's 56 px x 1.22 box on 2x DPR). Sky proof of the loop: `demo-video/owl-candidates/sora/sky-proof/`.

# KYRO the dove — in-app mascot assets

Photoreal white dove sprites for the app mascot (replaces the Penny gold coin). Everything here has
alpha, faces **right**, and is built from assets we already own. Mirror with `transform: scaleX(-1)`.

| File | What | Size |
|---|---|---|
| `fly.webp` | sprite sheet, one wingbeat, 40 cells of 256x205 in an 8x5 grid (2048x1025), lossless | 713 KB |
| `glide.webp` | one wings-spread frame (source frame 258), same crop/scale as a fly cell, 256x205 | 23 KB |
| `perched.webp` | perched still, alpha-trimmed + 4 % padding, 450x512 | 118 KB |
| `perched@256.webp` | same at 225x256 | 32 KB |
| `manifest.json` | frames/grid/fps/anchors for the app | |
| `preview.html` / `preview.png` | self-check: plays the sheet with CSS `steps()` on the light app ground and on navy | |

## Playing `fly.webp`

40 cells, 24 fps = 1.67 s per wingbeat. Cell `k` is at column `k % 8`, row `k / 8`. Play 0..39 forward
and repeat — the ping-pong is already baked in (top of stroke -> spread downstroke -> back up), so the
last cell -> first cell is two source frames apart, the same distance as every other step. With pure
CSS use two `steps()` animations, x over one row and y over the sheet (see `preview.html`):

```css
.fly { width:256px; height:205px; background:url(fly.webp) 0 0/2048px 1025px;
       animation: fx .33333s steps(8) infinite, fy 1.66667s steps(5) infinite; }
@keyframes fx { to { background-position-x:-2048px } }
@keyframes fy { to { background-position-y:-1025px } }
```

Anchors (fraction of the cell, from the alpha): `fly`/`glide` = centroid of the body (the pixels that
are opaque in every frame of the cycle, i.e. body+head+tail, not wings) = (0.519, 0.772);
`perched` = feet (x = centroid of the red leg/foot pixels, y = lowest claw pixel) = (0.681, 0.959).

## Sources and licence

* Flight: `demo-video/dove-candidates/sora/sprite-v2/frames/` — Sora (sora-2-pro) 12 s clip
  `keyable-soar-v2.mp4`, luma-keyed by `key.sh` (LO=8 HI=90) into 360 RGBA PNGs. See `KEY-QUALITY.md`
  there for the key audit and the loop analysis.
* Perched: `demo-video/dove-candidates/still/perched-dove-1.png` — gpt-image-1 still
  (`perched-dove-2.png` is the alternate, unused).
* Both are our own generated output (OpenAI Sora / gpt-image-1, generated under our account; OpenAI's
  terms assign output ownership to the user). No third-party stock or licensed imagery is involved.

## Why these frames

The Sora cycle (192 frames, loop 91->283) is one *long slow* flap: wings-up -> spread downstroke in
profile -> ~30 frames edge-on (wings invisible) -> the upstroke happens during a 3/4 turn toward camera.
The upstroke is never in profile, so no natural-order sub-range with the wings visible in every frame
closes on itself (best forward cut with wings visible: 260->203, silhouette diff 0.22 — and it reverses
wing direction mid-stroke). So the sheet is the profile downstroke, frames 236..276 (every 2nd frame),
played forward then back: turnarounds sit at the true top and bottom of the stroke and the seam
(cell 39 = frame 238 -> cell 0 = frame 236) measures 0.044 vs a mean step of 0.097.

Crop: one fixed box for every cell = union alpha bbox of frames 236..276 (x 240-770, y 89-513) + 4 %
padding -> (219,72)-(792,531), scaled 0.4468x. The body barely moves across the range (beak x 709-711,
feet x 452-455, <=7 px tail drift at source scale), so no per-frame re-centring is needed.

## Edge fix (why the cells are not a straight crop of the keyed PNGs)

The key sets alpha = (luma-8)/82, so every boundary pixel with source luma >= 90 is fully opaque *and*
dark grey, and the Sora render's 3-5 px soft edge becomes a dark outline on `#f6f7fb`. `refine_keyed`
in the build script re-derives coverage inside a 4 px ring as `source_luma / luminance of the nearest
interior feathers`, gives the ring the interior colour, and fills enclosed holes (the eye, which the key
had left semi-transparent). Mean luminance of semi-transparent pixels went 103 -> 170 (body ~178).
The perched PNG had a baked ground shadow (~20k faint pixels across the whole canvas) and a dark matte
on its edge pixels (semi-alpha luminance 61): the shadow is dropped (alpha zeroed outside a 3 px
dilation of the solid bird) and edge pixels take the adjacent feather colour. Downscaling is LANCZOS on
premultiplied channels. No alpha erosion was needed.

## Regenerate

```
python3 demo-video/dove-candidates/sora/build_kyro_dove.py     # Pillow + numpy + scipy; ~1 min
node demo-video/dove-candidates/sora/preview_kyro_dove.mjs      # preview.png via village-finder's playwright
```

Knobs at the top of the build script: `FWD`/`REV` (source frames), `GLIDE`, `FPS`, `COLS`, `PAD`,
`CELL_LONG`. To swap the perched pose, point `PERCHED_SRC` at `perched-dove-2.png`.

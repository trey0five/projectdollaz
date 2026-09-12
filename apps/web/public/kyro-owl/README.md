# KYRO the owl — in-app mascot assets

Photoreal **little owl** (*Athene noctua* — Athena's owl, the classic emblem of knowledge: small, round-headed,
grey-brown with white speckling, pale facial disc, yellow eyes, short tail) sprites for the app mascot. Owner
decision 2026-09-10: "instead of the snowy owl, i'd rather use the little owl that is associated with knowledge."
Same manifest schema and file names as the snowy owl (and the dove before it). Everything here has alpha, faces
**right**, and is our own generated output. Mirror with `transform: scaleX(-1)`.

| File | What | Size |
|---|---|---|
| `fly.webp` | sprite sheet, one wingbeat, 36 cells of 249x256 in a 6x6 grid (1494x1536), lossless | 1,012 KB |
| `glide.webp` | one wings-spread frame (source frame 209, wings spread and slightly raised), same crop/scale as a fly cell, 249x256 | 25 KB |
| `perched.webp` | perched still, alpha-trimmed + 4 % padding, 512x505 | 199 KB |
| `perched@256.webp` | same at 256x252 | 51 KB |
| `perch.webp` | the olive branch the owl lands on, alpha-trimmed + ~4 % padding, 512x325 | 54 KB |
| `perch@256.webp` | same at 256x163 | 18 KB |
| `manifest.json` | frames/grid/fps/anchors for the app (same schema as before, plus `perch`) | |
| `preview.html` / `preview.png` | self-check: plays the sheet with CSS `steps()` on the light app ground and on navy | |
| `owl-sky-proof.mp4` | temp, untracked: the sheet looping over the sky plates (1536x1024, 30 fps, 4 s) | |

## Playing `fly.webp`

36 cells, 24 fps = 1.5 s per wingbeat. Cell `k` is at column `k % 6`, row `k / 6`. Play 0..35 forward and
repeat — a NATURAL cycle (no ping-pong): 9 frames before the wing-up peak -> wings up -> downstroke -> wings
down (bottom of the downstroke ~cell 22) -> upstroke -> back. The seam (cell 35 = source 214 -> cell 0 =
source 106) is 1.5x an average cell step (silhouette diff 0.146 vs mean step 0.096).

```css
.fly { width:249px; height:256px; background:url(fly.webp) 0 0/1494px 1536px;
       animation: fx .25s steps(6) infinite, fy 1.5s steps(6) infinite; }
@keyframes fx { to { background-position-x:-1494px } }
@keyframes fy { to { background-position-y:-1536px } }
```

Anchors (fraction of the cell, from the alpha): `fly`/`glide` = centroid of the body (pixels opaque in every
frame of the cycle = torso+head) = (0.5674, 0.4613); `perched` = feet (x = centroid of the black talon
pixels, y = lowest claw pixel) = (0.6311, 0.9744).

## Numbers for `kyroDoveManifest.js` (measured by the build, see `measurements.json` next to the build script)

| | value |
|---|---|
| glide alpha centroid, fraction of cell | (0.5057, 0.4105) |
| perched alpha centroid, fraction of image | (0.5664, 0.4830) |
| body (torso) height in a fly cell (always-opaque pixels) | 0.231 of cell height |
| body height in the perched image | 0.935 of image height |
| `FLY_SCALE` chosen | **1.6** (head-match overlay says ~2.0; see below) |

The fly cell is ~1:1 (the snowy owl's was 2.76:1): the wings sweep from 0.41 of the cell above the body
centroid to 0.59 below it, so the torso is only 0.23 of the cell and the torso-thickness formula
(`FLY_SCALE_suggested` 4.08 in measurements.json) is meaningless here. "Same bird" is a HEAD match:
`demo-video/owl-candidates/little/sora/fly-scale-overlay.png` overlays glide on perched, centroid-aligned, at
1.0/1.4/1.7/2.0/2.4/2.8 — the head/eye masses coincide at ~2.0 (eye-diameter ratio 1.9). 1.6 is the deliberate
compromise (flying head ~80 % of the perched head, reads as the same bird a little further off) because the app
box is now the PERCHED still both ways and the airborne layers overflow it: at 1.6 the wings overflow ~0.17u
above / ~0.43u below the box only while flying (≈11/28 px at Penny's 64 px box). With the old "vertical
union" box rule the perched mascot would have shrunk to 62 % of its box on every surface. Placement offset is
derived in the JS from the centroids (perched centroid - feet anchor = (-0.0647, -0.4914)).

## The perch (`perch.webp`)

Owner, 2026-09-12: "maybe the owl should land on something. like perch onto something instead of floating in
the air." Athena's owl gets an **olive branch** (leaves + three olives at the left, bare wood at the right).
Same rules as the bird: alpha, authored for the owl facing RIGHT (the bare wood is on the beak side, the
olives trail behind the tail), mirrored with the bird by the same `scaleX(-1)`. Copy for the demo rig:
`demo-video/assets/kyro-owl-perch.webp`.

`manifest.perch.anchor` = **(0.76, 0.87)** — the point on the branch where the perched still's FEET anchor
(the lowest claw, (0.6311, 0.9744) of `perched.webp`) sits. The wood's top edge (measured on the brown
pixels) runs 0.828 @ x 0.72 -> 0.809 @ 0.78 -> 0.782 @ 0.91 and the wood is ~0.10 thick; 0.76 is on the bare
wood right of the leaf junction (x ~0.55-0.68) and 0.87 is ~0.055 into it, so the claw tips overlap the wood
(which paints BEHIND them — the perch layer is z-below the bird) and the toes read as gripping rather than
resting on a line. Anchor candidates were judged on composites at the app's 1.15x ratio
(`preview_*.png` / `feet_*.png` while building).

In the app (`KyroDove.jsx`): a fourth layer, first in the flip wrapper, `PERCH_SCALE` (1.15) x the perched
still's WIDTH (=> 1.166u x 0.740u), anchor pinned to the feet. The box does NOT grow: the branch overflows it
~0.25u on the tail side and ~0.09u below (16 / 6 px at the 64 px guide, 42 / 15 px at the 172 px Studio
hero) so every `size`, the bubble (`bottom: H + 8`), the chevron and the corner insets are untouched; it
never reaches past the box on the beak side. Fades in over the glide's last ~150 ms (or the settle), fades
out on take-off, collapsed while airborne; simply present under reduced motion. `perch={false}` hides it.

## Sources and licence

* Flight: `demo-video/owl-candidates/little/sora/sprite/frames/` — Sora (sora-2-pro, 1280x720, 12 s) clip
  `keyable-owl.mp4` (job in `jobs.json`; $3.60), CHROMA-keyed by `key_green.py` (greenness ramp 14..56,
  2 px ring un-premultiplied against the measured screen colour + despill) into 360 RGBA PNGs. `audit.json`
  = 4 px edge-contact + loop audit; `phase.json` = wing phase per frame.
* Perched: `demo-video/owl-candidates/little/still/perched-owl-2.png` — gpt-image-1 (high, 1536x1024,
  transparent; two generated for ~$0.50, #2 chosen for its truer grey-brown plumage; #1 is the warmer
  alternate). No branch or ground was drawn, so nothing had to be removed.
* Perch: `demo-video/owl-candidates/little/perch/perch-2.png` — gpt-image-1 (high, 1536x1024, transparent;
  `gen_perch.py`, two generated for ~$0.50, #2 chosen), MIRRORED so the bare wood is on the beak side, trimmed
  + 4 % pad and resized by `perch/compose.py --write`.
* All are our own generated output (OpenAI Sora / gpt-image-1, generated under our account). No third-party
  stock or licensed imagery.

## What Sora did and did not honour

* The green screen: yes, but MUTED — a flat (79,142,68), greenness ~64 rather than #00FF00's 255. Still
  perfectly keyable (feather greenness p99 = 10, screen p1 = 60; background drift ±2 over 12 s).
* "Flying from left to right in strict side profile": profile yes, but the owl FACES LEFT in every frame
  (beak on the left). The build flips every cell horizontally (`FLIP = True`, `sourceFlippedX` in the
  manifest) so the sheet honours the facing-right contract; anchors are measured on the flipped cells.
* "Wingbeats about once per second": no — slow motion as also prompted, one beat ~111 frames (3.7 s). Wing-up
  peaks at source 115/226/306, wing-down at 43/174/274. Played at 24 fps from 36 evenly spaced cells the
  beat is 1.5 s.
* "Wings never approach any frame edge": no — the downstroke bottoms out BELOW the frame on three beats
  (contact frames 29-58, 267-282, 340-359). The clean run is 59..266 and the one full beat inside it,
  106 -> 217, is also the audit's best loop (score 1.38x the consecutive-frame diff).
* Position drift: at the same wing phase the beak tip moves (+18, +15) px over the beat. The build removes that
  linear drift per frame (`DRIFT`), which took the seam from 3.5x to 1.5x an average step.
* Scale is stable across the beat; both eyes/yellow iris visible in every cell (checked per cell).

## Edge / key

`key_green.py`: sil = greenness < 35 (closed 1 px, holes filled, specks < 60 px dropped); interior (sil eroded
2 px) fully opaque with source colour; the 2 px ring gets alpha from the greenness ramp and its colour
un-premultiplied against the screen colour (`fg = (src - (1-a)·bg)/a`), then despilled (G := max(R,B) in the
ring + 3 px inside, the freed green returned as luminance). The build's `refine_keyed` (chroma version — the
snowy owl's luma-coverage maths assumed bird-over-black) recolours a 4 px band inside the silhouette from the
nearest opaque feathers so no screen tint survives, and clamps G on near-zero-alpha pixels after the
premultiplied LANCZOS resize (those came out green-noise; invisible, but now never green). Result: at
alpha >= 32 the greenness p99 of edge pixels is 4; no cell has alpha within 2 px of a cell edge.

## Regenerate

```
cd demo-video/owl-candidates/little/sora
python3 gen.py                          # ONE sora-2-pro clip -> keyable-owl.mp4 ($3.60)  (python3 ../gen_stills.py for the stills)
ffmpeg -i keyable-owl.mp4 -start_number 0 raw/r%04d.png
python3 key_green.py raw sprite/frames 14 56
python3 audit.py sprite/frames 4 20
python3 build_kyro_owl.py              # Pillow + numpy + scipy; writes ../../../../apps/web/public/kyro-owl/*
node preview_kyro_owl.mjs              # preview.png via village-finder's playwright
python3 sky_proof.py                   # sky-proof/ + owl-sky-proof.mp4 here
node verify_app.mjs                    # live app check (screens + landing centroid delta) -> verify/
```

Knobs at the top of the build script: `N_CELLS`/`LOOP_FROM`/`LOOP_TO` (one beat, evenly sampled), `GLIDE`,
`FPS`, `COLS`, `PAD`, `CELL_LONG` (256: the cell is ~1:1, so the head stays ~1.4x oversampled at the app's
2x-DPR box), `DRIFT`, `FLIP`.

# demo-video/assets: v4 asset register

Every asset the KYRO demo v4 pipeline reads from this folder, with where it came from and its licence. The **Git** column shows whether the file is tracked (T), gitignored (I), or untracked and not yet committed (U). Last updated 2026-10-17.

## Video

| Asset | What it is | Source | Licence / rights | Git |
|---|---|---|---|---|
| `hero-v3-master.mp4` | Untouched copy of the homescreen hero (1280×720, 24 fps, 10.0 s, H.264 + AAC 48 kHz stereo). Copied byte for byte (cmp-verified) from `kyronewvideo.mp4` in the repo root, which is the only copy with sound. | KYRO's own generated video (Veo/Flow), made for the landing page | Company-owned. The landing's hero video and poster stay unchanged (PLAN §2). | I |
| `hero-v3-1080.mp4` | **The hero upscaled for the film: 1920×1080, 30 fps, 300 frames, 10.0 s**, H.264 High CRF 14, BT.709 limited range, original AAC kept. | Built from `hero-v3-master.mp4` (see "How the upscale was made" below) | as above | I |
| `hero-v3-audio.wav` | The hero's own sound effects as a separate track for the mix: 48 kHz s16 stereo, 10.005 s, −21.3 LUFS. Sync points: whoosh at about 5.3 s, **hit at 6.90 s**, shimmer at about 7.5–9.1 s. | Extracted from `hero-v3-master.mp4` | as above | I |

### How the upscale was made

The test clips and comparison stills are in `demo-video/out-v4/upscale-test/` (gitignored).

**Excerpt.** Three methods were tested on a 3 s excerpt (5.5–8.5 s: the push-in on the night monitor, then the cyan ribbons). The stills were also checked on detail frames (faces at 3.2 s, the spreadsheet at 4.6 s).

| Method | Result |
|---|---|
| **A.** ffmpeg `scale` lanczos (accurate_rnd, full_chroma_int) + light `unsharp` 0.5 | Crisp, with a slight halo on high-contrast edges. |
| **B.** `zscale` spline36 | The softest of the three. |
| **C.** two-pass supersample: pass 1 `hqdn3d` light denoise + lanczos to 3840×2160 into a lossless FFV1 intermediate, then pass 2 bicubic down to 1920×1080 + `cas` 0.45 (contrast-adaptive sharpen) | The crispest text and faces, no halos, and the Veo compression noise is calmed. **Chosen.** |

None of the three is a motion method, so none can warp the ribbons. All of them are frame-for-frame spatial scales.

**Frame rate (24 to 30 fps).**
- Motion interpolation (`minterpolate` mci/aobmc) was tested and **rejected**. On the ribbons it smears blocks where strands cross (`out-v4/upscale-test/rejected-minterpolate-ribbon-warp.png`).
- So the 24-frame cadence is kept by **duplicating evenly: exactly one repeat every 5th output frame**. Repeats fall on frames 2, 7, 12 … 297, checked with `signalstats` YDIF. 240 of the 300 frames are unique, and nothing is slowed, frozen or blended.
- This is the same 4:5 pulldown a 24p film gets on a 30p timeline. A small cadence judder can show on the slow building pan (0–1.5 s) and the monitor push-in (about 5–6.8 s). It is no worse than any 24p source cut into a 30p edit.
- The fix that made the repeats perfectly even was to retime the intermediate onto a 1/24 timebase (`settb=1/24,setpts=N`). Matroska's millisecond timestamps had made the repeat spacing go 4/5/6.

**Colour.** The source is tagged as an SMPTE-170M matrix. Pass 2 converts it 601→709 with limited range kept on both sides. Average RGB matches the master to within 1–2 levels at six check times.

**Command (pass 2):**
```
settb=1/24,setpts=N,fps=30:round=near,scale=1920:1080:flags=bicubic+accurate_rnd:in_color_matrix=bt601:out_color_matrix=bt709:in_range=tv:out_range=tv,cas=0.45,format=yuv420p
```

**A better upscale.** If the Veo/Flow 1080p re-export ever arrives (decision 10), it replaces this file.

## Music and sound

The full URLs, licence text, loudness and sync points are in [`music/CREDITS.md`](music/CREDITS.md).

| Asset | Role | Source | Licence | Git |
|---|---|---|---|---|
| `track-759.mp3` | The calm bed under the chapters (v2/v3 bed) | Mixkit #759 "Romantic 05": https://assets.mixkit.co/music/759/759.mp3 (byte-identical) | Mixkit Stock Music Free License: web, social and VOD are fine; **no TV/radio broadcast** | T |
| `music/cue-coldopen-rise-hit.mp3` | Cold-open rise, hit at about 4.1 s → "Until now" | Mixkit SFX #2900 "Movie logo intro impact" | Mixkit Sound Effects Free License | I |
| `music/cue-card-swell.mp3` | Swell on each chapter card (peaks at 1.1–1.3 s) | Mixkit SFX #2638 "Magic transition sweep presentation" | Mixkit Sound Effects Free License | I |
| `music/cue-end-lift.mp3` | The lift into "Cairo" at the end (lift at about 11–12 s; resolves at 93–96 s) | Mixkit #33 "Motivating Mornings" | Mixkit Stock Music Free License | I |
| `music/alt-coldopen-whoosh-impact.mp3` | Alternate cold-open cue, for the animatic A/B | Mixkit SFX #2918 "Epic movie trailer whoosh impact" | Mixkit Sound Effects Free License | I |
| `music/CREDITS.md` | Credits and licence record | written for v4 | — | U |
| `track-132/371/441/471/474/623.mp3` | Older v2 candidates, not used in v4. track-471 = Mixkit "Rising Forest", the v2 bed. | Mixkit (free music) | Mixkit Stock Music Free License | T |

## Stills and cards

| Asset | What it is | Source | Licence / rights | Git |
|---|---|---|---|---|
| `kyro-lockup.png` | The KYRO wordmark/lockup | KYRO brand asset (company-owned) | Company-owned | T |
| `aws-logo.png` | AWS logo on the trust card (`trust.html`) | Wikimedia Commons (fetched for v2) | An Amazon trademark. It is used only to state the factual "Hosted on AWS". It is not an endorsement, and AWS brand guidelines apply. | T |
| `trust.html` | v2/v3 trust card (FERPA / encryption / AWS) | Written in-house | Company-owned. **v4 rebuilds the trust card in `scholar-v4/` with the approved privacy wording only.** | T |
| `endcard.html` | v3 end card | Written in-house | Company-owned. **It still points at the realistic owl (`kyro-owl-perched.webp`), so v4 must not use it.** The v4 end card is rendered by `scholar-v4/` with the cartoon Scholar. | T |
| `kyro-owl-perch.webp`, `kyro-owl-perched.webp` | The realistic Little Owl stills from Sept 2026 | Generated in-house (owl mascot work, 64e3951 / baf6e02) | Company-owned. **Superseded by the cartoon Scholar (8c97ba6); not for v4.** | T |

## Demo upload files (fictional "Bayview Catholic Schools" network)

Every name, number and account in these files is made up. They are the files dropped on camera, and they are generated by the `seed-v4/` scripts, not hand-made.

| Asset | Used in | Generated by | Git |
|---|---|---|---|
| `v4-files/Profit and Loss.xlsx`, `v4-files/Balance Sheet.xlsx` | f1–f4: the live QuickBooks-export upload on Brightwater | `seed-v4/finance-files.mjs` | U |
| `v4-files/pl-only/Profit and Loss.xlsx` | f4: the "Needs your Balance Sheet · Add it" beat | `seed-v4/finance-files.mjs` | U |
| `v4-files/messy/Trial Balance Export.xlsx` | The non-QuickBooks trial balance from "another system" | `seed-v4/finance-files.mjs` | U |
| `v4-files/Bayview Fall Census 2026-27.xlsx` | Enrollment: the one diocesan file | `seed-v4/load-enrollment.mjs` | U |
| `v4-files/brightwater-oneroster/users.csv` | e2: the made-up OneRoster drop on Brightwater | `seed-v4/load-enrollment.mjs` | U |
| `v4-files/bayview-terranova-2026-results.csv` | Academics: the TerraNova results drop | `seed-v4/load-academics.mjs` | U |

## Not stored here

- Voice: `demo-video/vo-v4/` (ElevenLabs, generated by `make-vo-v4.py`; gitignored).
- Captures: `captures-v4/`.
- Scholar renders: `scholar-v4/out/`.
- Seed output: `seed-v4/out/`.
- Final renders: `out-v4/`.

All of these are gitignored.

The demo login password lives only in `demo-video/.env.capture.local` (gitignored by `.env.*.local`). It is never printed or committed.

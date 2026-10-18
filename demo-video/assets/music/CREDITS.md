# Music and sound credits: KYRO demo v4

Everything below comes from **Mixkit** (mixkit.co). Each file was downloaded on 2026-10-17 straight from Mixkit's free asset host (`assets.mixkit.co`), using the URL listed on the item's mixkit.co page. No attribution is required. This file records where each one came from anyway.

The `.mp3` files in this folder are gitignored. If they go missing, download them again from the URLs below.

## Licences (checked on 2026-10-17 at https://mixkit.co/license/)

- **Mixkit Stock Music Free License** (music items). Free for commercial and non-commercial projects. You may copy, modify, distribute and publicly perform them on any web or social platform, including video-on-demand, podcasts and online ads.
  - **Not allowed:** CDs and DVDs, video games, or **TV and radio broadcast**. You also may not remix a track into a music-only piece, claim it as your own, or register it with a rights-management service such as YouTube Content ID.
  - In practice: the demo film is fine on the web, YouTube, social media and in sales calls, but these music items cannot go into a broadcast TV ad.
- **Mixkit Sound Effects Free License** (SFX items). Free for commercial use, including film, broadcast and video. The item must be part of a larger end product.
  - **Not allowed:** redistributing the file on its own, as stock, in a template or with source files, or claiming it or registering it with a rights-management service. This is why the files are kept out of git.

## Cues

| File | Role in v4 | Mixkit item | Type / licence | Source URL (download) | Item page |
|---|---|---|---|---|---|
| `../track-759.mp3` (tracked, from v2/v3) | Calm bed under the chapters | #759 "Romantic 05", 1:52 | Music / Stock Music Free | https://assets.mixkit.co/music/759/759.mp3 (byte-identical: 4,480,521 bytes) | listed under https://mixkit.co/free-stock-music/corporate-music/ |
| `cue-coldopen-rise-hit.mp3` | Cold-open rising cue with the hit on "Until now" | #2900 "Movie logo intro impact", 0:09 | SFX / Sound Effects Free | https://assets.mixkit.co/active_storage/sfx/2900/2900-preview.mp3 | listed under https://mixkit.co/free-sound-effects/cinematic/ |
| `cue-card-swell.mp3` | Short swell on each of the six chapter cards | #2638 "Magic transition sweep presentation", 0:04 | SFX / Sound Effects Free | https://assets.mixkit.co/active_storage/sfx/2638/2638-preview.mp3 | listed under https://mixkit.co/free-sound-effects/transition/ |
| `cue-end-lift.mp3` | The lift into "Cairo" at the end (trust card into the end card) | #33 "Motivating Mornings", 1:36 | Music / Stock Music Free | https://assets.mixkit.co/music/33/33.mp3 | listed under https://mixkit.co/free-stock-music/corporate-music/ |
| `alt-coldopen-whoosh-impact.mp3` (alternate, hear it in the animatic) | A sharper option for the cold open: whoosh, then impact | #2918 "Epic movie trailer whoosh impact", 0:10 | SFX / Sound Effects Free | https://assets.mixkit.co/active_storage/sfx/2918/2918-preview.mp3 | listed under https://mixkit.co/free-sound-effects/cinematic/ |

## Sync notes for build-v4.py

These were measured with ffmpeg and numpy. Nobody has listened to them yet; the animatic is where they get heard.

- **track-759:** about 72 BPM, A minor, −16.4 LUFS integrated. Steady level all the way through, with a fade at about 110 s.
- **cue-coldopen-rise-hit:** −12.0 LUFS integrated, true peak −0.8 dBTP, tonal (reads as C, which is compatible with 759's A minor).
  - The rise runs from 0 to 4.0 s, climbing from −36 to −8 dB RMS.
  - **The hit lands at about 4.1 s** (peak 4.1–4.8 s). Then it decays to silence by about 8.5 s.
  - Place it so 4.1 s lands on "Until now". The hero video's own hit (in `hero-v3-audio.wav`) is at **6.90 s of the hero clip**.
- **cue-card-swell:** −16.4 LUFS, about 4 s long, noise-like sweep with no pitch, so it cannot clash with the key.
  - The rise starts at about 0.2 s, **peaks at 1.1–1.3 s**, and falls below −40 dB by about 2.4 s.
  - That fits a 2.5 s card. Start it about 0.9 s before the ribbon wipe's midpoint.
- **cue-end-lift:** about 123 BPM, A minor (the same key as 759), −9.9 LUFS integrated, true peak +0.3 dBTP. **Turn it down before mixing.**
  - 0–11 s is a softer intro (about −16 dB). **The lift lands at about 11.1–12.1 s.**
  - It runs full until about 93.2 s, then resolves and rings out to 96.2 s.
  - For the end, either cross-fade from 759 so the 11–12 s lift hits the end card, or back-time the last 20–30 s so the natural resolve at 93–96 s lines up with the final lockup.
- If any cue fails in the animatic, the swells can be built from track-759 instead, for example by raising its level with an envelope over 1.5 s. This is allowed: the licence only forbids remixing into a *music-only* track.

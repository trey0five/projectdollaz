// Beat times from the voice-over's word timings (vo-v4/<id>.json, written by
// make-vo-v4.py from ElevenLabs /with-timestamps). Nothing is typed in by hand:
// every beat is "the moment word X is spoken", in SCENE seconds.
//
// The assembler drops each line VO_IN after its scene opens and gives the scene
// max(minSec, voice + VO_PAD) seconds (build-v3 rules, carried into v4), so the
// rig uses the same two numbers. If a timing file is missing, words are
// ESTIMATED by proportional character offset over the storyboard seconds and
// the scene is flagged `estimated` (the render log and out/<id>.json say so —
// re-render once the voice exists).
export const VO_IN = 0.35
export const VO_PAD = 1.0

const norm = (w) => String(w).toLowerCase().replace(/[^a-z0-9]/g, '')

function estimateWords(text, dur) {
  const out = []
  const re = /\S+/g
  let m
  while ((m = re.exec(text))) {
    out.push({ word: m[0], start: (dur * m.index) / text.length, end: (dur * (m.index + m[0].length)) / text.length })
  }
  return out
}

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error(`${url} → ${r.status}`)
  return r.json()
}

/**
 * @param {string} id      scene id (vo-v4/<id>.json)
 * @param {object} o
 * @param {number} o.minSec   the scene's minimum seconds (storyboard rows)
 * @param {number} [o.sec]    force the scene length (seconds)
 */
export async function loadVO(id, { minSec = 0, sec } = {}) {
  let words
  let dur
  let estimated = false
  let source
  let fingerprint = null
  try {
    const j = await getJSON(`/demo-video/vo-v4/${id}.json`)
    if (!j.words || !j.words.length) throw new Error('no words')
    words = j.words
    dur = j.duration ?? words[words.length - 1].end
    source = `vo-v4/${id}.json`
    fingerprint = j.fingerprint || null
  } catch (e) {
    const lines = await getJSON('/demo-video/vo-v4-lines.json')
    const ln = (lines.lines || lines).find((l) => l.id === id)
    if (!ln) throw new Error(`no voice timing and no script line for ${id}`)
    dur = Math.max(0.5, (ln.storyboardSec ?? minSec) - VO_PAD)
    words = estimateWords(ln.text, dur)
    estimated = true
    source = `ESTIMATED from vo-v4-lines.json (${e.message})`
  }
  const W = words.map((w, i) => ({ i, word: w.word, n: norm(w.word), t: w.start + VO_IN, te: w.end + VO_IN }))
  const sceneSec = sec != null ? +sec : Math.max(minSec, Math.round((dur + VO_PAD) * 1000) / 1000)

  /** Scene time of the `occ`-th spoken occurrence of `word` (1-based). Throws if absent. */
  function beat(word, occ = 1, edge = 't') {
    const key = norm(word)
    let k = 0
    for (const w of W) if (w.n === key && ++k === occ) return w[edge]
    throw new Error(`beat: "${word}" #${occ} not found in ${id}`)
  }
  /** Same as beat(), but the word's END time. */
  const beatEnd = (word, occ = 1) => beat(word, occ, 'te')

  // Talking spans: runs of words with gaps under 0.45 s.
  const spans = []
  for (const w of W) {
    const last = spans[spans.length - 1]
    if (last && w.t - last[1] < 0.45) last[1] = w.te
    else spans.push([w.t, w.te])
  }
  const talkingAt = (t) => spans.some(([a, b]) => t >= a - 0.04 && t <= b + 0.12)

  return { id, words: W, dur, sceneSec, estimated, source, fingerprint, beat, beatEnd, spans, talkingAt }
}

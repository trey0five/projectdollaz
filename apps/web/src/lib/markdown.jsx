/**
 * Tiny inline-markdown -> React node parser (ported from the Nagare AI renderer,
 * TS -> JS, re-themed to KYRO navy/gold). Intentionally minimal, dependency-free.
 * Covers:
 *   - # / ## / ### headings (all collapse to one visual weight)
 *   - **bold**
 *   - *italic* and _italic_
 *   - `code`
 *   - links: [text](url)
 *   - line breaks at `\n`
 *   - simple `- ` and `* ` bullet lines and `1. ` numbered lines
 *   - minimal pipe tables ( | a | b | rows, --- separator skipped )
 *   - ``` fenced code blocks ```
 *
 * No new deps. For anything richer, the caller can render the result with
 * `whitespace-pre-wrap` so additional formatting cues survive.
 */

function parseInline(text) {
  const parts = []
  let i = 0
  const len = text.length

  while (i < len) {
    // Code spans: `..`
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end > i) {
        parts.push({ kind: 'code', content: text.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    // Bold: **..**
    if (text[i] === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2)
      if (end > i + 1) {
        parts.push({ kind: 'bold', content: text.slice(i + 2, end) })
        i = end + 2
        continue
      }
    }
    // Italic: *..* or _.._
    if ((text[i] === '*' || text[i] === '_') && text[i + 1] !== text[i]) {
      const marker = text[i]
      const end = text.indexOf(marker, i + 1)
      if (end > i) {
        parts.push({ kind: 'italic', content: text.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    // Link: [text](url)
    if (text[i] === '[') {
      const closeBracket = text.indexOf(']', i + 1)
      if (closeBracket > i && text[closeBracket + 1] === '(') {
        const closeParen = text.indexOf(')', closeBracket + 2)
        if (closeParen > closeBracket) {
          const linkText = text.slice(i + 1, closeBracket)
          const href = text.slice(closeBracket + 2, closeParen)
          parts.push({ kind: 'link', content: linkText, href })
          i = closeParen + 1
          continue
        }
      }
    }
    // Plain text — accumulate until the next interesting char.
    let j = i + 1
    while (j < len && text[j] !== '`' && text[j] !== '*' && text[j] !== '_' && text[j] !== '[') j++
    parts.push({ kind: 'text', content: text.slice(i, j) })
    i = j
  }
  return parts
}

function renderInline(text, keyPrefix) {
  return parseInline(text).map((part, idx) => {
    const key = `${keyPrefix}-${idx}`
    if (part.kind === 'bold') return <strong key={key} className="font-semibold text-navy">{part.content}</strong>
    if (part.kind === 'italic') return <em key={key}>{part.content}</em>
    if (part.kind === 'code')
      return (
        <code
          key={key}
          className="px-1 py-0.5 rounded bg-cream text-[0.9em] text-navy border border-rule/50"
        >
          {part.content}
        </code>
      )
    if (part.kind === 'link') {
      // The markdown source is LLM-generated, so the href is untrusted: allow only
      // http(s)/mailto/relative/anchor links. Anything else (javascript:, data:, …)
      // renders as plain text to prevent script-URL injection.
      const safe = /^(https?:|mailto:|\/|#)/i.test((part.href || '').trim())
      if (!safe) return <span key={key}>{part.content}</span>
      return (
        <a
          key={key}
          href={part.href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-gold underline hover:no-underline"
        >
          {part.content}
        </a>
      )
    }
    return <span key={key}>{part.content}</span>
  })
}

/**
 * Render a triple-backtick fenced code block as a <pre><code> element.
 */
function renderCodeFence(code, key) {
  return (
    <pre key={key} className="my-1 overflow-x-auto">
      <code className="block whitespace-pre-wrap text-xs bg-navy/[0.04] border border-rule/50 p-2 rounded">
        {code}
      </code>
    </pre>
  )
}

/**
 * Split input on triple-backtick fences. Returns alternating segments where
 * `fenced` marks code blocks. Optional language tag is stripped.
 */
function splitFences(input) {
  const re = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g
  const out = []
  let last = 0
  let m
  while ((m = re.exec(input)) !== null) {
    if (m.index > last) out.push({ fenced: false, text: input.slice(last, m.index) })
    out.push({ fenced: true, text: m[2].replace(/\n$/, '') })
    last = m.index + m[0].length
  }
  if (last < input.length) out.push({ fenced: false, text: input.slice(last) })
  return out
}

/**
 * Parse a single markdown string into JSX. Output is a flat list of <h4>, <p>,
 * <ul>, <ol>, <table>, and <pre> elements separated by blank lines.
 */
export function renderMarkdown(input) {
  const segments = splitFences(input || '')
  // Fast path: no fences — run the inline/block parser on the whole input.
  if (segments.length <= 1 && !segments.some((s) => s.fenced)) {
    return renderMarkdownInline(input || '')
  }
  const out = []
  segments.forEach((seg, i) => {
    if (seg.fenced) {
      out.push(renderCodeFence(seg.text, `fence-${i}`))
    } else if (seg.text) {
      // Wrap each non-fenced segment in a keyed fragment so its internal
      // keys remain unique relative to siblings.
      out.push(
        <span key={`seg-${i}`} className="contents">
          {renderMarkdownInline(seg.text)}
        </span>,
      )
    }
  })
  return out
}

// A line is a table row when it has at least one un-escaped pipe and starts/ends
// with optional pipe + content. The --- separator row (only -, : and |) is skipped.
function isTableRow(line) {
  const t = line.trim()
  if (!t.includes('|')) return false
  // Must contain something other than the pipe itself.
  return /\|/.test(t) && /[^|]/.test(t)
}
function isTableSeparator(line) {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  if (!t.includes('-')) return false
  return /^[\s:\-|]+$/.test(t)
}
function splitTableCells(line) {
  let t = line.trim()
  if (t.startsWith('|')) t = t.slice(1)
  if (t.endsWith('|')) t = t.slice(0, -1)
  return t.split('|').map((c) => c.trim())
}

function renderMarkdownInline(input) {
  const lines = (input || '').split('\n')
  const blocks = []
  let bullets = []
  let numbered = []
  let para = []
  let tableRows = []

  const flushBullets = (idx) => {
    if (!bullets.length) return
    blocks.push(
      <ul key={`ul-${idx}`} className="list-disc pl-5 my-1 space-y-0.5">
        {bullets.map((b, i) => (
          <li key={i}>{renderInline(b, `b-${idx}-${i}`)}</li>
        ))}
      </ul>,
    )
    bullets = []
  }
  const flushNumbered = (idx) => {
    if (!numbered.length) return
    blocks.push(
      <ol key={`ol-${idx}`} className="list-decimal pl-5 my-1 space-y-0.5">
        {numbered.map((b, i) => (
          <li key={i}>{renderInline(b, `n-${idx}-${i}`)}</li>
        ))}
      </ol>,
    )
    numbered = []
  }
  const flushPara = (idx) => {
    if (!para.length) return
    const text = para.join(' ')
    blocks.push(<p key={`p-${idx}`}>{renderInline(text, `p-${idx}`)}</p>)
    para = []
  }
  const flushTable = (idx) => {
    if (!tableRows.length) return
    const rows = tableRows
    tableRows = []
    const head = rows[0]
    const body = rows.slice(1)
    blocks.push(
      <table key={`tb-${idx}`} className="w-full text-[13px] border border-rule/50 rounded my-1">
        <thead className="bg-cream">
          <tr>
            {head.map((c, i) => (
              <th key={i} className="text-left font-semibold text-navy px-2 py-1 border-b border-rule/50">
                {renderInline(c, `th-${idx}-${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri} className="border-b border-rule/30 last:border-0">
              {r.map((c, ci) => (
                <td key={ci} className="px-2 py-1 align-top">
                  {renderInline(c, `td-${idx}-${ri}-${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>,
    )
  }

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trimEnd()
    if (!line.trim()) {
      flushBullets(idx)
      flushNumbered(idx)
      flushTable(idx)
      flushPara(idx)
      return
    }
    // Heading: # / ## / ### -> one visual weight (h4).
    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line)
    if (headingMatch) {
      flushBullets(idx)
      flushNumbered(idx)
      flushTable(idx)
      flushPara(idx)
      blocks.push(
        <h4 key={`h-${idx}`} className="font-bold text-navy text-[15px] mt-1">
          {renderInline(headingMatch[2], `h-${idx}`)}
        </h4>,
      )
      return
    }
    // Table rows: accumulate consecutive pipe lines, skipping the --- separator.
    if (isTableRow(line) && (tableRows.length > 0 || isTableRow(line))) {
      if (isTableSeparator(line)) {
        // separator row — only meaningful inside a table; skip it.
        if (tableRows.length > 0) return
      } else {
        flushBullets(idx)
        flushNumbered(idx)
        flushPara(idx)
        tableRows.push(splitTableCells(line))
        return
      }
    } else if (tableRows.length > 0) {
      flushTable(idx)
    }
    const bulletMatch = /^\s*[-*]\s+(.*)$/.exec(line)
    const numberedMatch = /^\s*\d+\.\s+(.*)$/.exec(line)
    if (bulletMatch) {
      flushNumbered(idx)
      flushTable(idx)
      flushPara(idx)
      bullets.push(bulletMatch[1])
      return
    }
    if (numberedMatch) {
      flushBullets(idx)
      flushTable(idx)
      flushPara(idx)
      numbered.push(numberedMatch[1])
      return
    }
    flushBullets(idx)
    flushNumbered(idx)
    flushTable(idx)
    para.push(line)
  })
  flushBullets(lines.length)
  flushNumbered(lines.length)
  flushTable(lines.length)
  flushPara(lines.length)
  return blocks
}

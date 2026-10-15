/**
 * VerdictEm — the emphasised words inside a band's verdict sentence.
 *   <VerdictEm>$430,000 ahead</VerdictEm>              bold white
 *   <VerdictEm tone="watch">Cash is the one to watch.</VerdictEm>   warm yellow
 *   tone: good (mint) | watch (yellow) | risk (rose) | undefined (white)
 */
export default function VerdictEm({ tone = null, children }) {
  return <em className={`au-em${tone ? ` au-em-${tone}` : ''}`}>{children}</em>
}

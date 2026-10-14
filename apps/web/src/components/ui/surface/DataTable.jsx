import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

// DataTable — the table discipline (Premium UI §2.4): sticky 11px-caps thead on
// the ground, 36px hairline rows, `.dt-num` right-aligned tabular numerics, a
// 2px status-mark column (no pills), sort chevrons, a ruled empty row, and a
// one-shot row reveal (opacity, 15ms stagger, capped at 20 rows).
//
//   columns  [{ key, header, num, sortable, render(row), sortValue(row), width,
//              className, headerClassName }]
//   rows     array of records; `rowKey` (string | fn) identifies a row
//   markOf   (row) → 'good' | 'watch' | 'risk' | 'neutral' | null — adds the
//            2px mark column when given
//   sort     { key, dir } (controlled) or `defaultSort`; `onSort` is told of
//            every change either way
//   empty    text for the ruled empty row; `onRowClick(row)` makes rows links.
export const REVEAL_CAP = 20

const Chevron = () => (
  <svg className="dt-chev" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
    <path d="M2 6.5 5 3.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const compare = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}
// Empty cells sort LAST in both directions (a blank is not "less than zero").
const nullsLast = (a, b) => (a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : null)

export function sortRows(rows, columns, sort) {
  if (!sort?.key) return rows
  const col = columns.find((c) => c.key === sort.key)
  if (!col) return rows
  const val = (r) => (col.sortValue ? col.sortValue(r) : r[col.key])
  const dir = sort.dir === 'desc' ? -1 : 1
  return rows
    .map((r, i) => [r, i])
    .sort(([a, ia], [b, ib]) => {
      const va = val(a)
      const vb = val(b)
      return nullsLast(va, vb) ?? (dir * compare(va, vb) || ia - ib)
    })
    .map(([r]) => r)
}

export default function DataTable({
  columns,
  rows = [],
  rowKey = 'id',
  markOf,
  sort: sortProp,
  defaultSort,
  onSort,
  empty = 'Nothing to show yet.',
  onRowClick,
  caption,
  className = '',
  ...rest
}) {
  const reduce = useReducedMotion()
  const [sortState, setSortState] = useState(defaultSort ?? null)
  const sort = sortProp ?? sortState

  const setSort = (key) => {
    const next = sort?.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    if (sortProp === undefined) setSortState(next)
    onSort?.(next)
  }

  const sorted = useMemo(() => sortRows(rows, columns, sort), [rows, columns, sort])
  const keyOf = typeof rowKey === 'function' ? rowKey : (r, i) => r?.[rowKey] ?? i
  const colSpan = columns.length + (markOf ? 1 : 0)
  const Row = reduce ? 'tr' : motion.tr

  return (
    <div className={`dt-wrap${className ? ` ${className}` : ''}`}>
      <table className="dt" {...rest}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {markOf ? <th className="dt-mark" aria-label="status" /> : null}
            {columns.map((c) => {
              const active = sort?.key === c.key
              const thCls = [c.num ? 'dt-num' : null, c.sortable ? 'dt-sort' : null, active ? 'dt-sort-active' : null, active && sort.dir === 'desc' ? 'dt-sort-desc' : null, c.headerClassName || null]
                .filter(Boolean)
                .join(' ')
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={thCls || undefined}
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined}
                >
                  {c.sortable ? (
                    <button type="button" className="dt-sort-btn" onClick={() => setSort(c.key)}>
                      {c.header}
                      <Chevron />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr className="dt-empty">
              <td colSpan={colSpan}>{empty}</td>
            </tr>
          ) : (
            sorted.map((row, i) => {
              const motionProps = reduce
                ? {}
                : {
                    initial: { opacity: 0 },
                    animate: { opacity: 1 },
                    transition: { duration: 0.24, delay: Math.min(i, REVEAL_CAP) * 0.015 },
                  }
              const tone = markOf ? markOf(row) : null
              return (
                <Row
                  key={keyOf(row, i)}
                  className={onRowClick ? 'dt-row-link' : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  {...motionProps}
                >
                  {markOf ? (
                    <td className="dt-mark">{tone ? <i className={`tone-${tone}`} aria-label={tone} /> : null}</td>
                  ) : null}
                  {columns.map((c) => (
                    <td key={c.key} className={[c.num ? 'dt-num' : null, c.className || null].filter(Boolean).join(' ') || undefined}>
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </Row>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The recycle bin's SQL primitives. Every function takes the CALLER's
// transaction client, so a removal (header + move) or a restore (move back +
// header delete) commits or rolls back as one.
//
// Rows move as to_jsonb(row) and come back through jsonb_populate_record, so a
// restored import / snapshot / month / budget keeps its ORIGINAL id and
// created_at (value history, KYRO's undo handle and the comparative resolver's
// "newest createdAt wins" rule all keep working).
//
// Table names come ONLY from BIN_TABLES via Prisma.raw — never from input.
// ─────────────────────────────────────────────────────────────────────────────
import { ConflictException } from '@nestjs/common'
import { Prisma } from '@finrep/db'

export const BIN_TABLES = {
  import: 'imports',
  statement_snapshot: 'statement_snapshots',
  monthly_snapshot: 'monthly_snapshots',
  period_budget: 'period_budgets',
} as const

export type BinModel = keyof typeof BIN_TABLES

export const CHANGED_MESSAGE = 'This changed since you opened it. Have another look.'

/**
 * Serialize every remove/restore of one (school, period) — the same advisory
 * lock form the accreditation catalog uses. Held until the transaction ends.
 */
export async function lockPeriod(
  tx: Prisma.TransactionClient,
  schoolId: string,
  periodId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}::text), hashtext(${periodId}::text))`
}

/**
 * Copy the given rows into the bin, then delete exactly those rows. Deleting
 * ONLY by the ids read under the lock means an upload or QuickBooks sync that
 * lands meanwhile survives. If either count is off, something moved under us:
 * throw (rolls the whole transaction back).
 */
export async function moveToBin(
  tx: Prisma.TransactionClient,
  removalId: string,
  model: BinModel,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0
  const table = Prisma.raw(BIN_TABLES[model])
  const copied = await tx.$executeRaw`
    INSERT INTO data_removal_items (id, removal_id, model, record_id, data)
    SELECT gen_random_uuid(), ${removalId}::uuid, ${model}, t.id, to_jsonb(t)
    FROM ${table} t WHERE t.id = ANY(${ids}::uuid[])`
  if (copied !== ids.length) {
    throw new ConflictException({ code: 'CHANGED', message: CHANGED_MESSAGE })
  }
  const deleted = await tx.$executeRaw`DELETE FROM ${table} WHERE id = ANY(${ids}::uuid[])`
  if (deleted !== ids.length) {
    throw new ConflictException({ code: 'CHANGED', message: CHANGED_MESSAGE })
  }
  return deleted
}

/**
 * The per-row patch applied before re-inserting. imports / monthly_snapshots
 * carry an uploaded_by foreign key to users: if that person's account was
 * deleted while the row sat in the bin, put it back with no uploader rather
 * than failing the restore. The other two tables' user columns are soft refs.
 */
function fixFor(model: BinModel): Prisma.Sql {
  if (model === 'import' || model === 'monthly_snapshot') {
    return Prisma.raw(
      `jsonb_build_object('uploaded_by', CASE WHEN EXISTS (SELECT 1 FROM users u WHERE u.id::text = d.data->>'uploaded_by') THEN d.data->'uploaded_by' ELSE 'null'::jsonb END)`,
    )
  }
  return Prisma.raw(`'{}'::jsonb`)
}

/**
 * Put a removal's rows of one model back, with their original ids. Returns the count.
 *
 * The INSERT names only the columns the binned JSON actually carries (read from
 * information_schema, so identifiers never come from input). A column added to
 * the table AFTER the row was binned is left out and takes its column DEFAULT —
 * jsonb_populate_record alone would hand it SQL NULL, breaking a NOT NULL ...
 * DEFAULT column and nulling a defaulted nullable one. A later NOT NULL column
 * with NO default still fails (→ RESTORE_FAILED); see the schema note on
 * DataRemoval.
 */
export async function restoreFromBin(
  tx: Prisma.TransactionClient,
  removalId: string,
  model: BinModel,
): Promise<number> {
  const tableName = BIN_TABLES[model]
  const table = Prisma.raw(tableName)
  const cols = await tx.$queryRaw<{ column_name: string }[]>`
    SELECT c.column_name::text AS column_name
    FROM information_schema.columns c
    WHERE c.table_schema = current_schema() AND c.table_name = ${tableName}
      AND EXISTS (
        SELECT 1 FROM data_removal_items d
        WHERE d.removal_id = ${removalId}::uuid AND d.model = ${model}
          AND (d.data -> c.column_name::text) IS NOT NULL
      )
    ORDER BY c.ordinal_position`
  if (cols.length === 0) return 0
  const quoted = cols.map((c) => `"${c.column_name.replace(/"/g, '""')}"`)
  const columnList = Prisma.raw(quoted.join(', '))
  const selectList = Prisma.raw(quoted.map((q) => `r.${q}`).join(', '))
  return tx.$executeRaw`
    INSERT INTO ${table} (${columnList})
    SELECT ${selectList}
    FROM data_removal_items d,
         LATERAL jsonb_populate_record(NULL::${table}, d.data || ${fixFor(model)}) r
    WHERE d.removal_id = ${removalId}::uuid AND d.model = ${model}`
}

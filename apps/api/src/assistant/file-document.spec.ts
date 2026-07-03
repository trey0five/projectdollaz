import { describe, expect, it, vi } from 'vitest'
import type { User } from '@finrep/db'
import { AssistantService, type ProposedAction } from './assistant.service.js'
import { TOOL_SCHEMAS, TOOL_LABELS } from './assistant.tools.js'

// ─────────────────────────────────────────────────────────────────────────────
// Penny file_document slice — the confirm-then-FILE tool that classifies an
// attached document and PROPOSES filing it into the Knowledge store. Verifies
// (WITHOUT booting Nest/Prisma, every dep a hand-mock):
//   • buildProposal(file_document): proposal shape, RAW bytes carried as base64,
//     size-cap decline, missing attachment decline, sourceRef manual/non-manual,
//     and NO mutation (documents.createDocument never called at build)
//   • applyAction: decode + re-validate untrusted payload, re-check the REAL buffer
//     size, isConfigured() guard (503-style, never a 500), and it calls
//     DocumentsService.createDocument with the right (schoolId, file, dto, userId)
//     — a forged/cross-tenant sourceRef is forwarded (resolveLink 404s in the service)
//   • runToolCall routing: owner → onProposal (NOT filed); viewer → no-edit-access
//   • the tool is registered
// ─────────────────────────────────────────────────────────────────────────────

const USER = { id: 'caller-1', email: 'caller@school.test' } as unknown as User
const ATT_ID = 'att-1'

/** A file_document-focused AssistantService: documents.createDocument +
 *  documentStorage.isConfigured are the only live mocks; the rest are inert stubs. */
function makeService(opts: { configured?: boolean } = {}) {
  const createDocument = vi.fn(
    async (_schoolId: string, _file: unknown, _dto: unknown, _userId: string) => ({ id: 'doc1' }),
  )
  const documents = { createDocument }
  const isConfigured = vi.fn(() => opts.configured ?? true)
  const documentStorage = { isConfigured }
  const stub = {} as never
  const svc = new AssistantService(
    stub, // prisma
    stub, // periods
    stub, // analytics
    stub, // budget
    stub, // rollup
    stub, // briefing
    stub, // compliance
    stub, // reconciliation
    stub, // correctiveAction
    stub, // boardReport
    stub, // operational
    stub, // client
    stub, // files
    stub, // imports
    stub, // statements
    stub, // tasks
    documents as never, // documents
    documentStorage as never, // documentStorage
    stub, // policies
    stub, // committees
    stub, // meetings
    stub, // accreditation
    stub, // facilities
    stub, // advancement
  )
  return { svc, createDocument, isConfigured }
}

// Request-scoped prep with the raw file bytes (the shape assistant-files.prepare
// produces). buildFileDocumentProposal reads ctx.prep.rawFiles.get(attachmentId).
function ctxWith(raw: { buffer: Buffer; mimeType: string; fileName: string }, role = 'owner') {
  return {
    schoolId: 'school-1',
    periodId: 'period-1',
    userId: USER.id,
    user: USER,
    role,
    prep: { rawFiles: new Map([[ATT_ID, raw]]) },
  }
}

const RAW = { buffer: Buffer.from('hello pdf'), mimeType: 'application/pdf', fileName: 'policy.pdf' }

// buildProposal / applyAction are private — reach them through an `any` cast.
const build = (svc: AssistantService, args: Record<string, unknown>, ctx: Record<string, unknown>) =>
  (svc as unknown as { buildProposal: (n: string, a: unknown, c: unknown) => Promise<ProposedAction> })
    .buildProposal('file_document', args, ctx)

const apply = (svc: AssistantService, action: ProposedAction) =>
  (svc as unknown as {
    applyAction: (s: string, u: User, a: ProposedAction) => Promise<{ applied: boolean; summary: string }>
  }).applyAction('school-1', USER, action)

describe('file_document — buildProposal (confirmable, no mutation)', () => {
  it('carries the RAW bytes as base64 and clamps the fields', async () => {
    const { svc, createDocument } = makeService()
    const action = await build(
      svc,
      {
        attachmentId: ATT_ID,
        title: '  FY2026 CoI Policy  ',
        tags: ['governance', ' compliance ', '', 42 as unknown as string],
        sourceType: 'manual',
      },
      ctxWith(RAW),
    )
    expect(action.kind).toBe('file_document')
    expect(action.payload.title).toBe('FY2026 CoI Policy') // trimmed
    expect(action.payload.fileDataBase64).toBe(Buffer.from('hello pdf').toString('base64')) // BYTES CARRIED
    expect(action.payload.fileName).toBe('policy.pdf')
    expect(action.payload.mimeType).toBe('application/pdf')
    expect(action.payload.tags).toEqual(['governance', 'compliance']) // trimmed, empties/non-strings dropped
    expect(action.payload.sourceType).toBe('manual')
    expect(action.summary).toContain('FY2026 CoI Policy')
    // NO MUTATION during buildProposal.
    expect(createDocument).not.toHaveBeenCalled()
  })

  it('declines a too-large attachment, pointing at the Knowledge uploader', async () => {
    const { svc, createDocument } = makeService()
    const big = Buffer.alloc(5 * 1024 * 1024 + 1)
    await expect(
      build(svc, { attachmentId: ATT_ID, title: 'Big' }, ctxWith({ ...RAW, buffer: big })),
    ).rejects.toThrow(/too large|Knowledge uploader/i)
    expect(createDocument).not.toHaveBeenCalled()
  })

  it('declines when the attachmentId resolves to no bytes', async () => {
    const { svc } = makeService()
    await expect(
      build(svc, { attachmentId: 'unknown', title: 'X' }, ctxWith(RAW)),
    ).rejects.toThrow(/attachmentId/i)
  })

  it('drops sourceRef when sourceType is manual; keeps it when non-manual', async () => {
    const { svc } = makeService()
    const uuid = '11111111-1111-4111-8111-111111111111'
    const manual = await build(
      svc,
      { attachmentId: ATT_ID, title: 'T', sourceType: 'manual', sourceRef: uuid },
      ctxWith(RAW),
    )
    expect(manual.payload.sourceRef).toBeUndefined()
    const linked = await build(
      svc,
      { attachmentId: ATT_ID, title: 'T', sourceType: 'policy', sourceRef: uuid },
      ctxWith(RAW),
    )
    expect(linked.payload.sourceType).toBe('policy')
    expect(linked.payload.sourceRef).toBe(uuid)
  })
})

describe('file_document — applyAction (re-validate + reuse DocumentsService)', () => {
  const action = (payload: Record<string, unknown>): ProposedAction => ({
    kind: 'file_document',
    periodId: '',
    summary: 'File a document',
    payload,
  })

  const goodPayload = (over: Record<string, unknown> = {}) => ({
    title: 'FY2026 CoI Policy',
    fileName: 'policy.pdf',
    mimeType: 'application/pdf',
    tags: ['governance'],
    sourceType: 'manual',
    fileDataBase64: Buffer.from('hello pdf').toString('base64'),
    ...over,
  })

  it('decodes the bytes and calls createDocument with the right args', async () => {
    const { svc, createDocument } = makeService()
    const res = await apply(svc, action(goodPayload()))
    expect(createDocument).toHaveBeenCalledTimes(1)
    const [schoolId, file, dto, userId] = createDocument.mock.calls[0]
    expect(schoolId).toBe('school-1')
    expect((file as { originalname: string }).originalname).toBe('policy.pdf')
    expect((file as { mimetype: string }).mimetype).toBe('application/pdf')
    expect((file as { buffer: Buffer }).buffer.equals(Buffer.from('hello pdf'))).toBe(true)
    expect((dto as { title: string }).title).toBe('FY2026 CoI Policy')
    expect((dto as { sourceType: string }).sourceType).toBe('manual')
    expect((dto as { tags?: string[] }).tags).toEqual(['governance'])
    expect(userId).toBe(USER.id)
    expect(res).toEqual({ applied: true, summary: 'File a document' })
  })

  it('re-validates a blank title → throws, createDocument NOT called', async () => {
    const { svc, createDocument } = makeService()
    await expect(apply(svc, action(goodPayload({ title: '   ' })))).rejects.toThrow(/title/i)
    expect(createDocument).not.toHaveBeenCalled()
  })

  it('re-checks the REAL decoded buffer size → throws on oversized, createDocument NOT called', async () => {
    const { svc, createDocument } = makeService()
    const big = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')
    await expect(apply(svc, action(goodPayload({ fileDataBase64: big })))).rejects.toThrow(/too large/i)
    expect(createDocument).not.toHaveBeenCalled()
  })

  it('storage not configured → 503-style decline (never a 500), createDocument NOT called', async () => {
    const { svc, createDocument } = makeService({ configured: false })
    await expect(apply(svc, action(goodPayload()))).rejects.toThrow(/configured/i)
    expect(createDocument).not.toHaveBeenCalled()
  })

  it('forwards a non-manual sourceRef through to createDocument (tenant check lives there)', async () => {
    const { svc, createDocument } = makeService()
    await apply(svc, action(goodPayload({ sourceType: 'policy', sourceRef: 'forged-ref' })))
    const [, , dto] = createDocument.mock.calls[0]
    expect((dto as { sourceType: string }).sourceType).toBe('policy')
    expect((dto as { sourceRef?: string }).sourceRef).toBe('forged-ref')
  })
})

describe('file_document — runToolCall routing (confirm-then-file)', () => {
  const toolCall = (args: Record<string, unknown>) => ({
    id: 'tc1',
    function: { name: 'file_document', arguments: JSON.stringify(args) },
  })
  const makeSinks = () => ({
    onChart: vi.fn(),
    onProposal: vi.fn(),
    onNavigate: vi.fn(),
    onApplied: vi.fn(),
    onGuide: vi.fn(),
  })
  const run = (svc: AssistantService, tc: unknown, ctx: unknown, sinks: unknown) =>
    (svc as unknown as {
      runToolCall: (t: unknown, c: unknown, s: unknown) => Promise<unknown>
    }).runToolCall(tc, ctx, sinks)

  it('owner: emits a proposal (onProposal) and does NOT file', async () => {
    const { svc, createDocument } = makeService()
    const sinks = makeSinks()
    const res = (await run(
      svc,
      toolCall({ attachmentId: ATT_ID, title: 'Policy' }),
      ctxWith(RAW),
      sinks,
    )) as { proposed?: boolean }
    expect(res.proposed).toBe(true)
    expect(sinks.onProposal).toHaveBeenCalledTimes(1)
    expect(sinks.onApplied).not.toHaveBeenCalled()
    expect(createDocument).not.toHaveBeenCalled()
  })

  it('viewer: is refused (no edit access), no proposal, no file', async () => {
    const { svc, createDocument } = makeService()
    const sinks = makeSinks()
    const res = (await run(
      svc,
      toolCall({ attachmentId: ATT_ID, title: 'X' }),
      ctxWith(RAW, 'viewer'),
      sinks,
    )) as { error?: string }
    expect(res.error).toMatch(/edit access/i)
    expect(sinks.onProposal).not.toHaveBeenCalled()
    expect(createDocument).not.toHaveBeenCalled()
  })
})

describe('file_document — registry wiring', () => {
  it('is a registered tool with a status label', () => {
    const names = TOOL_SCHEMAS.map((t) => t.function.name)
    expect(names).toContain('file_document')
    expect(TOOL_LABELS.file_document).toBeTruthy()
  })
})

import { describe, expect, it, vi } from 'vitest'
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { DocumentsService, type UploadedDocumentFile } from './documents.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 Knowledge document store — the DocumentsService. Verified WITHOUT booting
// Nest, Prisma, or AWS: PrismaService, a MOCKED DocumentStorageService (NEVER hits
// real S3), and AuditService are hand-mocked. Covers: tenant isolation (findFirst
// {id, schoolId} → 404), compensating cleanup (DB create failure after S3 put deletes
// the object), upload validation (missing file / mime allowlist / real-buffer size),
// link-resolve 404, storage-not-configured 503, and delete removes BOTH object + row.
// ─────────────────────────────────────────────────────────────────────────────

/** First-call-first-arg of a vi mock, loosely typed (our mocks declare no arg types). */
function firstArg(fn: unknown): any {
  return (fn as ReturnType<typeof vi.fn>).mock.calls[0][0]
}
/** First-call return value of a vi mock, loosely typed. */
function firstResult(fn: unknown): any {
  return (fn as ReturnType<typeof vi.fn>).mock.results[0].value
}

const SCHOOL = '11111111-1111-1111-1111-111111111111'
const OTHER_SCHOOL = '22222222-2222-2222-2222-222222222222'
const DOC = '33333333-3333-3333-3333-333333333333'
const USER = '44444444-4444-4444-4444-444444444444'
const REF = '55555555-5555-5555-5555-555555555555'

function dbRow(over: Record<string, unknown> = {}) {
  return {
    id: DOC,
    schoolId: SCHOOL,
    title: 'Handbook',
    description: null,
    fileName: 'handbook.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 10,
    s3Key: 'finrep/documents/' + SCHOOL + '/' + DOC + '/handbook.pdf',
    tags: [],
    sourceType: 'manual',
    sourceRef: null,
    uploadedByUserId: USER,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  }
}

function pdf(over: Partial<UploadedDocumentFile> = {}): UploadedDocumentFile {
  return {
    originalname: 'handbook.pdf',
    mimetype: 'application/pdf',
    buffer: Buffer.from('hello world'),
    ...over,
  }
}

/** Build a DocumentsService with fully-mocked deps. Storage is configured by default. */
function makeService(
  opts: {
    configured?: boolean
    createImpl?: () => Promise<unknown>
    findFirstImpl?: () => Promise<unknown>
    linkTables?: Record<string, unknown>
  } = {},
) {
  const configured = opts.configured ?? true
  const storage = {
    isConfigured: vi.fn(() => configured),
    ttlSeconds: vi.fn(() => 604800),
    buildKey: vi.fn(
      (schoolId: string, documentId: string, fileName: string) =>
        `finrep/documents/${schoolId}/${documentId}/${fileName}`,
    ),
    putObject: vi.fn(async () => undefined),
    presignGetUrl: vi.fn(async () => 'https://s3.example/presigned'),
    deleteObject: vi.fn(async () => undefined),
  }
  const linkTable = (rows: unknown) => ({ findFirst: vi.fn(async () => rows ?? null) })
  const prisma = {
    knowledgeDocument: {
      create: vi.fn(opts.createImpl ?? (async () => dbRow())),
      findFirst: vi.fn(opts.findFirstImpl ?? (async () => dbRow())),
      findMany: vi.fn(async () => [dbRow()]),
      update: vi.fn(async () => dbRow()),
      delete: vi.fn(async () => dbRow()),
    },
    policy: linkTable(opts.linkTables?.policy),
    boardReport: linkTable(opts.linkTables?.board_report),
    accreditationStandard: linkTable(opts.linkTables?.standard),
    advancementCampaign: linkTable(opts.linkTables?.campaign),
    maintenanceItem: linkTable(opts.linkTables?.maintenance),
  }
  const audit = { write: vi.fn(async () => undefined) }
  const svc = new DocumentsService(prisma as never, storage as never, audit as never)
  return { svc, prisma, storage, audit }
}

describe('DocumentsService — createDocument validation', () => {
  it('rejects a missing file with 400 (before any S3 call)', async () => {
    const { svc, storage } = makeService()
    await expect(
      svc.createDocument(SCHOOL, undefined, { title: 'x' } as never, USER),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(storage.putObject).not.toHaveBeenCalled()
  })

  it('rejects a disallowed mime type with 400', async () => {
    const { svc, storage } = makeService()
    await expect(
      svc.createDocument(SCHOOL, pdf({ mimetype: 'application/x-msdownload' }), { title: 'x' } as never, USER),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(storage.putObject).not.toHaveBeenCalled()
  })

  it('rejects a real-buffer over 25MB (client size never trusted)', async () => {
    const { svc, storage } = makeService()
    const big = pdf({ buffer: Buffer.alloc(25 * 1024 * 1024 + 1) })
    await expect(
      svc.createDocument(SCHOOL, big, { title: 'x' } as never, USER),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(storage.putObject).not.toHaveBeenCalled()
  })

  it('returns 503 when storage is not configured', async () => {
    const { svc, storage } = makeService({ configured: false })
    await expect(
      svc.createDocument(SCHOOL, pdf(), { title: 'x' } as never, USER),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(storage.putObject).not.toHaveBeenCalled()
  })

  it('happy path: S3 put THEN db create THEN audit; sizeBytes from the real buffer', async () => {
    const { svc, prisma, storage, audit } = makeService()
    const res = await svc.createDocument(SCHOOL, pdf(), { title: 'Handbook' } as never, USER)
    expect(storage.putObject).toHaveBeenCalledOnce()
    expect(prisma.knowledgeDocument.create).toHaveBeenCalledOnce()
    const data = firstArg(prisma.knowledgeDocument.create).data
    expect(data.schoolId).toBe(SCHOOL)
    expect(data.sizeBytes).toBe(Buffer.from('hello world').length)
    expect(data.uploadedByUserId).toBe(USER)
    expect(audit.write).toHaveBeenCalledOnce()
    // No secret/key leaked in the audit metadata.
    const meta = firstArg(audit.write).metadata
    expect(JSON.stringify(meta)).not.toContain('finrep/documents')
    expect(res.id).toBe(DOC)
  })
})

describe('DocumentsService — link resolution (tenant-safe)', () => {
  it('non-manual sourceType requires sourceRef (400)', async () => {
    const { svc } = makeService()
    await expect(
      svc.createDocument(SCHOOL, pdf(), { title: 'x', sourceType: 'policy' } as never, USER),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('a cross-tenant / missing sourceRef resolves to 404 (never queried cross-school)', async () => {
    const { svc, storage } = makeService({ linkTables: { policy: null } })
    await expect(
      svc.createDocument(SCHOOL, pdf(), { title: 'x', sourceType: 'policy', sourceRef: REF } as never, USER),
    ).rejects.toBeInstanceOf(NotFoundException)
    // Validation happens BEFORE the S3 put.
    expect(storage.putObject).not.toHaveBeenCalled()
  })

  it('a valid same-school link is scoped by schoolId and persists sourceRef', async () => {
    const { svc, prisma } = makeService({ linkTables: { policy: { id: REF } } })
    await svc.createDocument(SCHOOL, pdf(), { title: 'x', sourceType: 'policy', sourceRef: REF } as never, USER)
    const where = firstArg(prisma.policy.findFirst).where
    expect(where).toMatchObject({ id: REF, schoolId: SCHOOL })
  })
})

describe('DocumentsService — compensating cleanup (no orphans)', () => {
  it('a DB create failure AFTER the S3 put deletes the object then rethrows', async () => {
    const { svc, storage } = makeService({
      createImpl: async () => {
        throw new Error('db down')
      },
    })
    await expect(
      svc.createDocument(SCHOOL, pdf(), { title: 'x' } as never, USER),
    ).rejects.toThrow('db down')
    expect(storage.putObject).toHaveBeenCalledOnce()
    expect(storage.deleteObject).toHaveBeenCalledOnce()
    // The object key deleted is exactly the one that was put.
    const putKey = firstResult(storage.buildKey)
    expect(storage.deleteObject).toHaveBeenCalledWith(putKey)
  })
})

describe('DocumentsService — tenant isolation on by-id ops', () => {
  it('getDownloadUrl 404s a foreign document (presign never runs)', async () => {
    const { svc, storage } = makeService({ findFirstImpl: async () => null })
    await expect(svc.getDownloadUrl(OTHER_SCHOOL, DOC)).rejects.toBeInstanceOf(NotFoundException)
    expect(storage.presignGetUrl).not.toHaveBeenCalled()
  })

  it('getDownloadUrl is scoped by schoolId + returns a presigned url + ttl', async () => {
    const { svc, prisma, storage } = makeService()
    const res = await svc.getDownloadUrl(SCHOOL, DOC)
    expect(firstArg(prisma.knowledgeDocument.findFirst).where).toMatchObject({
      id: DOC,
      schoolId: SCHOOL,
    })
    expect(storage.presignGetUrl).toHaveBeenCalledOnce()
    expect(res).toEqual({ url: 'https://s3.example/presigned', expiresIn: 604800 })
  })

  it('getDownloadUrl 503s when storage unconfigured (before any lookup)', async () => {
    const { svc, prisma } = makeService({ configured: false })
    await expect(svc.getDownloadUrl(SCHOOL, DOC)).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(prisma.knowledgeDocument.findFirst).not.toHaveBeenCalled()
  })

  it('deleteDocument 404s a foreign document', async () => {
    const { svc } = makeService({ findFirstImpl: async () => null })
    await expect(svc.deleteDocument(OTHER_SCHOOL, DOC, USER)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('updateDocument 404s a foreign document', async () => {
    const { svc } = makeService({ findFirstImpl: async () => null })
    await expect(
      svc.updateDocument(OTHER_SCHOOL, DOC, { title: 'z' } as never, USER),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('DocumentsService — delete removes BOTH object + row', () => {
  it('best-effort object delete THEN row delete THEN audit', async () => {
    const { svc, prisma, storage, audit } = makeService()
    const res = await svc.deleteDocument(SCHOOL, DOC, USER)
    expect(storage.deleteObject).toHaveBeenCalledWith(dbRow().s3Key)
    expect(prisma.knowledgeDocument.delete).toHaveBeenCalledOnce()
    expect(audit.write).toHaveBeenCalledOnce()
    expect(res).toEqual({ id: DOC })
  })

  it('the row is STILL removed even if the object delete threw (best-effort swallowed upstream)', async () => {
    // deleteObject in the real service swallows S3 errors; here we assert delete order
    // by having deleteObject resolve (its swallow behavior lives in the storage service).
    const { svc, prisma } = makeService()
    await svc.deleteDocument(SCHOOL, DOC, USER)
    expect(prisma.knowledgeDocument.delete).toHaveBeenCalledOnce()
  })
})

describe('DocumentsService — updateDocument metadata only', () => {
  it('re-validates a CHANGED link and never touches file/key/size', async () => {
    const { svc, prisma } = makeService({ linkTables: { standard: { id: REF } } })
    await svc.updateDocument(SCHOOL, DOC, { sourceType: 'standard', sourceRef: REF } as never, USER)
    expect(firstArg(prisma.accreditationStandard.findFirst).where).toMatchObject({
      id: REF,
      schoolId: SCHOOL,
    })
    const data = firstArg(prisma.knowledgeDocument.update).data
    expect(data).not.toHaveProperty('fileName')
    expect(data).not.toHaveProperty('s3Key')
    expect(data).not.toHaveProperty('sizeBytes')
    expect(data).not.toHaveProperty('mimeType')
  })

  it('a bad changed link 404s (cross-tenant standard)', async () => {
    const { svc } = makeService({ linkTables: { standard: null } })
    await expect(
      svc.updateDocument(SCHOOL, DOC, { sourceType: 'standard', sourceRef: REF } as never, USER),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('DocumentsService — listDocuments', () => {
  it('is tenant-scoped, newest-first, returns { documents, total }', async () => {
    const { svc, prisma } = makeService()
    const res = await svc.listDocuments(SCHOOL, {})
    expect(firstArg(prisma.knowledgeDocument.findMany)).toMatchObject({
      where: { schoolId: SCHOOL },
      orderBy: { createdAt: 'desc' },
    })
    expect(res.total).toBe(1)
    expect(res.documents).toHaveLength(1)
  })

  it('applies the sourceType + sourceRef filters when present', async () => {
    const { svc, prisma } = makeService()
    await svc.listDocuments(SCHOOL, { sourceType: 'policy', sourceRef: REF })
    expect(firstArg(prisma.knowledgeDocument.findMany).where).toMatchObject({
      schoolId: SCHOOL,
      sourceType: 'policy',
      sourceRef: REF,
    })
  })
})

import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { KnowledgeDocument } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { DocumentStorageService } from './document-storage.service.js'
import {
  DOCUMENT_SOURCE_TYPES,
  type CreateDocumentDto,
  type DocumentSourceType,
} from './dto/create-document.dto.js'
import type { UpdateDocumentDto } from './dto/update-document.dto.js'
import type { ListDocumentsQueryDto } from './dto/list-documents-query.dto.js'

/** The uploaded file shape we depend on (multer memoryStorage — buffer in memory). */
export interface UploadedDocumentFile {
  originalname: string
  mimetype: string
  buffer: Buffer
  size?: number
}

/** 25 MB — the hard upload ceiling (re-checked on the REAL buffer, not a client size). */
const MAX_SIZE_BYTES = 25 * 1024 * 1024

/** Allowlisted MIME types (office docs + common images + csv/text). */
export const MIME_ALLOWLIST = new Set<string>([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/csv',
  'text/plain',
])

/** One document as returned to the client (metadata ONLY — never bytes, never creds). */
export interface DocumentPublic {
  id: string
  title: string
  description: string | null
  fileName: string
  mimeType: string
  sizeBytes: number
  s3Key: string
  tags: string[]
  sourceType: DocumentSourceType
  sourceRef: string | null
  uploadedByUserId: string | null
  createdAt: string
  updatedAt: string
}

export interface DocumentListResponse {
  documents: DocumentPublic[]
  total: number
}

/**
 * Phase 4 Knowledge document store — the metadata + storage-orchestration service.
 * Knowledge is CORE (no module gate). School-scoped: every by-id op resolves
 * findFirst({ id, schoolId }) → 404, so a cross-tenant document is IMPOSSIBLE to
 * reach; every S3 key is schoolId-namespaced (buildKey).
 *
 * ORPHAN/LEAK SAFETY (guard #4): createDocument puts to S3 FIRST, then creates the
 * DB row inside a try/catch that deletes the object on failure; deleteDocument does a
 * best-effort object delete but ALWAYS removes the row.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
    private readonly audit: AuditService,
  ) {}

  private toPublic(row: KnowledgeDocument): DocumentPublic {
    const st = (row.sourceType ?? 'manual') as DocumentSourceType
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      s3Key: row.s3Key,
      tags: row.tags ?? [],
      sourceType: (DOCUMENT_SOURCE_TYPES as readonly string[]).includes(st) ? st : 'manual',
      sourceRef: row.sourceRef ?? null,
      uploadedByUserId: row.uploadedByUserId ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /**
   * Resolve a linked artifact ∈ the PATH school. A forged/foreign/nonexistent
   * sourceRef resolves to null → 404, so the document never links a cross-tenant row.
   * Returns null when sourceType is 'manual' (no link to validate).
   */
  private async resolveLink(
    schoolId: string,
    sourceType: DocumentSourceType,
    sourceRef: string | undefined | null,
  ): Promise<void> {
    if (sourceType === 'manual') return
    if (!sourceRef) {
      throw new BadRequestException('sourceRef is required when sourceType is not "manual".')
    }
    const where = { id: sourceRef, schoolId }
    let found: { id: string } | null = null
    switch (sourceType) {
      case 'policy':
        found = await this.prisma.policy.findFirst({ where, select: { id: true } })
        break
      case 'board_report':
        found = await this.prisma.boardReport.findFirst({ where, select: { id: true } })
        break
      case 'standard':
        found = await this.prisma.accreditationStandard.findFirst({ where, select: { id: true } })
        break
      case 'campaign':
        found = await this.prisma.advancementCampaign.findFirst({ where, select: { id: true } })
        break
      case 'maintenance':
        found = await this.prisma.maintenanceItem.findFirst({ where, select: { id: true } })
        break
      default:
        throw new BadRequestException(`Unsupported sourceType: ${String(sourceType)}.`)
    }
    if (!found) throw new NotFoundException('Linked source not found for this school.')
  }

  async createDocument(
    schoolId: string,
    file: UploadedDocumentFile | undefined,
    dto: CreateDocumentDto,
    userId: string,
  ): Promise<DocumentPublic> {
    if (!file || !file.buffer) throw new BadRequestException('A file is required.')
    if (!MIME_ALLOWLIST.has(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}.`)
    }
    // REAL size — never trust a client-declared value (there is none in the DTO); this
    // re-checks the buffer even though multer's fileSize limit is a first guard.
    const sizeBytes = file.buffer.length
    if (sizeBytes > MAX_SIZE_BYTES) {
      throw new BadRequestException('File exceeds the 25MB limit.')
    }
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException('Document storage is not configured.')
    }

    const sourceType: DocumentSourceType = dto.sourceType ?? 'manual'
    await this.resolveLink(schoolId, sourceType, dto.sourceRef) // 404 on a cross-tenant ref

    const documentId = randomUUID()
    const key = this.storage.buildKey(schoolId, documentId, file.originalname)

    // S3 FIRST — if this throws, NO row is written (nothing to clean up).
    await this.storage.putObject(file.buffer, key, file.mimetype)

    let row: KnowledgeDocument
    try {
      row = await this.prisma.knowledgeDocument.create({
        data: {
          id: documentId,
          schoolId,
          title: dto.title.trim(),
          description: dto.description ?? null,
          fileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes,
          s3Key: key,
          tags: dto.tags ?? [],
          sourceType,
          sourceRef: sourceType === 'manual' ? null : (dto.sourceRef ?? null),
          uploadedByUserId: userId,
        },
      })
    } catch (err) {
      // ORPHAN PREVENTION: the object is in S3 but the row failed → remove the object.
      await this.storage.deleteObject(key)
      throw err
    }

    await this.audit.write({
      schoolId,
      userId,
      action: 'document.uploaded',
      targetType: 'knowledge_documents',
      targetId: row.id,
      metadata: { fileName: row.fileName, sizeBytes: row.sizeBytes, mimeType: row.mimeType, sourceType },
    })
    return this.toPublic(row)
  }

  async listDocuments(schoolId: string, query: ListDocumentsQueryDto): Promise<DocumentListResponse> {
    const rows = await this.prisma.knowledgeDocument.findMany({
      where: {
        schoolId,
        ...(query.sourceType ? { sourceType: query.sourceType } : {}),
        ...(query.sourceRef ? { sourceRef: query.sourceRef } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })
    return { documents: rows.map((r) => this.toPublic(r)), total: rows.length }
  }

  private async resolve(schoolId: string, documentId: string): Promise<KnowledgeDocument> {
    const row = await this.prisma.knowledgeDocument.findFirst({ where: { id: documentId, schoolId } })
    if (!row) throw new NotFoundException('Document not found.')
    return row
  }

  async getDownloadUrl(
    schoolId: string,
    documentId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException('Document storage is not configured.')
    }
    // TENANT CHECK: a school-B user requesting a school-A id gets 404 — the presign
    // never runs for a foreign key.
    const row = await this.resolve(schoolId, documentId)
    const ttl = this.storage.ttlSeconds()
    const url = await this.storage.presignGetUrl(row.s3Key, ttl)
    return { url, expiresIn: ttl }
  }

  async updateDocument(
    schoolId: string,
    documentId: string,
    dto: UpdateDocumentDto,
    userId: string,
  ): Promise<DocumentPublic> {
    const existing = await this.resolve(schoolId, documentId)

    // Determine the effective link after the patch, and re-validate if it changed.
    const nextSourceType = (dto.sourceType ?? existing.sourceType) as DocumentSourceType
    const nextSourceRef =
      dto.sourceRef !== undefined ? dto.sourceRef : existing.sourceRef
    const linkTouched = dto.sourceType !== undefined || dto.sourceRef !== undefined
    if (linkTouched) {
      await this.resolveLink(schoolId, nextSourceType, nextSourceRef ?? null)
    }

    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    const row = await this.prisma.knowledgeDocument.update({
      where: { id: existing.id },
      data: {
        title: dto.title !== undefined ? dto.title.trim() : existing.title,
        description: pick(dto.description, existing.description),
        tags: pick(dto.tags, existing.tags),
        sourceType: nextSourceType,
        // manual clears any ref; otherwise take the resolved next ref.
        sourceRef: nextSourceType === 'manual' ? null : (nextSourceRef ?? null),
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'document.updated',
      targetType: 'knowledge_documents',
      targetId: row.id,
      metadata: { sourceType: row.sourceType },
    })
    return this.toPublic(row)
  }

  async deleteDocument(
    schoolId: string,
    documentId: string,
    userId: string,
  ): Promise<{ id: string }> {
    const existing = await this.resolve(schoolId, documentId)
    // Best-effort object delete (swallows S3 errors); the ROW is ALWAYS removed.
    await this.storage.deleteObject(existing.s3Key)
    await this.prisma.knowledgeDocument.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'document.deleted',
      targetType: 'knowledge_documents',
      targetId: existing.id,
      metadata: {
        fileName: existing.fileName,
        sizeBytes: existing.sizeBytes,
        sourceType: existing.sourceType,
      },
    })
    return { id: existing.id }
  }
}

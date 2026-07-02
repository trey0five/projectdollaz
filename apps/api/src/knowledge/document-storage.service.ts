import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { AppConfig } from '../config/configuration.js'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 Knowledge document store — a THIN wrapper over ONE lazily-built S3Client.
//
// FAIL-SAFE (guard #3): the constructor only READS config (never builds the client,
// never throws), so the api BOOTS keyless. The client is built on the FIRST real S3
// op (getClient), and getClient throws ServiceUnavailableException-equivalent only
// when a put/presign/delete is attempted while unconfigured — the controller/service
// pre-check isConfigured() and 503 before ever reaching here.
//
// SECRET SAFETY (guard #1): creds come ONLY from config (env). They are passed to the
// S3Client credentials object and NOWHERE else — never logged, never returned. A
// presigned URL carries a short-lived signature (NOT the secret key) and is safe to
// return.
//
// TENANT ISOLATION (guard #2): buildKey namespaces every object by schoolId AND a
// server-minted documentId, so keys are prefix/schoolId/documentId/safeName — the
// filename is sanitized to a safe basename (no path separators / traversal), and the
// documentId is a uuid the client never controls. Sharing the bucket with another app
// is safe because every key lives under prefix + schoolId.
// ─────────────────────────────────────────────────────────────────────────────

/** Thrown by getClient when a real S3 op is attempted with no creds configured. */
export class StorageNotConfiguredError extends Error {
  constructor() {
    super('Document storage is not configured.')
    this.name = 'StorageNotConfiguredError'
  }
}

@Injectable()
export class DocumentStorageService {
  private readonly logger = new Logger(DocumentStorageService.name)
  private readonly cfg: AppConfig['s3Documents']
  private client: S3Client | null = null

  constructor(config: ConfigService) {
    // configuration() always returns the block (empty-string defaults), so this
    // never throws — the provider constructs even when unconfigured.
    this.cfg = config.getOrThrow<AppConfig['s3Documents']>('s3Documents')
  }

  /** Truth test: bucket + BOTH creds present. region/prefix have benign defaults. */
  isConfigured(): boolean {
    return Boolean(this.cfg.bucket && this.cfg.accessKeyId && this.cfg.secretAccessKey)
  }

  /** TTL (seconds) for presigned download URLs — from config. */
  ttlSeconds(): number {
    return this.cfg.urlTtlSeconds
  }

  // LAZY — the client is never constructed at boot when unconfigured (fail-safe boot).
  private getClient(): S3Client {
    if (!this.isConfigured()) throw new StorageNotConfiguredError()
    if (!this.client) {
      this.client = new S3Client({
        region: this.cfg.region,
        credentials: {
          accessKeyId: this.cfg.accessKeyId,
          secretAccessKey: this.cfg.secretAccessKey,
        },
      })
    }
    return this.client
  }

  /** Strip ALL path separators + unsafe chars, drop leading dots (no `..`), cap length. */
  private sanitizeFileName(name: string): string {
    const base = (name ?? '').split(/[\\/]/).pop() ?? '' // basename only
    const cleaned = base
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 180)
      .trim()
    return cleaned || 'file'
  }

  // key = prefix/schoolId/documentId/sanitized-filename — schoolId-namespaced (tenant
  // isolation in the object store) AND documentId-namespaced (collision-free).
  buildKey(schoolId: string, documentId: string, fileName: string): string {
    const prefix = this.cfg.prefix.replace(/^\/+|\/+$/g, '')
    return `${prefix}/${schoolId}/${documentId}/${this.sanitizeFileName(fileName)}`
  }

  async putObject(buffer: Buffer, key: string, mimeType: string): Promise<void> {
    await this.getClient().send(
      new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: buffer, ContentType: mimeType }),
    )
  }

  async presignGetUrl(key: string, ttlSeconds?: number): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key })
    return getSignedUrl(this.getClient(), cmd, { expiresIn: ttlSeconds ?? this.cfg.urlTtlSeconds })
  }

  // Best-effort: log + swallow so a delete of the DB row is never blocked by S3.
  async deleteObject(key: string): Promise<void> {
    try {
      await this.getClient().send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }))
    } catch (err) {
      this.logger.warn(`S3 deleteObject failed (best-effort): ${String(err)}`)
    }
  }
}

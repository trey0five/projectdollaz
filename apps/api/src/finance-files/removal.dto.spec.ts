import 'reflect-metadata'
import { describe, it, expect } from 'vitest'
import { ValidationPipe } from '@nestjs/common'
import { CreateRemovalDto, RemovalTargetDto, RestoreRemovalDto } from './dto/removal.dto.js'

// The global pipe is forbidNonWhitelisted: every field the web sends must be
// declared, or the request 400s before it reaches the service.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
const run = (metatype: new () => object, body: unknown) => pipe.transform(body, { type: 'body', metatype })

const ID = '0b6f8a52-5d1e-4c1f-9f55-6a0f3c7f2a10'
const ID2 = '7d0c2a1e-3b4f-4a5e-8c6d-9e0f1a2b3c4d'

describe('removal DTOs', () => {
  it('round-trips each kind', async () => {
    await expect(run(RemovalTargetDto, { kind: 'trial_balance', importId: ID })).resolves.toMatchObject({ kind: 'trial_balance', importId: ID })
    await expect(run(RemovalTargetDto, { kind: 'monthly', periodId: ID, monthKeys: ['2025-07', '2026-06'] })).resolves.toMatchObject({ monthKeys: ['2025-07', '2026-06'] })
    await expect(run(RemovalTargetDto, { kind: 'budget', periodId: ID })).resolves.toBeInstanceOf(RemovalTargetDto)
    await expect(run(CreateRemovalDto, { kind: 'trial_balance', importId: ID, expectedImportId: ID2 })).resolves.toMatchObject({ expectedImportId: ID2 })
    await expect(run(RestoreRemovalDto, {})).resolves.toBeInstanceOf(RestoreRemovalDto)
    await expect(run(RestoreRemovalDto, { replaceCurrent: true })).resolves.toMatchObject({ replaceCurrent: true })
  })

  it('an extra field → 400', async () => {
    await expect(run(RemovalTargetDto, { kind: 'budget', periodId: ID, schoolId: ID })).rejects.toMatchObject({ status: 400 })
    await expect(run(RemovalTargetDto, { kind: 'budget', periodId: ID, expectedImportId: ID })).rejects.toMatchObject({ status: 400 })
  })

  it('a bad kind, id or monthKey → 400', async () => {
    await expect(run(RemovalTargetDto, { kind: 'year', periodId: ID })).rejects.toMatchObject({ status: 400 })
    await expect(run(RemovalTargetDto, { kind: 'trial_balance', importId: 'nope' })).rejects.toMatchObject({ status: 400 })
    await expect(run(RemovalTargetDto, { kind: 'monthly', periodId: ID, monthKeys: ['2025-13'] })).rejects.toMatchObject({ status: 400 })
    await expect(run(RemovalTargetDto, { kind: 'monthly', periodId: ID, monthKeys: [] })).rejects.toMatchObject({ status: 400 })
  })

  it("replaceCurrent: 'yes' → 400", async () => {
    await expect(run(RestoreRemovalDto, { replaceCurrent: 'yes' })).rejects.toMatchObject({ status: 400 })
  })
})

import { describe, expect, it, vi } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import { validateSync } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import type { School, User } from '@finrep/db'
import { SchoolsService } from './schools.service.js'
import { UpdateSchoolDto } from './dto/update-school.dto.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import type { MailerService } from '../auth/mailer.service.js'
import type { AuditService } from '../common/audit/audit.service.js'
import type { BillingService } from '../billing/billing.service.js'
import type { DocumentStorageService } from '../knowledge/document-storage.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// SchoolsService.updateSchool — School Comparison profile plumbing + the
// grade-order guard. Plus a UpdateSchoolDto validation spec (enum + whitelist).
// ─────────────────────────────────────────────────────────────────────────────

const ACTOR: User = { id: 'actor1' } as User

function baseSchool(over: Partial<School> = {}): School {
  return {
    id: 's1',
    organizationId: 'org1',
    name: 'Test School',
    netAssetsBegin: 0,
    pyNetAssetsBegin: 0,
    auditNetAssetsBegin: 0,
    logoBase64: null,
    brandColor: null,
    defaultCommittee: null,
    county: null,
    district: null,
    schoolType: null,
    gradeLow: null,
    gradeHigh: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    ...over,
  } as unknown as School
}

function buildService(existing: School) {
  const updateSpy = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    ...existing,
    ...data,
  }))
  const prisma = {
    school: {
      findUnique: async () => existing,
      update: updateSpy,
    },
  } as unknown as PrismaService
  const svc = new SchoolsService(
    prisma,
    {} as unknown as MailerService,
    { write: async () => undefined } as unknown as AuditService,
    {} as unknown as BillingService,
    {} as unknown as DocumentStorageService,
  )
  return { svc, updateSpy }
}

describe('SchoolsService.updateSchool — profile fields', () => {
  it('persists the 5 profile fields and echoes them in the public shape', async () => {
    const { svc, updateSpy } = buildService(baseSchool())
    const res = await svc.updateSchool(
      ACTOR,
      's1',
      {
        county: 'Miami-Dade',
        district: 'D1',
        schoolType: 'K-8',
        gradeLow: 'PK3',
        gradeHigh: '8',
      } as UpdateSchoolDto,
      'owner',
    )
    expect(updateSpy).toHaveBeenCalledOnce()
    const data = updateSpy.mock.calls[0][0].data
    expect(data).toMatchObject({
      county: 'Miami-Dade',
      district: 'D1',
      schoolType: 'K-8',
      gradeLow: 'PK3',
      gradeHigh: '8',
    })
    expect(res).toMatchObject({
      county: 'Miami-Dade',
      district: 'D1',
      schoolType: 'K-8',
      gradeLow: 'PK3',
      gradeHigh: '8',
    })
  })

  it('null clears a profile field', async () => {
    const { svc, updateSpy } = buildService(baseSchool({ county: 'Old' } as Partial<School>))
    await svc.updateSchool(ACTOR, 's1', { county: null } as UpdateSchoolDto, 'owner')
    expect(updateSpy.mock.calls[0][0].data).toMatchObject({ county: null })
  })

  it('rejects gradeLow above gradeHigh (BadRequest)', async () => {
    const { svc } = buildService(baseSchool())
    await expect(
      svc.updateSchool(ACTOR, 's1', { gradeLow: '9', gradeHigh: '5' } as UpdateSchoolDto, 'owner'),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('guards against a new low crossing the STORED high', async () => {
    // Stored high = '2'; PATCH sets low = '8' → effective 8 > 2 must reject.
    const { svc } = buildService(baseSchool({ gradeHigh: '2' } as Partial<School>))
    await expect(
      svc.updateSchool(ACTOR, 's1', { gradeLow: '8' } as UpdateSchoolDto, 'owner'),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('allows an equal low/high', async () => {
    const { svc, updateSpy } = buildService(baseSchool())
    await svc.updateSchool(ACTOR, 's1', { gradeLow: 'K', gradeHigh: 'K' } as UpdateSchoolDto, 'owner')
    expect(updateSpy).toHaveBeenCalledOnce()
  })
})

describe('UpdateSchoolDto validation', () => {
  it('accepts valid profile values', () => {
    const dto = plainToInstance(UpdateSchoolDto, {
      schoolType: 'K-8',
      gradeLow: 'PK3',
      gradeHigh: '12',
      county: 'Alpha',
    })
    expect(validateSync(dto, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0)
  })

  it('rejects an out-of-catalog schoolType', () => {
    const dto = plainToInstance(UpdateSchoolDto, { schoolType: 'University' })
    expect(validateSync(dto).length).toBeGreaterThan(0)
  })

  it('rejects an invalid grade key', () => {
    const dto = plainToInstance(UpdateSchoolDto, { gradeLow: '13' })
    expect(validateSync(dto).length).toBeGreaterThan(0)
  })

  it('rejects an unknown extra field (forbidNonWhitelisted)', () => {
    const dto = plainToInstance(UpdateSchoolDto, { bogusField: 'x' })
    expect(
      validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length,
    ).toBeGreaterThan(0)
  })

  it('allows null to clear a profile field', () => {
    const dto = plainToInstance(UpdateSchoolDto, { schoolType: null, gradeLow: null })
    expect(validateSync(dto, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0)
  })
})

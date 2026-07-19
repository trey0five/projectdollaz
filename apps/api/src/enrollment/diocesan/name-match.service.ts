// ─────────────────────────────────────────────────────────────────────────────
// Name-match DB glue over the PURE @finrep/analytics matcher. Loads an org's
// schools + learned SchoolNameAlias rows into an in-memory index, resolves an
// exact-normalized alias FIRST (short-circuit, tier `alias`), else scores every
// candidate with the pure matcher. The pure layer is authoritative for scoring;
// this layer only supplies candidates + persists learned aliases.
// ─────────────────────────────────────────────────────────────────────────────
import { Injectable } from '@nestjs/common'
import {
  matchSchoolName,
  normalizeSchoolName,
  type MatchCandidate,
  type NameMatchResult,
} from '@finrep/analytics'
import { PrismaService } from '../../prisma/prisma.service.js'

/** The org's candidate schools + its exact-normalized alias lookup. */
export interface OrgMatchIndex {
  candidates: MatchCandidate[]
  /** normalizedName → { schoolId, name } for a learned/manual alias. */
  aliasByNorm: Map<string, MatchCandidate>
}

/** A resolved match for one source name — the review-payload shape. */
export interface ResolvedMatch {
  normalizedName: string
  tier: NameMatchResult['tier']
  /** review-decision status: auto (exact/alias/high) | review | unmatched. */
  decision: 'auto' | 'review' | 'unmatched'
  matchedSchoolId: string | null
  matchedName: string | null
  confidence: number | null
  viaAlias: boolean
  candidates: {
    schoolId: string
    name: string
    confidence: number
    signals: NameMatchResult['ranked'][number]['signals']
  }[]
}

@Injectable()
export class NameMatchService {
  constructor(private readonly prisma: PrismaService) {}

  /** Load the org's schools + learned aliases into a reusable in-memory index. */
  async buildIndex(orgId: string): Promise<OrgMatchIndex> {
    const [schools, aliases] = await Promise.all([
      this.prisma.school.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } }),
      this.prisma.schoolNameAlias.findMany({
        where: { organizationId: orgId },
        include: { school: { select: { id: true, name: true } } },
      }),
    ])
    const candidates: MatchCandidate[] = schools.map((s) => ({ schoolId: s.id, name: s.name }))
    const aliasByNorm = new Map<string, MatchCandidate>()
    for (const a of aliases) {
      aliasByNorm.set(a.alias, { schoolId: a.school.id, name: a.school.name })
    }
    return { candidates, aliasByNorm }
  }

  /** Resolve ONE source name against the index (alias-first, else pure matcher). */
  matchOne(sourceName: string, index: OrgMatchIndex): ResolvedMatch {
    const { normalized } = normalizeSchoolName(sourceName)
    const aliasHit = index.aliasByNorm.get(normalized) ?? null
    const result = matchSchoolName(sourceName, index.candidates, aliasHit)

    const decision: ResolvedMatch['decision'] =
      result.tier === 'alias' || result.tier === 'exact' || result.tier === 'high'
        ? 'auto'
        : result.tier === 'review'
          ? 'review'
          : 'unmatched'

    return {
      normalizedName: normalized,
      tier: result.tier,
      decision,
      matchedSchoolId: result.best?.schoolId ?? null,
      matchedName: result.best?.name ?? null,
      confidence: result.best?.confidence ?? null,
      viaAlias: result.best?.viaAlias ?? false,
      candidates: result.ranked.slice(0, 6).map((c) => ({
        schoolId: c.schoolId,
        name: c.name,
        confidence: c.confidence,
        signals: c.signals,
      })),
    }
  }

  /** Upsert a learned alias (exact-normalized key). @@unique[org,alias] → updates,
   *  never duplicates; bumps hitCount so a repeatedly-confirmed name is reinforced. */
  async learnAlias(
    orgId: string,
    normalizedName: string,
    schoolId: string,
    userId: string | null,
  ): Promise<void> {
    if (!normalizedName) return
    await this.prisma.schoolNameAlias.upsert({
      where: { organizationId_alias: { organizationId: orgId, alias: normalizedName } },
      create: {
        organizationId: orgId,
        alias: normalizedName,
        schoolId,
        origin: 'learned',
        hitCount: 1,
        createdByUserId: userId,
      },
      update: { schoolId, hitCount: { increment: 1 } },
    })
  }
}

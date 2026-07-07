// Topology B (diocesan) org-token accessor — the org twin of
// QboService.connectionForSchool. Given a schoolId with NO direct QboConnection but
// a mapping in its organization's ONE QBO company, this resolves the ORG
// connection's refreshed access token plus the school's mapped dimension value ids
// (Departments/Classes) so the drill + aging services can filter the org company's
// GL / aged reports down to that school's slice (`&department=<ids>`).
//
// DELIBERATELY A LEAF: it depends only on PrismaService + QboClient (+ the pure
// decToken/encToken helpers). It does NOT inject OrgQboCompanyService — that service
// drags in Billing/Imports/Statements/Monthly/Mapping/Audit/QboOrg, and pulling that
// whole subgraph into the drill/aging services would risk the ESM eval-cycle
// boot-crash class (the same gotcha aging dances around with ModuleRef). The token
// rotation logic below is lifted VERBATIM from OrgQboCompanyService.accessToken so
// there is one rotation discipline (decToken/encToken; refresh persisted, never
// out-of-band). QboDrillService injects this plainly (one-directional, no cycle);
// QboAgingService resolves it LAZILY via ModuleRef (keeps its cycle-dodging shape).
import { Injectable } from '@nestjs/common'
import type { OrgQboConnection } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { QboClient } from './qbo.client.js'
import { decToken, encToken } from './qbo-crypto.js'
import type { QboEnvironment } from './qbo-gl.js'
import { NOT_SPECIFIED_ID } from './qbo-company.synth.js'

/** The org connection + token + the school's dimension slice for a filtered pull. */
export interface OrgTokenForSchool {
  conn: OrgQboConnection
  token: string
  env: QboEnvironment
  /** Active split dimension for this org connection. */
  dimension: 'department' | 'class'
  /** REAL QBO dimension value ids for this school (the '__unspecified__' pseudo-value
   *  is dropped — it carries no id to filter by). Empty ⇒ the school maps ONLY to
   *  "Not Specified", which cannot be `&department=`-filtered (caller keeps the
   *  honest unsupported/panel state). */
  filterableQboIds: string[]
  /** True when this school's mapping includes the '__unspecified__' pseudo-value. */
  includesUnspecified: boolean
  /** Display names of the filterable (real) values, index-aligned with filterableQboIds. */
  dimensionNames: string[]
}

@Injectable()
export class OrgQboTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: QboClient,
  ) {}

  /**
   * Resolve the org connection + refreshed token + this school's mapped dimension
   * ids. Returns null when the school has no org connection or no mapping in the
   * active dimension (the caller then keeps its honest not-connected state). A
   * school mapped ONLY to '__unspecified__' returns a NON-null result with
   * `filterableQboIds:[]` + `includesUnspecified:true` (the caller distinguishes that
   * infeasible case from "no mapping at all").
   */
  async forSchool(schoolId: string): Promise<OrgTokenForSchool | null> {
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } })
    if (!school) return null
    const conn = await this.prisma.orgQboConnection.findUnique({
      where: { organizationId: school.organizationId },
    })
    if (!conn) return null
    const dimension: 'department' | 'class' = conn.dimension === 'class' ? 'class' : 'department'
    const rows = await this.prisma.orgQboMapping.findMany({
      where: { connectionId: conn.id, dimension, schoolId },
    })
    if (rows.length === 0) return null

    const real = rows.filter((r) => r.qboId !== NOT_SPECIFIED_ID)
    const includesUnspecified = rows.some((r) => r.qboId === NOT_SPECIFIED_ID)
    const token = await this.accessToken(conn)
    const env: QboEnvironment = conn.environment === 'production' ? 'production' : 'sandbox'
    return {
      conn,
      token,
      env,
      dimension,
      filterableQboIds: real.map((r) => r.qboId),
      includesUnspecified,
      dimensionNames: real.map((r) => r.qboName),
    }
  }

  /**
   * A valid access token for the ORG connection, refreshing (and persisting the
   * rotated refresh token) when near expiry. Lifted verbatim from
   * OrgQboCompanyService.accessToken — the SAME rotation discipline (decToken on
   * read, encToken on persist, in-memory conn kept in sync so a later refresh in the
   * same batch doesn't replay the now-invalid old refresh token).
   */
  private async accessToken(conn: OrgQboConnection): Promise<string> {
    if (conn.expiresAt.getTime() - Date.now() > 60_000) return decToken(conn.accessToken)
    const tokens = await this.client.refresh(decToken(conn.refreshToken))
    const expiresAt = new Date(Date.now() + tokens.expiresInSec * 1000)
    await this.prisma.orgQboConnection.update({
      where: { id: conn.id },
      data: {
        accessToken: encToken(tokens.accessToken),
        refreshToken: encToken(tokens.refreshToken),
        expiresAt,
      },
    })
    conn.accessToken = tokens.accessToken
    conn.refreshToken = tokens.refreshToken
    conn.expiresAt = expiresAt
    return tokens.accessToken
  }
}

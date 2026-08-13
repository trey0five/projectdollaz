import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { DataExportService } from './export.service.js'

/**
 * Data export — the school taking a complete copy of its own records.
 *
 * OWNER ONLY, and deliberately not entitlement-gated.
 *
 * The role floor is owner because one archive contains every student name, every
 * gift, every salary-adjacent figure and the full audit log: it is the widest
 * read in the product, so it needs the narrowest door. A business manager can
 * export their own domains from the pages that own them.
 *
 * There is NO @RequiresModule and no billing check ON PURPOSE. A school whose
 * subscription has lapsed is exactly the school that most needs its data, and a
 * "you own your data" promise that stops working when payment does is not a
 * promise. This route answers for a school on its way out.
 */
@Controller('schools/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DataExportController {
  constructor(private readonly exports: DataExportService) {}

  @Post('export')
  @Roles('owner')
  request(@CurrentUser() user: User, @Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.exports.request(user, schoolId)
  }

  @Get('exports')
  @Roles('owner')
  list(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.exports.list(schoolId)
  }

  @Get('exports/:id/download')
  @Roles('owner')
  download(
    @CurrentUser() user: User,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.exports.downloadUrl(user, schoolId, id)
  }
}

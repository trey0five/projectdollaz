import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { PeriodsService } from './periods.service.js'
import { CreatePeriodDto } from './dto/create-period.dto.js'

@Controller('schools/:schoolId/periods')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PeriodsController {
  constructor(private readonly periods: PeriodsService) {}

  // Create-or-get a fiscal period. owner/accountant only.
  @Post()
  @Roles('owner', 'accountant')
  create(@Param('schoolId') schoolId: string, @Body() dto: CreatePeriodDto) {
    return this.periods.createOrGetPublic(schoolId, dto)
  }

  // List periods (newest-first) with coverage annotations. Any active member.
  @Get()
  @Roles('owner', 'accountant', 'viewer')
  list(@Param('schoolId') schoolId: string) {
    return this.periods.listPeriods(schoolId)
  }
}

import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { MappingService } from './mapping.service.js'

@Controller('schools/:schoolId/mapping')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MappingController {
  constructor(private readonly mapping: MappingService) {}

  // Seed-on-read: returns (and ensures) the school's active mapping/chart versions.
  @Get()
  @Roles('owner', 'accountant', 'viewer')
  get(@Param('schoolId') schoolId: string) {
    return this.mapping.getActive(schoolId)
  }
}

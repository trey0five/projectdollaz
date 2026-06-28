import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { MappingService } from './mapping.service.js'
import { MergeMappingDto } from './dto/merge-mapping.dto.js'

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

  // Merge account→category picks (from Resolve-unmatched) into the active mapping
  // so they persist for future imports. Write — owner/accountant only.
  @Patch()
  @Roles('owner', 'accountant')
  merge(@Param('schoolId') schoolId: string, @Body() dto: MergeMappingDto) {
    return this.mapping.mergeEntries(schoolId, dto.entries)
  }
}

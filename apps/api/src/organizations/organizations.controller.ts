import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { OrganizationsService } from './organizations.service.js'
import { RenameOrganizationDto } from './dto/rename-organization.dto.js'
import { DeleteOrganizationDto } from './dto/delete-organization.dto.js'

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get('me')
  myOrganization(@CurrentUser() user: User) {
    return this.orgs.myOrganization(user)
  }

  @Patch(':orgId')
  rename(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @Body() dto: RenameOrganizationDto,
  ) {
    return this.orgs.renameOrganization(user, orgId, dto.name)
  }

  // Right-to-deletion (whole org). Requires owning EVERY school + typed-name
  // confirmation. Irreversible.
  @Delete(':orgId')
  deleteOrg(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @Body() dto: DeleteOrganizationDto,
  ) {
    return this.orgs.deleteOrganization(user, orgId, dto.confirmName)
  }
}

import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { GovernanceImportService } from './governance-import.service.js'
import { ImportCommitteesCommitDto, ImportPeopleCommitDto, ImportPeoplePreviewDto } from './dto/governance-import.dto.js'

/** 10 MB — a board roster is a few KB; the cap is for a stray workbook. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

interface UploadedTable {
  buffer: Buffer
  size: number
}

/**
 * Governance file imports (#46): a board roster / people list and a committee
 * list, any column names. Same guard stack and module gate as the forms.
 */
@Controller('schools/:schoolId/governance/import')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('governance')
export class GovernanceImportController {
  constructor(private readonly imports: GovernanceImportService) {}

  @Post('people/preview')
  @Roles('owner', 'accountant')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }))
  previewPeople(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @UploadedFile() file: UploadedTable | undefined,
    @Body() dto: ImportPeoplePreviewDto,
  ) {
    return this.imports.previewPeople(schoolId, file, { defaultGroup: dto.defaultGroup })
  }

  @Post('people/commit')
  @Roles('owner', 'accountant')
  commitPeople(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: ImportPeopleCommitDto,
    @CurrentUser() user: User,
  ) {
    return this.imports.commitPeople(schoolId, dto.rows, user.id)
  }

  @Post('committees/preview')
  @Roles('owner', 'accountant')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }))
  previewCommittees(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @UploadedFile() file: UploadedTable | undefined,
  ) {
    return this.imports.previewCommittees(schoolId, file)
  }

  @Post('committees/commit')
  @Roles('owner', 'accountant')
  commitCommittees(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: ImportCommitteesCommitDto,
    @CurrentUser() user: User,
  ) {
    return this.imports.commitCommittees(schoolId, dto.rows, user.id)
  }
}

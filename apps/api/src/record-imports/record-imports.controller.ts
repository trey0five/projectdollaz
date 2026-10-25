// Four thin controllers so each target keeps ITS module's gate (@RequiresModule
// is class-level). Paths: schools/:schoolId/import/<target>/{preview,commit}.
import {
  BadRequestException,
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
import { RecordImportsService } from './record-imports.service.js'
import { GovernanceImportService } from '../governance/governance-import.service.js'
import { ImportMappingDto, ImportPeopleCommitDto } from '../governance/dto/governance-import.dto.js'
import { parseMappingField } from '../common/import-mapping.js'
import { tableBytes } from '../common/upload-bytes.js'
import {
  ImportCampaignsCommitDto,
  ImportGiftsCommitDto,
  ImportMaintenanceCommitDto,
  ImportStandardsCommitDto,
} from './dto/record-imports.dto.js'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const upload = () => UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }))

interface UploadedTable {
  buffer: Buffer
}

@Controller('schools/:schoolId/import/maintenance')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('facilities')
export class MaintenanceImportController {
  constructor(private readonly imports: RecordImportsService) {}
  @Post('preview')
  @Roles('owner', 'accountant')
  @upload()
  preview(@Param('schoolId', ParseUUIDPipe) schoolId: string, @UploadedFile() file: UploadedTable | undefined, @Body() dto: ImportMappingDto) {
    return this.imports.preview(schoolId, 'maintenance', file, parseMappingField(dto.mapping))
  }
  @Post('commit')
  @Roles('owner', 'accountant')
  commit(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Body() dto: ImportMaintenanceCommitDto, @CurrentUser() user: User) {
    return this.imports.commitMaintenance(schoolId, dto.rows, user.id)
  }
}

@Controller('schools/:schoolId/import/gifts')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('advancement')
export class GiftsImportController {
  constructor(private readonly imports: RecordImportsService) {}
  @Post('preview')
  @Roles('owner', 'accountant')
  @upload()
  preview(@Param('schoolId', ParseUUIDPipe) schoolId: string, @UploadedFile() file: UploadedTable | undefined, @Body() dto: ImportMappingDto) {
    return this.imports.preview(schoolId, 'gifts', file, parseMappingField(dto.mapping))
  }
  @Post('commit')
  @Roles('owner', 'accountant')
  commit(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Body() dto: ImportGiftsCommitDto, @CurrentUser() user: User) {
    return this.imports.commitGifts(schoolId, dto.rows, user.id)
  }
}

@Controller('schools/:schoolId/import/campaigns')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('advancement')
export class CampaignsImportController {
  constructor(private readonly imports: RecordImportsService) {}
  @Post('preview')
  @Roles('owner', 'accountant')
  @upload()
  preview(@Param('schoolId', ParseUUIDPipe) schoolId: string, @UploadedFile() file: UploadedTable | undefined, @Body() dto: ImportMappingDto) {
    return this.imports.preview(schoolId, 'campaigns', file, parseMappingField(dto.mapping))
  }
  @Post('commit')
  @Roles('owner', 'accountant')
  commit(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Body() dto: ImportCampaignsCommitDto, @CurrentUser() user: User) {
    return this.imports.commitCampaigns(schoolId, dto.rows, user.id)
  }
}

@Controller('schools/:schoolId/import/standards')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('accreditation')
export class StandardsImportController {
  constructor(private readonly imports: RecordImportsService) {}
  @Post('preview')
  @Roles('owner', 'accountant')
  @upload()
  preview(@Param('schoolId', ParseUUIDPipe) schoolId: string, @UploadedFile() file: UploadedTable | undefined, @Body() dto: ImportMappingDto) {
    return this.imports.preview(schoolId, 'standards', file, parseMappingField(dto.mapping))
  }
  @Post('commit')
  @Roles('owner', 'accountant')
  commit(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Body() dto: ImportStandardsCommitDto, @CurrentUser() user: User) {
    return this.imports.commitStandards(schoolId, dto.rows, user.id)
  }
}

/** A staff list is the governance people import with the staff group, behind the HR gate. */
@Controller('schools/:schoolId/import/staff')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('hr')
export class StaffImportController {
  constructor(private readonly people: GovernanceImportService) {}
  @Post('preview')
  @Roles('owner', 'accountant')
  @upload()
  preview(@Param('schoolId', ParseUUIDPipe) schoolId: string, @UploadedFile() file: UploadedTable | undefined, @Body() dto: ImportMappingDto) {
    return this.people.previewPeople(schoolId, file as { buffer: Buffer }, { defaultGroup: 'staff', mapping: parseMappingField(dto.mapping) }).then((p) => ({
      ...p,
      // The generic preview shape: `record` is what the commit takes back.
      rows: p.rows.map((r) => ({ row: r.row, action: r.action, existingId: r.existingId, record: r.person, issues: r.issues })),
    }))
  }
  @Post('commit')
  @Roles('owner', 'accountant')
  commit(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Body() dto: ImportPeopleCommitDto, @CurrentUser() user: User) {
    return this.people.commitPeople(schoolId, dto.rows, user.id).then((r) => ({ ...r, skipped: 0 }))
  }
}

/**
 * #52 — the browser-side finance paths (This-year intake, Add years, Monthly,
 * Budget, the upload sorter) parse in the browser; a PDF is sent here first and
 * comes back as the table it printed, as an .xlsx. Any signed-in editor of the
 * school; no module gate (every module's uploads use it).
 */
@Controller('schools/:schoolId/import/pdf-table')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class PdfTableController {
  @Post()
  @Roles('owner', 'accountant')
  @upload()
  async convert(@Param('schoolId', ParseUUIDPipe) schoolId: string, @UploadedFile() file: (UploadedTable & { originalname?: string }) | undefined) {
    void schoolId
    if (!file?.buffer?.length) throw new BadRequestException('No file uploaded.')
    const out = await tableBytes(file)
    if (!out || out.buffer === file.buffer) throw new BadRequestException('That file isn’t a PDF.')
    return { fileName: out.originalname ?? 'table.xlsx', xlsxBase64: out.buffer.toString('base64') }
  }
}

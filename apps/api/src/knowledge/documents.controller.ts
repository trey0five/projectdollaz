import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { DocumentsService, type UploadedDocumentFile } from './documents.service.js'
import { CreateDocumentDto } from './dto/create-document.dto.js'
import { UpdateDocumentDto } from './dto/update-document.dto.js'
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto.js'

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/**
 * Phase 4 Knowledge document store — the document routes. Knowledge is CORE: the same
 * guard chain as SearchController (JwtAuthGuard 401 → RolesGuard 403 → EntitlementGuard
 * 402 for a wholly-unentitled school) but NO @RequiresModule, so any entitled school of
 * any licensed mix can reach it.
 *
 * The upload is SERVER-SIDE multipart: the browser POSTs multipart/form-data, multer
 * (memoryStorage, 25MB fileSize limit) parses the file into req.file; the TEXT fields
 * are the @Body (CreateDocumentDto — every field whitelisted). The file is
 * @UploadedFile() and is NOT in the DTO, so it never trips forbidNonWhitelisted.
 */
@Controller('schools/:schoolId/knowledge/documents')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @Roles('owner', 'accountant')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @UploadedFile() file: UploadedDocumentFile | undefined,
    @Body() dto: CreateDocumentDto,
    @CurrentUser() user: User,
  ) {
    return this.documents.createDocument(schoolId, file, dto, user.id)
  }

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  list(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query() query: ListDocumentsQueryDto,
  ) {
    return this.documents.listDocuments(schoolId, query)
  }

  @Get(':documentId/download-url')
  @Roles('owner', 'accountant', 'viewer')
  downloadUrl(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.documents.getDownloadUrl(schoolId, documentId)
  }

  @Patch(':documentId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: User,
  ) {
    return this.documents.updateDocument(schoolId, documentId, dto, user.id)
  }

  @Delete(':documentId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: User,
  ) {
    return this.documents.deleteDocument(schoolId, documentId, user.id)
  }
}

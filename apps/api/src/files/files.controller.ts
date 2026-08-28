import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ERROR_CODES, FILE_PURPOSES, type FilePurpose } from '@loadless/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { AppException } from '../common/app.exception';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { FilesService, MAX_UPLOAD_BYTES } from './files.service';

const purposeSchema = z.object({ purpose: z.enum(FILE_PURPOSES) });

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload')
  @Roles('ADMIN', 'VENDOR')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query(new ZodValidationPipe(purposeSchema)) query: { purpose: FilePurpose },
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) {
      throw AppException.validation([{ field: 'file', message: 'A file is required' }]);
    }
    // Vendors may only upload their own logo; driver photos are admin-managed.
    if (user.role === 'VENDOR' && query.purpose !== 'VENDOR_LOGO') {
      throw AppException.forbidden();
    }
    return this.files.store(file.buffer, query.purpose, user);
  }

  @Get(':purpose/:filename')
  async download(
    @Param('purpose') purpose: string,
    @Param('filename') filename: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const key = `${purpose}/${filename}`;
    if (!/^[a-z_]+\/[a-z0-9]+\.(jpg|png|webp)$/.test(key)) {
      throw new AppException(ERROR_CODES.NOT_FOUND, 'File not found', HttpStatus.NOT_FOUND);
    }
    const download = await this.files.download(key, user);
    if (download.kind === 'redirect') {
      res.redirect(HttpStatus.TEMPORARY_REDIRECT, download.url);
      return;
    }
    res.setHeader('Content-Type', download.contentType);
    res.setHeader('Content-Length', download.sizeBytes);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    download.stream.pipe(res);
  }
}

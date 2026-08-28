import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES, type FilePurpose } from '@loadless/shared';
import { fromBuffer } from 'file-type';
import { randomBytes } from 'node:crypto';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { StorageService, type StorageDownload } from './storage.interface';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Content is validated by magic bytes — the client's MIME type and filename
   * are ignored entirely. Keys are server-generated.
   */
  async store(buffer: Buffer, purpose: FilePurpose, owner: AuthUser): Promise<{ key: string }> {
    const sniffed = await fromBuffer(buffer);
    const ext = sniffed ? ALLOWED[sniffed.mime] : undefined;
    if (!sniffed || !ext) {
      throw new AppException(
        ERROR_CODES.FILE_TYPE_NOT_ALLOWED,
        'Only JPEG, PNG, or WebP images are accepted',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    const key = `${purpose.toLowerCase()}/${randomBytes(16).toString('hex')}.${ext}`;
    await this.storage.put(key, buffer, sniffed.mime);
    await this.prisma.fileObject.create({
      data: {
        key,
        purpose,
        ownerUserId: owner.userId,
        contentType: sniffed.mime,
        sizeBytes: buffer.length,
      },
    });
    return { key };
  }

  /**
   * Authorization by purpose: logos are visible to any signed-in user;
   * driver photos only to admins and the driver they belong to.
   */
  async download(key: string, requester: AuthUser): Promise<StorageDownload> {
    const file = await this.prisma.fileObject.findUnique({ where: { key } });
    if (!file) throw AppException.notFound('File not found');

    if (file.purpose === 'DRIVER_FACE' || file.purpose === 'DRIVER_BIKE') {
      const allowed = requester.role === 'ADMIN' || requester.userId === file.ownerUserId;
      if (!allowed) throw AppException.notFound('File not found'); // no existence leak
    }

    return this.storage.getDownload(file.key, file.contentType, file.sizeBytes);
  }
}

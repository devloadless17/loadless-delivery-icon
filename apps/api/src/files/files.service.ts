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
  /**
   * Drop a file and its row. Used when the entity that referenced it is being
   * deleted, so it never fails the caller: a stranded blob is untidy, but an
   * owner row that survives because its logo could not be unlinked is worse.
   * Callers must already have authorised the delete of the OWNING entity —
   * there is no per-file permission check here.
   */
  async removeByKey(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      // Already gone, or the backend is unhappy — the row still goes.
    }
    await this.prisma.fileObject.deleteMany({ where: { key } });
  }

  async download(key: string, requester: AuthUser): Promise<StorageDownload> {
    const file = await this.prisma.fileObject.findUnique({ where: { key } });
    if (!file) throw AppException.notFound('File not found');

    if (file.purpose === 'DRIVER_FACE' || file.purpose === 'DRIVER_BIKE') {
      // NOT ownerUserId: these are uploaded by the ADMIN filling in the driver
      // form, so the owner is that admin. The photo keys on the driver row are
      // the only honest link between a file and the person in it.
      const driver =
        requester.role === 'ADMIN'
          ? null
          : await this.prisma.driver.findFirst({
              where: { OR: [{ facePhotoKey: key }, { bikePhotoKey: key }] },
              select: { id: true, userId: true },
            });

      const allowed =
        requester.role === 'ADMIN' ||
        // The driver themselves.
        (requester.role === 'DRIVER' && driver?.userId === requester.userId) ||
        // A vendor this driver has actually carried an order for — and ONLY
        // the face, which answers "is this the right person at my counter".
        // The bike photo stays with the platform.
        (file.purpose === 'DRIVER_FACE' &&
          requester.role === 'VENDOR' &&
          !!requester.vendorId &&
          !!driver &&
          (await this.prisma.order.count({
            where: { vendorId: requester.vendorId, driverId: driver.id },
          })) > 0);

      if (!allowed) throw AppException.notFound('File not found'); // no existence leak
    }

    return this.storage.getDownload(file.key, file.contentType, file.sizeBytes);
  }
}

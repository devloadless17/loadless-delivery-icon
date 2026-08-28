import { Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppConfigService } from '../config/config.service';
import { StorageService, type StorageDownload } from './storage.interface';

const PRESIGN_TTL_SECONDS = 15 * 60;

/**
 * Cloudflare R2 (S3-compatible). One private bucket; downloads are authorized
 * by the API first, then served via a short-lived presigned redirect — the
 * container filesystem never holds production uploads.
 */
@Injectable()
export class R2StorageService extends StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: AppConfigService) {
    super();
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = config.env;
    this.bucket = R2_BUCKET as string;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID as string,
        secretAccessKey: R2_SECRET_ACCESS_KEY as string,
      },
    });
  }

  async put(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: contentType }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async getDownload(key: string): Promise<StorageDownload> {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );
    return { kind: 'redirect', url };
  }
}

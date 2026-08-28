import type { Readable } from 'node:stream';

export type StorageDownload =
  | { kind: 'stream'; stream: Readable; contentType: string; sizeBytes: number }
  | { kind: 'redirect'; url: string };

/**
 * Storage backend seam. Local filesystem in dev; R2 (S3-compatible presigned
 * redirects) in production. Nothing outside FilesModule touches storage.
 */
export abstract class StorageService {
  abstract put(key: string, buffer: Buffer, contentType: string): Promise<void>;
  abstract delete(key: string): Promise<void>;
  abstract getDownload(key: string, contentType: string, sizeBytes: number): Promise<StorageDownload>;
}

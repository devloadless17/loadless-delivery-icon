import { Injectable } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { AppConfigService } from '../config/config.service';
import { StorageService, type StorageDownload } from './storage.interface';

@Injectable()
export class LocalFsStorageService extends StorageService {
  private readonly root: string;

  constructor(config: AppConfigService) {
    super();
    this.root = resolve(config.env.LOCAL_STORAGE_DIR);
  }

  /** Keys are server-generated, but never trust a path anyway. */
  private safePath(key: string): string {
    const path = resolve(this.root, normalize(key));
    if (!path.startsWith(this.root + '/')) {
      throw new Error(`Refusing storage path outside root: ${key}`);
    }
    return path;
  }

  async put(key: string, buffer: Buffer, _contentType: string): Promise<void> {
    const path = this.safePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buffer);
  }

  async delete(key: string): Promise<void> {
    await rm(this.safePath(key), { force: true });
  }

  async getDownload(key: string, contentType: string, sizeBytes: number): Promise<StorageDownload> {
    return {
      kind: 'stream',
      stream: createReadStream(this.safePath(key)),
      contentType,
      sizeBytes,
    };
  }
}

export function localStoragePath(root: string, key: string): string {
  return join(root, key);
}

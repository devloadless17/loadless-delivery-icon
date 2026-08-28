import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { LocalFsStorageService } from './local-fs.storage';
import { StorageService } from './storage.interface';

@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    {
      provide: StorageService,
      inject: [AppConfigService, LocalFsStorageService],
      useFactory: (config: AppConfigService, local: LocalFsStorageService) => {
        // R2 adapter lands in the production-hardening phase; env is already
        // validated so a misconfigured driver fails at boot, not first upload.
        if (config.env.STORAGE_DRIVER === 'r2') {
          throw new Error('STORAGE_DRIVER=r2 requires the R2 adapter (production phase)');
        }
        return local;
      },
    },
    LocalFsStorageService,
  ],
  exports: [FilesService],
})
export class FilesModule {}

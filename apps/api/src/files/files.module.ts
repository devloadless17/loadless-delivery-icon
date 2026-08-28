import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { LocalFsStorageService } from './local-fs.storage';
import { R2StorageService } from './r2.storage';
import { StorageService } from './storage.interface';

@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    LocalFsStorageService,
    {
      provide: StorageService,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        // Env is validated at boot; R2 creds are guaranteed present when driver=r2.
        config.env.STORAGE_DRIVER === 'r2'
          ? new R2StorageService(config)
          : new LocalFsStorageService(config),
    },
  ],
  exports: [FilesService],
})
export class FilesModule {}

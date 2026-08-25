import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { R2Storage } from './r2.storage.js';
import { STORAGE } from './storage.interface.js';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new R2Storage(config);
      },
    },
  ],
  exports: [STORAGE],
})
export class StorageModule {}

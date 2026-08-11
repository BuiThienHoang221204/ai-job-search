import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorage } from './local.storage.js';
import { STORAGE } from './storage.interface.js';

/// Khi lên cloud, thêm S3Storage và mở rộng switch ở đây. Không module nào khác
/// phải biết đến sự thay đổi đó.
@Global()
@Module({
  providers: [
    {
      provide: STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>('storage.driver');
        switch (driver) {
          case 'local':
            return new LocalStorage(config);
          default:
            throw new Error(`STORAGE_DRIVER chưa được hỗ trợ: ${driver}`);
        }
      },
    },
  ],
  exports: [STORAGE],
})
export class StorageModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { S3Provider } from './providers/s3.provider';
import { LocalProvider } from './providers/local.provider';
import storageConfig from '../../config/storage.config';

@Module({
  imports: [ConfigModule.forFeature(storageConfig)],
  providers: [StorageService, S3Provider, LocalProvider],
  exports: [StorageService],
})
export class StorageModule {}

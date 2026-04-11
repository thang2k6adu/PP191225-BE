import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { S3Provider } from './providers/s3.provider';
import { LocalProvider } from './providers/local.provider';
import storageConfig from '../../config/storage.config';
import { StorageController } from './storage.controller';
import { PrismaService } from '@/database/prisma.service';

@Module({
  imports: [ConfigModule.forFeature(storageConfig)],
  controllers: [StorageController],
  providers: [StorageService, S3Provider, LocalProvider, PrismaService],
  exports: [StorageService],
})
export class StorageModule {}

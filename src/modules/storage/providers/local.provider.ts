import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { StorageProvider, UploadOptions, UploadProviderResult } from './storage-provider.interface';

@Injectable()
export class LocalProvider implements StorageProvider {
  private destination: string;

  constructor(private configService: ConfigService) {
    this.destination = join(
      process.cwd(),
      this.configService.get<string>('storage.local.destination') || 'uploads',
    );
  }

  async upload(options: UploadOptions): Promise<UploadProviderResult> {
    const filePath = join(this.destination, options.key);

    await this.ensureDirectoryExists(dirname(filePath));
    await writeFile(filePath, options.buffer);

    return {
      url: `/uploads/${options.key}`,
      key: options.key,
      size: options.buffer.length,
      mimetype: options.mimetype,
    };
  }

  async delete(key: string): Promise<void> {
    const filePath = join(this.destination, key);
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
  }

  private async ensureDirectoryExists(dir: string): Promise<void> {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }
}

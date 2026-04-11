import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

export interface UploadOptions {
  buffer: Buffer;
  key: string;
  mimetype: string;
}

@Injectable()
export class LocalProvider {
  private destination: string;

  constructor(private configService: ConfigService) {
    this.destination = join(
      process.cwd(),
      this.configService.get<string>('storage.local.destination') || 'uploads',
    );
  }

  async upload(
    options: UploadOptions,
  ): Promise<{ url: string; key: string; size: number; mimetype: string }> {
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

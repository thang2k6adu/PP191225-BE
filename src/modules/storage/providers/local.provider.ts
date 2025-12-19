import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
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
    this.destination = this.configService.get<string>('storage.local.destination') || './uploads';
    this.ensureDirectoryExists();
  }

  async upload(
    options: UploadOptions,
  ): Promise<{ url: string; key: string; size: number; mimetype: string }> {
    const filePath = join(this.destination, options.key);
    await writeFile(filePath, options.buffer);

    const url = `/uploads/${options.key}`;

    return {
      url,
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

  async getSignedUrl(
    key: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _expiresIn?: number,
  ): Promise<string> {
    // For local storage, return the public URL
    return `/uploads/${key}`;
  }

  private async ensureDirectoryExists(): Promise<void> {
    if (!existsSync(this.destination)) {
      await mkdir(this.destination, { recursive: true });
    }
  }
}

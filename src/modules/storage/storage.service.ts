import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Provider } from './providers/s3.provider';
import { LocalProvider } from './providers/local.provider';
import * as sharp from 'sharp';

export interface UploadFileOptions {
  file: Express.Multer.File;
  folder?: string;
  resize?: { width?: number; height?: number };
  quality?: number;
}

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  mimetype: string;
}

@Injectable()
export class StorageService {
  private provider: S3Provider | LocalProvider;

  constructor(
    private configService: ConfigService,
    private s3Provider: S3Provider,
    private localProvider: LocalProvider,
  ) {
    const providerType = this.configService.get<string>('storage.provider');
    this.provider = providerType === 's3' ? this.s3Provider : this.localProvider;
  }

  async uploadFile(options: UploadFileOptions): Promise<UploadResult> {
    this.validateFile(options.file);

    let fileBuffer = options.file.buffer;

    // Process image if needed
    if (options.resize && this.isImage(options.file.mimetype)) {
      fileBuffer = await this.processImage(fileBuffer, options.resize, options.quality);
    }

    const key = this.generateKey(options.file.originalname, options.folder);

    return this.provider.upload({
      buffer: fileBuffer,
      key,
      mimetype: options.file.mimetype,
    });
  }

  async deleteFile(key: string): Promise<void> {
    await this.provider.delete(key);
  }

  async getSignedUrl(key: string, expiresIn?: number): Promise<string> {
    return this.provider.getSignedUrl(key, expiresIn);
  }

  private validateFile(file: Express.Multer.File): void {
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds maximum limit of 10MB');
    }

    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} is not allowed`);
    }
  }

  private isImage(mimetype: string): boolean {
    return mimetype.startsWith('image/');
  }

  private async processImage(
    buffer: Buffer,
    resize?: { width?: number; height?: number },
    quality?: number,
  ): Promise<Buffer> {
    let image = sharp(buffer);

    if (resize?.width || resize?.height) {
      image = image.resize(resize.width, resize.height, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    if (quality) {
      image = image.jpeg({ quality });
    }

    return image.toBuffer();
  }

  private generateKey(originalname: string, folder?: string): string {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const extension = originalname.split('.').pop();
    const filename = `${timestamp}-${randomString}.${extension}`;
    return folder ? `${folder}/${filename}` : filename;
  }
}

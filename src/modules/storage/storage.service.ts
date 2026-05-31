import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Provider } from './providers/s3.provider';
import { LocalProvider } from './providers/local.provider';
import { CloudinaryProvider } from './providers/cloudinary.provider';
import { StorageProvider } from './providers/storage-provider.interface';
import { PrismaService } from '@/database/prisma.service';
import sharp from 'sharp';

export interface UploadFileOptions {
  file: any;
  folder?: string;
  userId?: string;
  resize?: { width?: number; height?: number };
  quality?: number;
}

export interface UploadResult {
  id: string;
  url: string;
  key: string;
  size: number;
  mimetype: string;
}

@Injectable()
export class StorageService {
  private provider: StorageProvider;
  private providerType: string;

  constructor(
    private configService: ConfigService,
    private s3Provider: S3Provider,
    private localProvider: LocalProvider,
    private cloudinaryProvider: CloudinaryProvider,
    private prisma: PrismaService,
  ) {
    this.providerType = this.configService.get<string>('storage.provider') || 'local';
    this.provider = this.resolveProvider(this.providerType);
  }

  private resolveProvider(providerType: string): StorageProvider {
    switch (providerType) {
      case 's3':
        return this.s3Provider;
      case 'cloudinary':
        return this.cloudinaryProvider;
      default:
        return this.localProvider;
    }
  }

  async uploadFile(options: UploadFileOptions): Promise<UploadResult> {
    this.validateFile(options.file);

    let fileBuffer = options.file.buffer;

    // Process image if needed
    if (options.resize && this.isImage(options.file.mimetype)) {
      fileBuffer = await this.processImage(fileBuffer, options.resize, options.quality);
    }

    const key = this.generateKey(options.file.originalname, options.folder);

    // Upload to storage provider
    const result = await this.provider.upload({
      buffer: fileBuffer,
      key,
      mimetype: options.file.mimetype,
    });

    // Save record to database
    const fileRecord = await this.prisma.file.create({
      data: {
        key: result.key,
        url: result.url,
        filename: options.file.originalname,
        mimetype: result.mimetype,
        size: result.size,
        provider: this.providerType,
        folder: options.folder,
        userId: options.userId,
      },
    });

    return {
      id: fileRecord.id,
      url: result.url,
      key: result.key,
      size: result.size,
      mimetype: result.mimetype,
    };
  }

  async deleteFile(fileId: string, user: any): Promise<void> {
    // 1. Find file in DB
    const fileRecord = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!fileRecord) {
      throw new NotFoundException('File not found');
    }

    // 2. Check authorization
    // Admin can delete any file. User can only delete their own file.
    if (user.role !== 'ADMIN' && fileRecord.userId !== user.id) {
      throw new ForbiddenException('You do not have permission to delete this file');
    }

    // 3. Delete file from storage
    try {
      await this.provider.delete(fileRecord.key);
    } catch (error) {
      // Log error but proceed to delete from DB or handle accordingly
      console.error(`Failed to delete file from storage: ${fileRecord.key}`, error);
    }

    // 4. Delete record from DB
    await this.prisma.file.delete({
      where: { id: fileId },
    });
  }

  private validateFile(file: any): void {
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

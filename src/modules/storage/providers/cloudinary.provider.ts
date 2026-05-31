import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import { StorageProvider, UploadOptions, UploadProviderResult } from './storage-provider.interface';

@Injectable()
export class CloudinaryProvider implements StorageProvider {
  private readonly configured: boolean;

  constructor(private configService: ConfigService) {
    const cloudName = this.configService.get<string>('storage.cloudinary.cloudName');
    const apiKey = this.configService.get<string>('storage.cloudinary.apiKey');
    const apiSecret = this.configService.get<string>('storage.cloudinary.apiSecret');

    this.configured = Boolean(cloudName && apiKey && apiSecret);

    if (this.configured) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
    }
  }

  async upload(options: UploadOptions): Promise<UploadProviderResult> {
    this.ensureConfigured();

    const publicId = this.toPublicId(options.key);
    const result = await this.uploadBuffer(options.buffer, {
      public_id: publicId,
      resource_type: this.getResourceType(options.key, options.mimetype),
      overwrite: true,
    });

    return {
      url: result.secure_url,
      key: options.key,
      size: result.bytes ?? options.buffer.length,
      mimetype: options.mimetype,
    };
  }

  async delete(key: string): Promise<void> {
    this.ensureConfigured();

    const publicId = this.toPublicId(key);
    await cloudinary.uploader.destroy(publicId, {
      resource_type: this.getResourceType(key),
      invalidate: true,
    });
  }

  private ensureConfigured(): void {
    if (!this.configured) {
      throw new InternalServerErrorException(
        'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
      );
    }
  }

  private uploadBuffer(
    buffer: Buffer,
    options: { public_id: string; resource_type: 'image' | 'raw' | 'video'; overwrite: boolean },
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        if (!result) {
          reject(new Error('Cloudinary upload returned no result'));
          return;
        }
        resolve(result);
      });

      Readable.from(buffer).pipe(uploadStream);
    });
  }

  /** Cloudinary public_id must not include the file extension. */
  private toPublicId(key: string): string {
    return key.replace(/\.[^/.]+$/, '');
  }

  private getResourceType(key: string, mimetype?: string): 'image' | 'raw' | 'video' {
    if (mimetype?.startsWith('image/')) {
      return 'image';
    }
    if (mimetype === 'application/pdf' || mimetype === 'text/plain') {
      return 'raw';
    }

    const ext = key.split('.').pop()?.toLowerCase();
    if (ext === 'pdf' || ext === 'txt') {
      return 'raw';
    }
    if (ext === 'mp4' || ext === 'webm') {
      return 'video';
    }

    return 'image';
  }
}

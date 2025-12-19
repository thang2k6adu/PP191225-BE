import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface UploadOptions {
  buffer: Buffer;
  key: string;
  mimetype: string;
}

@Injectable()
export class S3Provider {
  private s3Client: S3Client;
  private bucket: string;

  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get<string>('storage.s3.region'),
      credentials: {
        accessKeyId: this.configService.get<string>('storage.s3.accessKeyId') || '',
        secretAccessKey: this.configService.get<string>('storage.s3.secretAccessKey') || '',
      },
    });
    this.bucket = this.configService.get<string>('storage.s3.bucket') || '';
  }

  async upload(
    options: UploadOptions,
  ): Promise<{ url: string; key: string; size: number; mimetype: string }> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: options.key,
      Body: options.buffer,
      ContentType: options.mimetype,
    });

    await this.s3Client.send(command);

    const url = `https://${this.bucket}.s3.amazonaws.com/${options.key}`;

    return {
      url,
      key: options.key,
      size: options.buffer.length,
      mimetype: options.mimetype,
    };
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.s3Client.send(command);
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }
}

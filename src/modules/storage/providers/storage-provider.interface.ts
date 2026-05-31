export interface UploadOptions {
  buffer: Buffer;
  key: string;
  mimetype: string;
}

export interface UploadProviderResult {
  url: string;
  key: string;
  size: number;
  mimetype: string;
}

export interface StorageProvider {
  upload(options: UploadOptions): Promise<UploadProviderResult>;
  delete(key: string): Promise<void>;
}

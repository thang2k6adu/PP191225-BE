import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  provider: process.env.STORAGE_PROVIDER || 'local', // 'local' | 's3' | 'cloudinary'
  local: {
    destination: process.env.STORAGE_LOCAL_DEST || './uploads',
  },
  s3: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucket: process.env.AWS_S3_BUCKET,
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
}));

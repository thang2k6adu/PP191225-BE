import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class FirebaseLoginDto {
  @ApiProperty({
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMzQ1Njc4OTAiLCJ0eXAiOiJKV1QifQ...',
    description: 'Firebase ID token from client',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiProperty({
    example: 'web_chrome_123',
    description:
      'Device identifier for multi-device management (optional - can be omitted for testing)',
    required: false,
  })
  @IsString()
  @IsOptional()
  deviceId?: string;

  @ApiProperty({
    example: 'web',
    description: 'Platform identifier (web, ios, android) (optional - can be omitted for testing)',
    required: false,
  })
  @IsString()
  @IsOptional()
  platform?: string;
}

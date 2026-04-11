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
    description: 'Device identifier for multi-device management (optional)',
    required: false,
  })
  @IsString()
  @IsOptional()
  deviceId?: string;

  @ApiProperty({
    example: 'web',
    description: 'Platform identifier (web, ios, android) (optional)',
    required: false,
  })
  @IsString()
  @IsOptional()
  platform?: string;

  @ApiProperty({
    example: 'Nguyen Van',
    description:
      'First name provided by client (used when Firebase token does not carry a display name, e.g. email/password sign-up)',
    required: false,
  })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({
    example: 'A',
    description: 'Last name provided by client (optional)',
    required: false,
  })
  @IsString()
  @IsOptional()
  lastName?: string;
}

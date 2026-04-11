import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({ example: 'user@example.com', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'password123', required: false })
  @IsString()
  @IsOptional()
  @MinLength(6)
  password?: string;

  @ApiProperty({ example: 'John', required: false })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({ example: 'Doe', required: false })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty({ example: 'https://example.com/avatar.jpg', required: false })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiProperty({ example: 'Học viện Công nghệ Bưu chính Viễn thông', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  work?: string;

  @ApiProperty({ example: 'Công nghệ thông tin định hướng Ứng dụng', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  major?: string;

  @ApiProperty({ example: "What would happen if you knew you couldn't fail?", required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  bio?: string;
}

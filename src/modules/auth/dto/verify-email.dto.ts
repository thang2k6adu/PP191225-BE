import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'The email address of the user to send verification to',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({
    example: 'Nguyen Van',
    description: 'First name of the user (provided during email/password sign-up)',
    required: false,
  })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({
    example: 'A',
    description: 'Last name of the user (provided during email/password sign-up)',
    required: false,
  })
  @IsString()
  @IsOptional()
  lastName?: string;
}

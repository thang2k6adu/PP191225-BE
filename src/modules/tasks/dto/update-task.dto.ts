import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsEnum,
  Min,
  MaxLength,
} from 'class-validator';
import { TaskStatus } from '@prisma/client';

export class UpdateTaskDto {
  @ApiProperty({ example: 'Build authentication module', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiProperty({ example: 6, required: false })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0)
  estimateHours?: number;

  @ApiProperty({ example: '2025-12-30', required: false })
  @IsDateString()
  @IsOptional()
  deadline?: string;

  @ApiProperty({ enum: TaskStatus, required: false })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsBoolean, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';
import { TaskStatus } from '@prisma/client';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

function toTaskStatusArray(value: unknown): TaskStatus[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const rawValues = Array.isArray(value) ? value : String(value).split(',');
  const statuses = rawValues
    .map((item) => String(item).trim().toUpperCase())
    .filter(Boolean) as TaskStatus[];

  return statuses.length > 0 ? statuses : undefined;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (value === true || value === 'true' || value === '1') {
    return true;
  }

  if (value === false || value === 'false' || value === '0') {
    return false;
  }

  return undefined;
}

export class QueryTasksDto extends PaginationQueryDto {
  @ApiProperty({
    enum: TaskStatus,
    required: false,
    description: 'Filter by a single task status',
  })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @ApiProperty({
    enum: TaskStatus,
    isArray: true,
    required: false,
    description:
      'Filter by multiple statuses. Accepts repeated query params or comma-separated values, e.g. statuses=PLANNED,ACTIVE',
    example: ['PLANNED', 'ACTIVE'],
  })
  @IsOptional()
  @Transform(({ value }) => toTaskStatusArray(value))
  @IsArray()
  @IsEnum(TaskStatus, { each: true })
  statuses?: TaskStatus[];

  @ApiProperty({
    required: false,
    default: false,
    description: 'When true, excludes tasks with status DONE',
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  excludeDone?: boolean;

  @ApiProperty({
    example: true,
    required: false,
    description: 'Filter by whether the task is currently active',
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    example: 'authentication',
    required: false,
    description: 'Case-insensitive search by task name',
  })
  @IsString()
  @IsOptional()
  search?: string;
}

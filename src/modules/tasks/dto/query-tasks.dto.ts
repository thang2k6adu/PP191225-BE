import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskStatus } from '@prisma/client';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

export class QueryTasksDto extends PaginationQueryDto {
  @ApiProperty({ enum: TaskStatus, required: false })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiProperty({ example: 'authentication', required: false })
  @IsString()
  @IsOptional()
  search?: string;
}

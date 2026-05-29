import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

export class QueryUsersDto extends PaginationQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => String)
  search?: string;
}

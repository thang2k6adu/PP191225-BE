import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum TaskStatsPeriod {
  DAY = 'day',
  MONTH = 'month',
  YEAR = 'year',
}

export class QueryTaskStatsDto {
  @ApiProperty({
    enum: TaskStatsPeriod,
    required: false,
    default: TaskStatsPeriod.MONTH,
    description: 'Aggregation period for stats buckets',
  })
  @IsEnum(TaskStatsPeriod)
  @IsOptional()
  period?: TaskStatsPeriod = TaskStatsPeriod.MONTH;

  @ApiProperty({
    example: '2026-04-19',
    required: false,
    description: 'Anchor date for period calculation (ISO date). Defaults to now.',
  })
  @IsDateString()
  @IsOptional()
  anchorDate?: string;
}

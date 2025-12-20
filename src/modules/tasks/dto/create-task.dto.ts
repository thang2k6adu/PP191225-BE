import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsDateString, Min, MaxLength } from 'class-validator';

export class CreateTaskDto {
  @ApiProperty({ example: 'Build authentication module' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 6, description: 'Estimated hours to complete the task' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimateHours: number;

  @ApiProperty({ example: '2025-12-30', description: 'Task deadline date' })
  @IsDateString()
  @IsNotEmpty()
  deadline: string;
}

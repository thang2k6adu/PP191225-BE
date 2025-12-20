import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class StopExpTrackingDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Task ID' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  taskId: string;
}

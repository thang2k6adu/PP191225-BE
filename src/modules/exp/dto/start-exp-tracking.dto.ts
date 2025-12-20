import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsUUID, IsOptional } from 'class-validator';

export class StartExpTrackingDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Task ID' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  taskId: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440001',
    description: 'Room ID',
    required: false,
  })
  @IsString()
  @IsOptional()
  @IsUUID()
  roomId?: string;
}

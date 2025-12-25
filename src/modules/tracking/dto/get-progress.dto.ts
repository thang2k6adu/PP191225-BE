import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GetProgressDto {
  @ApiProperty({
    description: 'Task ID to get progress for',
    example: 'task-uuid',
  })
  @IsUUID()
  taskId: string;
}

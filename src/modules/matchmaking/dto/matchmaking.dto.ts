import { IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class JoinMatchmakingDto {
  @ApiProperty({
    description: 'Topic to match for',
    example: 'math',
    enum: ['math', 'coding', 'english', 'pomodoro'],
  })
  @IsString()
  @IsEnum(['math', 'coding', 'english', 'pomodoro'])
  topic: string;
}

export class MatchmakingResponseDto {
  @ApiProperty()
  status: 'MATCHED' | 'WAITING';

  @ApiProperty()
  message: string;

  @ApiProperty({ required: false })
  @IsOptional()
  matchData?: {
    roomId: string;
    livekitRoomName: string;
    token: string;
    opponentId: string;
  };

  @ApiProperty({ required: false })
  @IsOptional()
  suggestPublicRooms?: Array<{
    id: string;
    topic: string;
    currentMembers: number;
  }>;
}

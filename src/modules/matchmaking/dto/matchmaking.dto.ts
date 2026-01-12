import { IsString, IsEnum } from 'class-validator';
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
  status: 'MATCHED';

  @ApiProperty()
  message: string;

  @ApiProperty()
  matchData: {
    roomId: string;
    livekitRoomName: string;
    token: string;
  };
}

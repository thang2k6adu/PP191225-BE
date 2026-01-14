import { IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class JoinMatchmakingDto {
  // No parameters needed for random matching
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
  };
}

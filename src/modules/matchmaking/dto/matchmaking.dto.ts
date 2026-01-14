import { IsOptional, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class JoinMatchmakingDto {
  // No parameters needed for random matching
  // Adding optional placeholder to make class-validator happy
  @IsOptional()
  @ValidateIf(() => false) // Never validate this field
  @ApiProperty({ required: false, description: 'Placeholder field - not used' })
  _placeholder?: any;
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
